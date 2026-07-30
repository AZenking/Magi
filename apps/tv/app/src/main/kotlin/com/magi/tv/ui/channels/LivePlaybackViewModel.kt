package com.magi.tv.ui.channels

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.magi.tv.data.repository.LastChannelStore
import com.magi.tv.domain.model.Channel
import com.magi.tv.domain.model.ChannelGroup
import com.magi.tv.domain.model.Programme
import com.magi.tv.domain.repository.DiagnosticsRepository
import com.magi.tv.domain.usecase.GetChannelCatalogUseCase
import com.magi.tv.domain.usecase.GetProgrammeGuideUseCase
import com.magi.tv.domain.usecase.PlaybackResolution
import com.magi.tv.domain.usecase.ResolvePlaybackUseCase
import com.magi.tv.playback.Media3PlaybackSession
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** UI state for the persistent live-playback surface. */
data class LivePlaybackUiState(
    val channels: List<Channel> = emptyList(),
    val groups: List<ChannelGroup> = emptyList(),
    val currentIndex: Int = 0,
    val selectedGroup: String? = null,
    val loading: Boolean = true,
    val catalogError: String? = null,
    val guide: List<Programme> = emptyList(),
    val guideLoading: Boolean = false,
)

/**
 * Owns the persistent live player: the channel catalog, the current channel
 * index, the [Media3PlaybackSession], and last-watched-channel persistence.
 *
 * Channel surfing (Up/Down) computes prev/next, resolves playback, and calls
 * [Media3PlaybackSession.switchChannel] — the ExoPlayer is never rebuilt, so
 * switching is smooth (roadmap §9.5/§9.6).
 */
class LivePlaybackViewModel(
    context: Context,
    private val getChannelCatalog: GetChannelCatalogUseCase,
    private val resolvePlayback: ResolvePlaybackUseCase,
    private val getProgrammeGuide: GetProgrammeGuideUseCase,
    private val lastChannelStore: LastChannelStore,
    diagnosticsRepository: DiagnosticsRepository,
) : ViewModel() {

    val session = Media3PlaybackSession(
        context = context.applicationContext,
        diagnosticsRepository = diagnosticsRepository,
    )

    private val mutableUiState = MutableStateFlow(LivePlaybackUiState())
    val uiState = mutableUiState.asStateFlow()

    /** Monotonic flag: has the first channel begun playing (for caption wording)? */
    private var firstPlayDone = false
    private var switchJob: Job? = null
    private var guideJob: Job? = null

    init {
        loadCatalogAndResume()
    }

    /** Load channels, then resume the last-watched channel (or the first one). */
    private fun loadCatalogAndResume(group: String? = null) {
        mutableUiState.value = mutableUiState.value.copy(
            loading = true,
            catalogError = null,
        )
        viewModelScope.launch {
            val catalog = try {
                getChannelCatalog(group)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutableUiState.value = mutableUiState.value.copy(
                    loading = false,
                    catalogError = e.message ?: "频道加载失败",
                )
                return@launch
            }
            val channels = catalog.channels
            if (channels.isEmpty()) {
                mutableUiState.value = mutableUiState.value.copy(
                    channels = emptyList(),
                    groups = catalog.groups,
                    selectedGroup = group,
                    loading = false,
                )
                return@launch
            }
            // Resume last channel if present, else start at the top.
            val lastId = lastChannelStore.lastChannelId.first()
            val resumeIndex = lastId?.let { id -> channels.indexOfFirst { it.id == id } }
                ?.takeIf { it >= 0 } ?: 0
            mutableUiState.value = mutableUiState.value.copy(
                channels = channels,
                groups = catalog.groups,
                currentIndex = resumeIndex,
                selectedGroup = group,
                loading = false,
            )
            playCurrent(initialPlay = !firstPlayDone)
        }
    }

    /** Reload channels for a group (resets to the first channel). */
    fun selectGroup(group: String?) = loadCatalogAndResume(group)

    /** Switch to the prev/next channel by [delta] (-1 up, +1 down). */
    fun switchBy(delta: Int) {
        val channels = mutableUiState.value.channels
        if (channels.isEmpty()) return
        val next = (mutableUiState.value.currentIndex + delta)
            .coerceIn(0, channels.lastIndex)
        if (next == mutableUiState.value.currentIndex) return
        mutableUiState.value = mutableUiState.value.copy(currentIndex = next)
        playCurrent(initialPlay = false)
    }

    /** Jump directly to a channel (e.g. picked from the side sheet). */
    fun switchToChannel(channel: Channel) {
        val channels = mutableUiState.value.channels
        val index = channels.indexOfFirst { it.id == channel.id }
        if (index < 0) return
        mutableUiState.value = mutableUiState.value.copy(currentIndex = index)
        playCurrent(initialPlay = false)
    }

    /** Resolve + play the channel at [currentIndex]. Debounced. */
    private fun playCurrent(initialPlay: Boolean) {
        val channel = mutableUiState.value.channels.getOrNull(mutableUiState.value.currentIndex)
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
                        // No usable line — surface via the player's terminal error.
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
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Keep the previous picture; the load caption stays via switching state.
            }
        }
    }

    /** Load the guide for the side sheet's focused channel (debounced). */
    fun loadGuide(channelId: String) {
        guideJob?.cancel()
        guideJob = viewModelScope.launch {
            mutableUiState.value = mutableUiState.value.copy(guideLoading = true)
            try {
                val guide = getProgrammeGuide(channelId)
                mutableUiState.value = mutableUiState.value.copy(
                    guide = guide,
                    guideLoading = false,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutableUiState.value = mutableUiState.value.copy(
                    guide = emptyList(),
                    guideLoading = false,
                )
            }
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
        ) = object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = LivePlaybackViewModel(
                context = context.applicationContext,
                getChannelCatalog = getChannelCatalog,
                resolvePlayback = resolvePlayback,
                getProgrammeGuide = getProgrammeGuide,
                lastChannelStore = lastChannelStore,
                diagnosticsRepository = diagnosticsRepository,
            ) as T
        }
    }
}
