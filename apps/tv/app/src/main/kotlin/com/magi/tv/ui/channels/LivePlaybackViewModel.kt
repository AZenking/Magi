package com.magi.tv.ui.channels

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.magi.tv.data.repository.LastChannelStore
import com.magi.tv.domain.model.Channel
import com.magi.tv.domain.model.ChannelGroup
import com.magi.tv.domain.model.Programme
import com.magi.tv.domain.repository.ContentSyncRepository
import com.magi.tv.domain.repository.DiagnosticsRepository
import com.magi.tv.domain.usecase.GetChannelCatalogUseCase
import com.magi.tv.domain.usecase.GetProgrammeGuideUseCase
import com.magi.tv.domain.usecase.PlaybackResolution
import com.magi.tv.domain.usecase.ResolvePlaybackUseCase
import com.magi.tv.playback.Media3PlaybackSession
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/** Classified errors for distinct recovery actions (constitution VIII). */
sealed interface TvError {
    val message: String
    data class Network(override val message: String) : TvError
    data class Unauthorized(override val message: String) : TvError
    data class Format(override val message: String) : TvError
    data class Empty(override val message: String) : TvError
    data class Playback(override val message: String) : TvError
    data class Other(override val message: String) : TvError
}

/** UI state for the persistent live-playback surface. */
data class LivePlaybackUiState(
    val allChannels: List<Channel> = emptyList(),
    val groups: List<ChannelGroup> = emptyList(),
    val currentIndex: Int = 0,
    val selectedGroup: String? = null,
    val loading: Boolean = true,
    val catalogError: TvError? = null,
    val guide: List<Programme> = emptyList(),
    val guideLoading: Boolean = false,
    val guideError: TvError? = null,
    val guideStale: Boolean = false,
    val selectedDate: LocalDate = LocalDate.now(),
    val focusedChannelId: String? = null,
    /** Channel id awaiting first frame before the sheet closes; null = no pending tune.
     *  Using channelId (not Boolean) prevents an OLD channel's firstFrame from
     *  satisfying the close condition for a NEW channel. */
    val pendingTuneChannelId: String? = null,
    /** When a tune initiated from the side sheet fails asynchronously (e.g.
     *  ExoPlayer 404 / timeout after switchChannel returned), this holds the
     *  error message so the side sheet can show it instead of silently
     *  hanging. Cleared on the next tune attempt. */
    val tuneError: String? = null,
)

/** A cache entry for EPG: programmes + expiry timestamp. */
private data class EpgCacheEntry(val programmes: List<Programme>, val expiresAt: Long)

/**
 * Owns the persistent live player: the complete channel directory, the current
 * channel index, the [Media3PlaybackSession], EPG caching/debounce, and
 * last-watched-channel persistence.
 *
 * `allChannels` is the single source of truth for channel-surfing + resume.
 * `displayedChannels` is derived locally (no re-fetch) from the selected group
 * — group filtering never changes the surf order.
 */
@UnstableApi
class LivePlaybackViewModel(
    context: Context,
    private val getChannelCatalog: GetChannelCatalogUseCase,
    private val resolvePlayback: ResolvePlaybackUseCase,
    private val getProgrammeGuide: GetProgrammeGuideUseCase,
    private val lastChannelStore: LastChannelStore,
    diagnosticsRepository: DiagnosticsRepository,
    private val contentSyncRepository: ContentSyncRepository? = null,
    private val clientSessionRepository: com.magi.tv.domain.repository.ClientSessionRepository? = null,
) : ViewModel() {

    val session = Media3PlaybackSession(
        context = context.applicationContext,
        diagnosticsRepository = diagnosticsRepository,
    ).also { s ->
        // Fix 4: wire playback report callback to the server (008 US3).
        if (clientSessionRepository != null) {
            s.reportPlayback = { channelId, streamId, errorKind, playedDurationMs ->
                viewModelScope.launch {
                    runCatching {
                        clientSessionRepository.reportPlayback(
                            com.magi.tv.domain.repository.PlaybackReport(
                                channelId = channelId,
                                streamId = streamId,
                                outcome = com.magi.tv.domain.repository.PlaybackOutcome.FAILURE,
                                errorKind = errorKind,
                                playedDurationMs = playedDurationMs,
                            ),
                        )
                    }
                }
            }
        }
    }

    private val mutableUiState = MutableStateFlow(LivePlaybackUiState())
    val uiState = mutableUiState.asStateFlow()

    /** Channels currently shown in the side sheet (group-filtered view of allChannels). */
    val displayedChannels: List<Channel>
        get() {
            val state = mutableUiState.value
            val group = state.selectedGroup
            return if (group == null) state.allChannels
            else state.allChannels.filter { it.group == group }
        }

    private var firstPlayDone = false
    private var switchJob: Job? = null
    private var guideJob: Job? = null
    private val epgCache = mutableMapOf<String, EpgCacheEntry>()

    init {
        loadCatalogAndResume()
        contentSyncRepository?.let { contentSync ->
            viewModelScope.launch {
                contentSync.changes.collect { change ->
                    if (change.catalogChanged) reloadCatalogPreservingCurrent()
                    if (change.epgChanged) refreshFocusedGuide()
                }
            }
        }
        // Watch for asynchronous playback failures (e.g. ExoPlayer 404 / timeout).
        // When the player reports a terminalError while a tune from the side
        // sheet is pending, clear the pending id and surface the error so the
        // sheet doesn't hang silently.
        viewModelScope.launch {
            session.state.collect { playerState ->
                val pending = mutableUiState.value.pendingTuneChannelId
                if (pending != null &&
                    playerState.terminalError != null &&
                    playerState.channelId == pending
                ) {
                    mutableUiState.value = mutableUiState.value.copy(
                        pendingTuneChannelId = null,
                        tuneError = playerState.terminalError,
                    )
                }
            }
        }
        // Fix 5: Periodically refresh the current channel's playback decision
        // so signed URLs don't go stale during long viewing sessions.
        viewModelScope.launch {
            while (true) {
                kotlinx.coroutines.delay(60_000L)
                val currentChannelId = session.state.value.channelId
                if (currentChannelId.isNotBlank() && session.state.value.terminalError == null) {
                    runCatching { resolvePlayback(currentChannelId) }
                }
            }
        }
    }

    /** Derived channel list for the side sheet (group-filtered). */
    fun displayedChannelList(): List<Channel> = displayedChannels

    private fun loadCatalogAndResume(group: String? = null) {
        mutableUiState.value = mutableUiState.value.copy(
            loading = true,
            catalogError = null,
            selectedGroup = group,
        )
        viewModelScope.launch {
            val catalog = try {
                getChannelCatalog(null) // always load ALL channels for surf order
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutableUiState.value = mutableUiState.value.copy(
                    loading = false,
                    catalogError = classifyError(e),
                )
                return@launch
            }
            val channels = catalog.channels
            if (channels.isEmpty()) {
                mutableUiState.value = mutableUiState.value.copy(
                    allChannels = emptyList(),
                    groups = catalog.groups,
                    loading = false,
                    catalogError = TvError.Empty("没有可见频道"),
                )
                return@launch
            }
            // Resume last channel if present in the full directory.
            val lastId = lastChannelStore.lastChannelId.first()
            val resumeIndex = lastId?.let { id -> channels.indexOfFirst { it.id == id } }
                ?.takeIf { it >= 0 }
            if (lastId != null && resumeIndex == null) {
                // Channel no longer visible — clear stale record.
                lastChannelStore.clear()
            }
            val startIndex = resumeIndex ?: 0
            mutableUiState.value = mutableUiState.value.copy(
                allChannels = channels,
                groups = catalog.groups,
                currentIndex = startIndex,
                loading = false,
                focusedChannelId = channels.getOrNull(startIndex)?.id,
            )
            playCurrent(initialPlay = !firstPlayDone)
        }
    }

    /** Apply a catalog revision without resetting the current playback channel. */
    private suspend fun reloadCatalogPreservingCurrent() {
        val previousState = mutableUiState.value
        val previousChannelId = previousState.allChannels
            .getOrNull(previousState.currentIndex)?.id
        val catalog = try {
            getChannelCatalog(null)
        } catch (_: Exception) {
            return
        }
        if (catalog.channels.isEmpty()) return

        val nextIndex = previousChannelId
            ?.let { id -> catalog.channels.indexOfFirst { it.id == id } }
            ?.takeIf { it >= 0 }
            ?: previousState.currentIndex.coerceIn(0, catalog.channels.lastIndex)
        val nextChannelId = catalog.channels.getOrNull(nextIndex)?.id
        val nextFocusedId = previousState.focusedChannelId
            ?.takeIf { id -> catalog.channels.any { it.id == id } }
            ?: nextChannelId
        mutableUiState.value = previousState.copy(
            allChannels = catalog.channels,
            groups = catalog.groups,
            currentIndex = nextIndex,
            focusedChannelId = nextFocusedId,
            loading = false,
            catalogError = null,
        )
        if (previousChannelId != nextChannelId) playCurrent(initialPlay = false)
    }

    private fun refreshFocusedGuide() {
        val focusedId = mutableUiState.value.focusedChannelId ?: return
        guideJob?.cancel()
        guideJob = viewModelScope.launch {
            loadGuideNow(focusedId, mutableUiState.value.selectedDate)
        }
    }

    /** Select a group for the side sheet display (does NOT re-fetch or change surf order). */
    fun selectGroup(group: String?) {
        mutableUiState.value = mutableUiState.value.copy(selectedGroup = group)
    }

    /** Switch to the prev/next channel by [delta] in allChannels. */
    fun switchBy(delta: Int) {
        val channels = mutableUiState.value.allChannels
        if (channels.isEmpty()) return
        val next = (mutableUiState.value.currentIndex + delta)
            .coerceIn(0, channels.lastIndex)
        if (next == mutableUiState.value.currentIndex) return
        mutableUiState.value = mutableUiState.value.copy(currentIndex = next)
        playCurrent(initialPlay = false)
    }

    /** Jump directly to a channel (e.g. picked from the side sheet). */
    fun switchToChannel(channel: Channel) {
        val channels = mutableUiState.value.allChannels
        val index = channels.indexOfFirst { it.id == channel.id }
        if (index < 0) return
        mutableUiState.value = mutableUiState.value.copy(currentIndex = index)
        playCurrent(initialPlay = false)
    }

    /**
     * Tune to the channel that currently has focus in the side sheet. Used by
     * the OK key handler when the sheet is open (the parent's onPreviewKeyEvent
     * can't always route OK to the LazyColumn item, so we drive it from here).
     */
    fun tuneFocusedChannel() {
        val focusedId = mutableUiState.value.focusedChannelId ?: return
        val channel = mutableUiState.value.allChannels.find { it.id == focusedId } ?: return
        requestTune(channel)
    }

    /**
     * User pressed OK on a channel in the side sheet: set pendingTune, switch
     * playback, but do NOT close the sheet yet — the screen closes it only when
     * the new channel reaches its first frame (constitution VIII: failed tune
     * keeps the sheet open for retry).
     */
    fun requestTune(channel: Channel) {
        mutableUiState.value = mutableUiState.value.copy(
            pendingTuneChannelId = channel.id,
            tuneError = null, // clear previous failure
        )
        switchToChannel(channel)
    }

    /**
     * Tune the current playing channel (used when user presses OK on the
     * "正在播出" programme card). Uses allChannels[currentIndex] — the real
     * playing channel, regardless of the side sheet's group filter.
     */
    fun tuneCurrent() {
        val channel = mutableUiState.value.allChannels.getOrNull(mutableUiState.value.currentIndex)
        if (channel != null) requestTune(channel)
    }

    /** Called by the screen when first frame of the tuned channel is confirmed. */
    fun onTuneSucceeded() {
        mutableUiState.value = mutableUiState.value.copy(pendingTuneChannelId = null)
    }

    /** Called by the screen when a tune fails (no line / network / decode). */
    fun onTuneFailed(error: TvError) {
        mutableUiState.value = mutableUiState.value.copy(pendingTuneChannelId = null)
    }

    private fun playCurrent(initialPlay: Boolean) {
        val channel = mutableUiState.value.allChannels.getOrNull(mutableUiState.value.currentIndex)
            ?: return
        switchJob?.cancel()
        switchJob = viewModelScope.launch {
            session.clearError()
            try {
                when (val result = resolvePlayback(channel.id)) {
                    is PlaybackResolution.Ready -> {
                        session.switchChannel(
                            channelId = channel.id,
                            channelName = channel.name,
                            decision = result.decision,
                            initialPlay = initialPlay,
                            channelLogo = channel.logo,
                        )
                        firstPlayDone = true
                        lastChannelStore.save(channel.id)
                    }
                    is PlaybackResolution.Unavailable -> {
                        session.switchChannel(
                            channelId = channel.id,
                            channelName = channel.name,
                            channelLogo = channel.logo,
                            decision = com.magi.tv.domain.model.PlaybackDecision(
                                channelId = channel.id,
                                playable = false,
                                primary = null,
                                fallbacks = emptyList(),
                                decisionExpiresAt = "",
                                deliveryMode = "direct",
                            ),
                            initialPlay = initialPlay,
                        )
                        if (mutableUiState.value.pendingTuneChannelId != null) {
                            onTuneFailed(TvError.Playback(result.message))
                        }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (mutableUiState.value.pendingTuneChannelId != null) {
                    onTuneFailed(classifyError(e))
                }
            }
        }
    }

    /** Focus moved to a channel in the sheet — debounce then load its EPG. */
    fun onChannelFocused(channelId: String) {
        mutableUiState.value = mutableUiState.value.copy(focusedChannelId = channelId)
        loadGuideDebounced(channelId)
    }

    fun selectDate(date: LocalDate) {
        mutableUiState.value = mutableUiState.value.copy(selectedDate = date)
        val focused = mutableUiState.value.focusedChannelId
        if (focused != null) loadGuideDebounced(focused)
    }

    private fun loadGuideDebounced(channelId: String) {
        val date = mutableUiState.value.selectedDate
        val cacheKey = guideCacheKey(channelId, date)
        // Cache hit?
        epgCache[cacheKey]?.let { entry ->
            if (entry.expiresAt > System.currentTimeMillis()) {
                mutableUiState.value = mutableUiState.value.copy(
                    guide = entry.programmes,
                    guideLoading = false,
                    guideError = null,
                    guideStale = false,
                )
                prefetchAdjacent(channelId)
                return
            }
        }
        guideJob?.cancel()
        guideJob = viewModelScope.launch {
            delay(250) // debounce: only load after focus is stable
            loadGuideNow(channelId, date)
        }
    }

    /** The latest guide request key — stale responses are rejected. */
    private var currentGuideRequestKey: String? = null
    private var prefetchJob: Job? = null

    private suspend fun loadGuideNow(channelId: String, date: LocalDate) {
        val requestKey = "$channelId-$date"
        currentGuideRequestKey = requestKey
        mutableUiState.value = mutableUiState.value.copy(guideLoading = true, guideError = null)
        val zone = ZoneId.systemDefault()
        val fromEpoch = date.atStartOfDay(zone).toInstant().toEpochMilli()
        val toEpoch = date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        try {
            val ids = adjacentChannelIds(channelId)
            val programmesByChannel = getProgrammeGuide.batch(ids, fromEpoch, toEpoch)
            val programmes = programmesByChannel[channelId.removePrefix("magi:")].orEmpty()
            // Reject stale response: if the user moved focus since this request,
            // don't overwrite the current guide state.
            if (currentGuideRequestKey != requestKey) return
            val ttl = if (date == LocalDate.now()) 5 * 60 * 1000L else 30 * 60 * 1000L
            val expiresAt = System.currentTimeMillis() + ttl
            programmesByChannel.forEach { (id, guide) ->
                epgCache[guideCacheKey(id, date)] = EpgCacheEntry(guide, expiresAt)
            }
            val stale = getProgrammeGuide.isStale(channelId, fromEpoch, toEpoch)
            mutableUiState.value = mutableUiState.value.copy(
                guide = programmes,
                guideLoading = false,
                guideError = null,
                guideStale = stale,
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // If cache exists, keep showing it but mark stale.
            val cacheKey = guideCacheKey(channelId, date)
            val cached = epgCache[cacheKey]?.programmes ?: emptyList()
            mutableUiState.value = mutableUiState.value.copy(
                guide = cached,
                guideLoading = false,
                guideError = if (cached.isEmpty()) classifyError(e) else null,
                guideStale = cached.isNotEmpty(),
            )
        }
        prefetchAdjacent(channelId)
    }

    /** Prefetch EPG for neighbors of [channelId] in the displayed list. */
    private fun prefetchAdjacent(channelId: String) {
        val list = mutableUiState.value.allChannels
        val idx = list.indexOfFirst { it.id == channelId }
        if (idx < 0) return
        val date = mutableUiState.value.selectedDate
        val neighbors = listOfNotNull(list.getOrNull(idx - 1), list.getOrNull(idx + 1))
            .filter { guideCacheKey(it.id, date) !in epgCache }
        if (neighbors.isEmpty()) return
        prefetchJob?.cancel()
        prefetchJob = viewModelScope.launch {
            runCatching {
                val zone = ZoneId.systemDefault()
                val from = date.atStartOfDay(zone).toInstant().toEpochMilli()
                val to = date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
                val guides = getProgrammeGuide.batch(neighbors.map { it.id }, from, to)
                val ttl = if (date == LocalDate.now()) 5 * 60 * 1000L else 30 * 60 * 1000L
                val expiresAt = System.currentTimeMillis() + ttl
                guides.forEach { (id, guide) ->
                    epgCache[guideCacheKey(id, date)] = EpgCacheEntry(guide, expiresAt)
                }
            }
        }
    }

    private fun adjacentChannelIds(channelId: String): List<String> {
        val list = mutableUiState.value.allChannels
        val idx = list.indexOfFirst { it.id == channelId }
        return listOfNotNull(
            list.getOrNull(idx),
            list.getOrNull(idx - 1),
            list.getOrNull(idx + 1),
        ).map { it.id.removePrefix("magi:") }.distinct()
    }

    private fun guideCacheKey(channelId: String, date: LocalDate): String =
        "${channelId.removePrefix("magi:")}-$date"

    private fun classifyError(e: Exception): TvError {
        // TokenException carries the exact reason (client disabled/revoked/invalid).
        if (e is com.magi.tv.data.auth.TokenException) {
            val msg = e.message.orEmpty()
            return when {
                "禁用" in msg -> TvError.Unauthorized(msg)
                "吊销" in msg -> TvError.Unauthorized(msg)
                "无效" in msg -> TvError.Unauthorized(msg)
                else -> TvError.Other(msg.ifEmpty { "认证失败" })
            }
        }
        val msg = e.message.orEmpty()
        return when {
            "401" in msg || "Unauthorized" in msg -> TvError.Unauthorized("认证失败，客户端凭证可能无效或已被禁用")
            "Unable to resolve host" in msg || "timeout" in msg || "Network" in msg -> TvError.Network("网络连接失败，请检查网络后重试")
            else -> TvError.Other(msg.ifEmpty { "未知错误" })
        }
    }

    override fun onCleared() {
        super.onCleared()
        session.release()
    }

    companion object {
        fun factory(
            context: Context,
            getChannelCatalog: GetChannelCatalogUseCase,
            resolvePlayback: ResolvePlaybackUseCase,
            getProgrammeGuide: GetProgrammeGuideUseCase,
            lastChannelStore: LastChannelStore,
            diagnosticsRepository: DiagnosticsRepository,
            contentSyncRepository: ContentSyncRepository? = null,
            clientSessionRepository: com.magi.tv.domain.repository.ClientSessionRepository? = null,
        ) = object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = LivePlaybackViewModel(
                context = context.applicationContext,
                getChannelCatalog = getChannelCatalog,
                resolvePlayback = resolvePlayback,
                getProgrammeGuide = getProgrammeGuide,
                lastChannelStore = lastChannelStore,
                diagnosticsRepository = diagnosticsRepository,
                contentSyncRepository = contentSyncRepository,
                clientSessionRepository = clientSessionRepository,
            ) as T
        }
    }
}
