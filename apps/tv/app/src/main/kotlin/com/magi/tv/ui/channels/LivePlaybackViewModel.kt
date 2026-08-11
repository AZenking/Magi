package com.magi.tv.ui.channels

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.magi.tv.data.repository.ChannelPreferencesStore
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
    val selectedChannelFilter: ChannelDirectoryFilter = ChannelDirectoryFilter.All,
    val favoriteChannelIds: Set<String> = emptySet(),
    val recentChannelIds: List<String> = emptyList(),
    val loading: Boolean = true,
    val catalogError: TvError? = null,
    val guidesByChannel: Map<String, EpgChannelGuideState> = emptyMap(),
    val guideWindow: EpgTimeWindow = EpgTimeWindow.aroundNow(System.currentTimeMillis()),
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

/** Independent loading/error state for one channel row in the EPG grid. */
data class EpgChannelGuideState(
    val windowKey: String? = null,
    val programmes: List<Programme> = emptyList(),
    val loading: Boolean = false,
    val error: TvError? = null,
    val stale: Boolean = false,
)

/** The directory shortcuts available from the TV channel sheet. */
sealed interface ChannelDirectoryFilter {
    data object All : ChannelDirectoryFilter
    data object Favorites : ChannelDirectoryFilter
    data object Recent : ChannelDirectoryFilter
    data class Group(val name: String?) : ChannelDirectoryFilter
}

/**
 * Owns the persistent live player: the complete channel directory, the current
 * channel index, the [Media3PlaybackSession], EPG caching/debounce, and
 * last-watched-channel persistence.
 *
 * `allChannels` is the single source of truth for channel-surfing + resume.
 * `displayedChannels` is derived locally (no re-fetch) from the selected
 * directory shortcut — filtering never changes the surf order.
 */
@UnstableApi
class LivePlaybackViewModel(
    context: Context,
    private val getChannelCatalog: GetChannelCatalogUseCase,
    private val resolvePlayback: ResolvePlaybackUseCase,
    private val getProgrammeGuide: GetProgrammeGuideUseCase,
    private val lastChannelStore: LastChannelStore,
    private val channelPreferencesStore: ChannelPreferencesStore,
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

    /** Channels currently shown in the side sheet (a filtered view of allChannels). */
    val displayedChannels: List<Channel>
        get() {
            val state = mutableUiState.value
            return when (val filter = state.selectedChannelFilter) {
                ChannelDirectoryFilter.All -> state.allChannels
                ChannelDirectoryFilter.Favorites -> state.allChannels.filter {
                    it.id in state.favoriteChannelIds
                }
                ChannelDirectoryFilter.Recent -> {
                    val byId = state.allChannels.associateBy { it.id }
                    state.recentChannelIds.mapNotNull(byId::get)
                }
                is ChannelDirectoryFilter.Group -> state.allChannels.filter {
                    it.group == filter.name
                }
            }
        }

    private var firstPlayDone = false
    private val channelSwitchHistory = ChannelSwitchHistory()
    private var catalogJob: Job? = null
    private var catalogGeneration = 0L
    private var switchJob: Job? = null
    private var switchGeneration = 0L
    private var guideJob: Job? = null
    private var visibleGuideChannelIds: List<String> = emptyList()
    private var currentGuideRequestKey: String? = null
    private var contentChangeJob: Job? = null
    private var playbackStateJob: Job? = null
    private var decisionRefreshJob: Job? = null
    private var favoritePreferencesJob: Job? = null
    private var recentPreferencesJob: Job? = null

    init {
        observeChannelPreferences()
        loadCatalogAndResume()
        contentChangeJob = contentSyncRepository?.let { contentSync ->
            viewModelScope.launch {
                contentSync.changes.collect { change ->
                    if (change.catalogChanged) reloadCatalogPreservingCurrent()
                    if (change.epgChanged) refreshVisibleGuides()
                }
            }
        }
        // Watch for asynchronous playback failures (e.g. ExoPlayer 404 / timeout).
        // When the player reports a terminalError while a tune from the side
        // sheet is pending, clear the pending id and surface the error so the
        // sheet doesn't hang silently.
        playbackStateJob = viewModelScope.launch {
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
        decisionRefreshJob = viewModelScope.launch {
            while (true) {
                kotlinx.coroutines.delay(60_000L)
                val currentChannelId = session.state.value.channelId
                if (currentChannelId.isNotBlank() && session.state.value.terminalError == null) {
                    runCatching { resolvePlayback(currentChannelId) }
                }
            }
        }
    }

    /** Derived channel list for the side sheet (directory-filtered). */
    fun displayedChannelList(): List<Channel> = displayedChannels

    private fun observeChannelPreferences() {
        favoritePreferencesJob = viewModelScope.launch {
            channelPreferencesStore.favoriteChannelIds.collect { favoriteIds ->
                mutableUiState.value = mutableUiState.value.copy(
                    favoriteChannelIds = favoriteIds,
                )
            }
        }
        recentPreferencesJob = viewModelScope.launch {
            channelPreferencesStore.recentChannelIds.collect { recentIds ->
                mutableUiState.value = mutableUiState.value.copy(
                    recentChannelIds = recentIds,
                )
            }
        }
    }

    private fun loadCatalogAndResume() {
        catalogJob?.cancel()
        val requestGeneration = ++catalogGeneration
        mutableUiState.value = mutableUiState.value.copy(
            loading = true,
            catalogError = null,
        )
        catalogJob = viewModelScope.launch {
            val catalog = try {
                getChannelCatalog(null) // always load ALL channels for surf order
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (requestGeneration != catalogGeneration) return@launch
                mutableUiState.value = mutableUiState.value.copy(
                    loading = false,
                    catalogError = classifyError(e),
                )
                return@launch
            }
            if (requestGeneration != catalogGeneration) return@launch
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
            if (requestGeneration != catalogGeneration) return@launch
            val resumeIndex = lastId?.let { id -> channels.indexOfFirst { it.id == id } }
                ?.takeIf { it >= 0 }
            if (lastId != null && resumeIndex == null) {
                // Channel no longer visible — clear stale record.
                lastChannelStore.clear()
                if (requestGeneration != catalogGeneration) return@launch
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
        val requestGeneration = ++catalogGeneration
        val previousState = mutableUiState.value
        val previousChannelId = previousState.allChannels
            .getOrNull(previousState.currentIndex)?.id
        val catalog = try {
            getChannelCatalog(null)
        } catch (_: Exception) {
            return
        }
        if (requestGeneration != catalogGeneration) return
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
            guidesByChannel = emptyMap(),
            loading = false,
            catalogError = null,
        )
        invalidateGuideRequest()
        visibleGuideChannelIds = emptyList()
        if (previousChannelId != nextChannelId) playCurrent(initialPlay = false)
    }

    /** Select a directory shortcut without re-fetching or changing surf order. */
    fun selectChannelFilter(filter: ChannelDirectoryFilter) {
        invalidateGuideRequest()
        mutableUiState.value = mutableUiState.value.copy(
            selectedChannelFilter = filter,
            guidesByChannel = emptyMap(),
        )
        visibleGuideChannelIds = emptyList()
    }

    /** Favourites are explicitly viewer-owned and persist only on this TV. */
    fun toggleFavoriteCurrentChannel() {
        val channelId = mutableUiState.value.allChannels
            .getOrNull(mutableUiState.value.currentIndex)
            ?.id
            ?: return
        viewModelScope.launch { channelPreferencesStore.toggleFavorite(channelId) }
    }

    /** Switch to the prev/next channel by [delta] in allChannels. */
    fun switchBy(delta: Int) {
        val channels = mutableUiState.value.allChannels
        if (channels.isEmpty()) return
        val next = (mutableUiState.value.currentIndex + delta)
            .coerceIn(0, channels.lastIndex)
        if (next == mutableUiState.value.currentIndex) return
        switchToIndex(next)
    }

    /** Jump directly to a channel (e.g. picked from the side sheet). */
    fun switchToChannel(channel: Channel) {
        val channels = mutableUiState.value.allChannels
        val index = channels.indexOfFirst { it.id == channel.id }
        if (index < 0) return
        if (index != mutableUiState.value.currentIndex) {
            switchToIndex(index)
        } else if (session.state.value.terminalError != null || session.state.value.firstFrameMs == null) {
            playCurrent(initialPlay = false)
        }
    }

    /** Returns to the immediately previous channel within this app session. */
    fun switchToPreviousChannel(): Boolean {
        val state = mutableUiState.value
        val current = state.allChannels.getOrNull(state.currentIndex) ?: return false
        val previous = channelSwitchHistory.previousIn(state.allChannels, current.id) ?: return false
        val previousIndex = state.allChannels.indexOfFirst { it.id == previous.id }
        if (previousIndex < 0) return false
        channelSwitchHistory.recordLeaving(current.id)
        mutableUiState.value = state.copy(currentIndex = previousIndex)
        playCurrent(initialPlay = false)
        return true
    }

    /**
     * User pressed OK on a channel in the side sheet: set pendingTune, switch
     * playback, but do NOT close the sheet yet — the screen closes it only when
     * the new channel reaches its first frame (constitution VIII: failed tune
     * keeps the sheet open for retry).
     */
    fun requestTune(channel: Channel) {
        val current = mutableUiState.value.allChannels
            .getOrNull(mutableUiState.value.currentIndex)
        if (current?.id == channel.id &&
            session.state.value.firstFrameMs != null &&
            session.state.value.terminalError == null
        ) {
            mutableUiState.value = mutableUiState.value.copy(
                pendingTuneChannelId = null,
                tuneError = null,
            )
            return
        }
        mutableUiState.value = mutableUiState.value.copy(
            pendingTuneChannelId = channel.id,
            tuneError = null, // clear previous failure
        )
        switchToChannel(channel)
    }

    /** Called by the screen when first frame of the tuned channel is confirmed. */
    fun onTuneSucceeded() {
        mutableUiState.value = mutableUiState.value.copy(pendingTuneChannelId = null)
    }

    /** Called by the screen when a tune fails (no line / network / decode). */
    fun onTuneFailed(error: TvError) {
        mutableUiState.value = mutableUiState.value.copy(
            pendingTuneChannelId = null,
            tuneError = error.message,
        )
    }

    /** Stop background work and playback before returning to device registration. */
    fun stopForReconfigure() {
        // The resolver can outlive cancellation in a mocked or non-cooperative
        // implementation. Invalidate it before releasing the session so an old
        // result cannot write player state after reconfiguration.
        switchGeneration += 1
        catalogGeneration += 1
        catalogJob?.cancel()
        switchJob?.cancel()
        invalidateGuideRequest()
        contentChangeJob?.cancel()
        playbackStateJob?.cancel()
        decisionRefreshJob?.cancel()
        favoritePreferencesJob?.cancel()
        recentPreferencesJob?.cancel()
        session.release()
    }

    /** Retry the current error without forcing the viewer through a full reset. */
    fun retryCurrentPlayback() {
        val state = mutableUiState.value
        if (state.catalogError != null || state.allChannels.isEmpty()) {
            loadCatalogAndResume()
            return
        }
        mutableUiState.value = state.copy(
            catalogError = null,
            pendingTuneChannelId = null,
            tuneError = null,
        )
        playCurrent(initialPlay = false)
    }

    private fun playCurrent(initialPlay: Boolean) {
        val channel = mutableUiState.value.allChannels.getOrNull(mutableUiState.value.currentIndex)
            ?: return
        switchJob?.cancel()
        val requestGeneration = ++switchGeneration
        session.beginChannelSwitch(
            channelId = channel.id,
            channelName = channel.name,
            initialPlay = initialPlay,
            channelLogo = channel.logo,
        )
        switchJob = viewModelScope.launch {
            try {
                when (val result = resolvePlayback(channel.id)) {
                    is PlaybackResolution.Ready -> {
                        if (requestGeneration != switchGeneration) return@launch
                        session.switchChannel(
                            channelId = channel.id,
                            channelName = channel.name,
                            decision = result.decision,
                            initialPlay = initialPlay,
                            channelLogo = channel.logo,
                        )
                        firstPlayDone = true
                        lastChannelStore.save(channel.id)
                        channelPreferencesStore.recordViewed(channel.id)
                    }
                    is PlaybackResolution.Unavailable -> {
                        if (requestGeneration != switchGeneration) return@launch
                        // The resolver has already said this channel is not
                        // playable. Do not fabricate an empty domain decision
                        // merely to drive the player into an error state.
                        session.failChannelSwitch(result.message)
                        if (mutableUiState.value.pendingTuneChannelId == channel.id) {
                            onTuneFailed(TvError.Playback(result.message))
                        }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (requestGeneration != switchGeneration) return@launch
                val error = classifyError(e)
                session.failChannelSwitch(error.message)
                if (mutableUiState.value.pendingTuneChannelId == channel.id) {
                    onTuneFailed(error)
                }
            }
        }
    }

    private fun switchToIndex(index: Int) {
        val state = mutableUiState.value
        val current = state.allChannels.getOrNull(state.currentIndex) ?: return
        val next = state.allChannels.getOrNull(index) ?: return
        if (current.id == next.id) return
        channelSwitchHistory.recordLeaving(current.id)
        mutableUiState.value = state.copy(currentIndex = index)
        playCurrent(initialPlay = false)
    }

    /** Focus moved to a channel in the grid; visible-row loading is batched separately. */
    fun onChannelFocused(channelId: String) {
        mutableUiState.value = mutableUiState.value.copy(focusedChannelId = channelId)
    }

    fun selectDate(date: LocalDate) {
        val current = mutableUiState.value
        val nextWindow = current.guideWindow.forDate(date, ZoneId.systemDefault())
        invalidateGuideRequest()
        mutableUiState.value = current.copy(
            selectedDate = date,
            guideWindow = nextWindow,
            guidesByChannel = emptyMap(),
        )
        loadVisibleGuides()
    }

    /** Shift the visible time lane by one or more 30-minute ticks. */
    fun shiftGuideWindow(steps: Int) {
        if (steps == 0) return
        invalidateGuideRequest()
        mutableUiState.value = mutableUiState.value.copy(
            guideWindow = mutableUiState.value.guideWindow.shift(steps),
            guidesByChannel = emptyMap(),
        )
        loadVisibleGuides()
    }

    /** Called by the grid as its lazy rows enter/leave the viewport. */
    fun onVisibleGuideChannelsChanged(channelIds: List<String>) {
        val normalized = channelIds.distinct().filter { it.isNotBlank() }
        if (normalized == visibleGuideChannelIds) return
        visibleGuideChannelIds = normalized
        loadVisibleGuides()
    }

    private fun loadVisibleGuides() {
        val visible = visibleGuideChannelIds
        if (visible.isEmpty()) return
        loadGuidesForChannels(expandGuideChannelIds(visible))
    }

    private fun expandGuideChannelIds(channelIds: List<String>): List<String> {
        val displayed = displayedChannels
        if (displayed.isEmpty()) return channelIds.distinct()
        val indices = channelIds.mapNotNull { id ->
            displayed.indexOfFirst { it.id == id }.takeIf { it >= 0 }
        }
        if (indices.isEmpty()) return channelIds.distinct()
        val start = (indices.minOrNull() ?: 0) - 1
        val end = (indices.maxOrNull() ?: 0) + 1
        return displayed.subList(start.coerceAtLeast(0), (end + 1).coerceAtMost(displayed.size))
            .map { it.id }
            .distinct()
    }

    private fun loadGuidesForChannels(channelIds: List<String>) {
        val state = mutableUiState.value
        val window = state.guideWindow
        val ids = channelIds.distinct()
        if (ids.isEmpty()) return
        val windowKey = guideRequestKey(window)
        val requestKey = "$windowKey|${ids.sorted().joinToString(",")}"

        val toLoad = ids.filter { id ->
            val existing = state.guidesByChannel[id]
            existing?.windowKey != windowKey && existing?.loading != true
        }
        if (toLoad.isEmpty()) return

        invalidateGuideRequest()
        currentGuideRequestKey = requestKey
        mutableUiState.value = state.copy(
            guidesByChannel = state.guidesByChannel.toMutableMap().apply {
                toLoad.forEach { id ->
                    val previous = get(id)
                    set(
                        id,
                        EpgChannelGuideState(
                            windowKey = previous?.windowKey,
                            programmes = previous?.programmes.orEmpty(),
                            loading = true,
                            error = null,
                            stale = previous?.programmes?.isNotEmpty() == true,
                        ),
                    )
                }
            },
        )
        guideJob = viewModelScope.launch {
            delay(120)
            try {
                val guides = getProgrammeGuide.batch(ids, window.startAt, window.endAt)
                val staleByChannel = ids.associateWith { id ->
                    runCatching {
                        getProgrammeGuide.isStale(id, window.startAt, window.endAt)
                    }.getOrDefault(false)
                }
                if (currentGuideRequestKey != requestKey) return@launch
                val next = mutableUiState.value.guidesByChannel.toMutableMap()
                ids.forEach { id ->
                    next[id] = EpgChannelGuideState(
                        windowKey = windowKey,
                        programmes = guides[id.removePrefix("magi:")].orEmpty(),
                        loading = false,
                        error = null,
                        stale = staleByChannel[id] == true,
                    )
                }
                mutableUiState.value = mutableUiState.value.copy(guidesByChannel = next)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (currentGuideRequestKey != requestKey) return@launch
                val error = classifyError(e)
                val next = mutableUiState.value.guidesByChannel.toMutableMap()
                ids.forEach { id ->
                    val previous = next[id]
                    next[id] = EpgChannelGuideState(
                        windowKey = previous?.windowKey,
                        programmes = previous?.programmes.orEmpty(),
                        loading = false,
                        error = error,
                        stale = previous?.programmes?.isNotEmpty() == true,
                    )
                }
                mutableUiState.value = mutableUiState.value.copy(guidesByChannel = next)
            }
        }
    }

    private fun guideRequestKey(window: EpgTimeWindow): String =
        "${window.startAt}:${window.endAt}"

    private fun invalidateGuideRequest() {
        guideJob?.cancel()
        guideJob = null
        currentGuideRequestKey = null
    }

    /** Refresh visible rows after a server EPG revision changes. */
    private fun refreshVisibleGuides() {
        val current = mutableUiState.value
        invalidateGuideRequest()
        mutableUiState.value = current.copy(guidesByChannel = emptyMap())
        loadVisibleGuides()
    }

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
        switchGeneration += 1
        catalogGeneration += 1
        catalogJob?.cancel()
        switchJob?.cancel()
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
            channelPreferencesStore: ChannelPreferencesStore,
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
                channelPreferencesStore = channelPreferencesStore,
                diagnosticsRepository = diagnosticsRepository,
                contentSyncRepository = contentSyncRepository,
                clientSessionRepository = clientSessionRepository,
            ) as T
        }
    }
}
