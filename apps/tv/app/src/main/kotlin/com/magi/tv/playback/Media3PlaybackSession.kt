package com.magi.tv.playback

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.analytics.AnalyticsListener
import com.magi.tv.domain.model.DiagnosticEvent
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.repository.DiagnosticsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import android.os.Handler
import android.os.Looper
import java.net.URL

data class PlayerUiState(
    val channelId: String = "",
    val channelName: String = "",
    val channelLogo: String? = null,
    val lineIndex: Int = 0,
    val lineCount: Int = 0,
    val firstFrameMs: Long? = null,
    val switching: Boolean = false,
    val buffering: Boolean = false,
    val terminalError: String? = null,
)

/**
 * App-scoped Media3 adapter backing the persistent live player.
 *
 * Unlike a per-channel session, a single [ExoPlayer] lives for the whole app
 * session; [switchChannel] swaps the active channel + its ordered lines without
 * re-creating the player (the basis for smooth Up/Down channel surfing,
 * roadmap §9.5/§9.6). Line-level failover still runs within a channel's lines.
 *
 * Stats for the "Stats for nerds" panel are gathered by an [AnalyticsListener]
 * (no CoroutineScope introduced here — [refreshDerivedStats] is polled by the
 * UI for the derived buffer/state fields).
 */
@UnstableApi
class Media3PlaybackSession(
    context: Context,
    private val diagnosticsRepository: DiagnosticsRepository,
) {
    /**
     * Optional callback invoked when a playback line fails or succeeds.
     * Set by the ViewModel to report results to the server (008 US3).
     * Parameters: (channelId, streamId, errorKind, playedDurationMs).
     */
    var reportPlayback: ((channelId: String, streamId: String, errorKind: String, playedDurationMs: Long) -> Unit)? = null

    // Fix 3: ExoPlayer tuned for live IPTV — smaller buffers for faster
    // recovery, and a rebuffer threshold that doesn't stall for 50 seconds.
    private val liveLoadControl: LoadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            /* minBufferMs= */ 10_000,
            /* maxBufferMs= */ 30_000,
            /* bufferForPlaybackMs= */ 1_500,
            /* bufferForPlaybackAfterRebufferMs= */ 3_000,
        )
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()

    private val player = ExoPlayer.Builder(context.applicationContext)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            /* handleAudioFocus = */ true,
        )
        .setHandleAudioBecomingNoisy(true)
        .setLoadControl(liveLoadControl)
        .build()

    /** Lines of the *currently active* channel. Updated on [switchChannel]. */
    private var lines: List<com.magi.tv.domain.model.PlaybackLine> = emptyList()
    /** True while the ViewModel is resolving a new channel's playback decision. */
    private var resolvingChannel = false

    private val mutableState = MutableStateFlow(PlayerUiState())
    val state = mutableState.asStateFlow()

    /** Real-time playback metrics for the "Stats for nerds" panel. */
    private val mutableStats = MutableStateFlow(PlaybackStats())
    val stats = mutableStats.asStateFlow()

    private var prepareStartedAtMs = 0L
    private var firstFrameRecorded = false
    private var released = false

    // Fix 1: Buffering watchdog — detects silent stalls where the player
    // enters STATE_BUFFERING without ever throwing a PlaybackException.
    private val mainHandler = Handler(Looper.getMainLooper())
    private var bufferingSinceMs = 0L
    private var bufferRetried = false
    private val bufferWatchdogRunnable: Runnable = Runnable {
        if (released) return@Runnable
        val now = System.currentTimeMillis()
        if (bufferingSinceMs > 0 && now - bufferingSinceMs >= BUFFER_TIMEOUT_MS) {
            // Stalled in buffering too long — attempt recovery.
            if (!bufferRetried) {
                // First timeout: re-prepare the same line (the stream may
                // have had a transient stall that a fresh connection fixes).
                bufferRetried = true
                val currentLine = lines.getOrNull(mutableState.value.lineIndex)
                if (currentLine != null) {
                    player.setMediaItem(MediaItem.fromUri(currentLine.url))
                    player.prepare()
                }
                // Re-arm the watchdog for the second check.
                mainHandler.postDelayed(bufferWatchdogRunnable, BUFFER_TIMEOUT_MS)
            } else {
                // Second timeout: treat as a line error and failover.
                bufferRetried = false
                bufferingSinceMs = 0L
                handleBufferingTimeout()
            }
        }
    }

    private fun handleBufferingTimeout() {
        // Synthesize a network-style error and route through the existing
        // failover path so the next line is tried (or terminal error is set).
        val fakeError = PlaybackException(
            "Buffering timeout — stream stalled",
            /* cause= */ null,
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
        )
        handleLineError(fakeError)
    }

    private val statsListener = object : AnalyticsListener {
        override fun onPlaybackStateChanged(
            eventTime: AnalyticsListener.EventTime,
            state: Int,
        ) {
            mutableStats.value = mutableStats.value.copy(
                state = state.toPlaybackStateLabel(),
            )
        }

        override fun onVideoSizeChanged(
            eventTime: AnalyticsListener.EventTime,
            videoSize: VideoSize,
        ) {
            mutableStats.value = mutableStats.value.copy(
                videoWidth = videoSize.width,
                videoHeight = videoSize.height,
            )
        }

        override fun onVideoInputFormatChanged(
            eventTime: AnalyticsListener.EventTime,
            format: androidx.media3.common.Format,
            decoderReuseEvaluation: androidx.media3.exoplayer.DecoderReuseEvaluation?,
        ) {
            mutableStats.value = mutableStats.value.copy(
                videoCodec = format.sampleMimeType,
                videoProfile = format.codecs,
                videoBitrate = format.averageBitrate?.takeIf { it > 0 },
                frameRate = format.frameRate.takeIf { it > 0f } ?: 0f,
            )
        }

        override fun onAudioInputFormatChanged(
            eventTime: AnalyticsListener.EventTime,
            format: androidx.media3.common.Format,
            decoderReuseEvaluation: androidx.media3.exoplayer.DecoderReuseEvaluation?,
        ) {
            mutableStats.value = mutableStats.value.copy(
                audioCodec = format.sampleMimeType,
                audioChannels = format.channelCount,
                audioSampleRate = format.sampleRate,
                audioBitrate = format.averageBitrate?.takeIf { it > 0 },
            )
        }

        override fun onDroppedVideoFrames(
            eventTime: AnalyticsListener.EventTime,
            droppedFrames: Int,
            elapsedMs: Long,
        ) {
            mutableStats.value = mutableStats.value.copy(
                droppedFrames = droppedFrames.toLong(),
            )
        }

        override fun onBandwidthEstimate(
            eventTime: AnalyticsListener.EventTime,
            totalLoadTimeMs: Int,
            totalBytesLoaded: Long,
            bitrateEstimate: Long,
        ) {
            mutableStats.value = mutableStats.value.copy(
                bandwidthBps = bitrateEstimate,
            )
        }
    }

    init {
        player.addAnalyticsListener(statsListener)
        player.addListener(
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_READY -> {
                            // Cancel the buffering watchdog — playback recovered.
                            mainHandler.removeCallbacks(bufferWatchdogRunnable)
                            bufferingSinceMs = 0L
                            bufferRetried = false
                            if (!firstFrameRecorded) {
                                firstFrameRecorded = true
                                val firstFrameMs =
                                    System.currentTimeMillis() - prepareStartedAtMs
                                mutableState.value = mutableState.value.copy(
                                    firstFrameMs = firstFrameMs,
                                    switching = false,
                                    buffering = false,
                                )
                                diagnosticsRepository.recordFirstFrame(firstFrameMs)
                            } else {
                                mutableState.value = mutableState.value.copy(buffering = false)
                            }
                        }
                        Player.STATE_BUFFERING -> {
                            // Start the buffering watchdog if not already running.
                            if (bufferingSinceMs == 0L) {
                                bufferingSinceMs = System.currentTimeMillis()
                                bufferRetried = false
                                mainHandler.postDelayed(bufferWatchdogRunnable, BUFFER_TIMEOUT_MS)
                            }
                            mutableState.value = mutableState.value.copy(buffering = true)
                        }
                        else -> {
                            // IDLE or ENDED — cancel watchdog.
                            mainHandler.removeCallbacks(bufferWatchdogRunnable)
                            bufferingSinceMs = 0L
                        }
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    mainHandler.removeCallbacks(bufferWatchdogRunnable)
                    bufferingSinceMs = 0L
                    handleLineError(error)
                }
            },
        )
    }

    fun player(): ExoPlayer = player

    /**
     * Move the visible player state to the requested channel before its playback
     * decision arrives. This prevents stale programme video from masquerading as
     * the newly selected channel during a slow API call.
     */
    fun beginChannelSwitch(
        channelId: String,
        channelName: String,
        initialPlay: Boolean,
        channelLogo: String? = null,
    ) {
        if (released) return
        resolvingChannel = true
        lines = emptyList()
        firstFrameRecorded = false
        mainHandler.removeCallbacks(bufferWatchdogRunnable)
        bufferingSinceMs = 0L
        bufferRetried = false
        // Stop the old media item while the decision resolves. Keeping its
        // frame/audio active would make a failed or slow tune look successful.
        player.stop()
        mutableState.value = PlayerUiState(
            channelId = channelId,
            channelName = channelName,
            channelLogo = channelLogo,
            lineIndex = 0,
            lineCount = 0,
            firstFrameMs = null,
            switching = !initialPlay,
            buffering = false,
            terminalError = null,
        )
        mutableStats.value = PlaybackStats()
    }

    /** Surface failures that occur before Media3 has received a playable URL. */
    fun failChannelSwitch(message: String) {
        if (released) return
        resolvingChannel = false
        lines = emptyList()
        mainHandler.removeCallbacks(bufferWatchdogRunnable)
        bufferingSinceMs = 0L
        bufferRetried = false
        player.stop()
        mutableState.value = mutableState.value.copy(
            lineIndex = 0,
            lineCount = 0,
            firstFrameMs = null,
            switching = false,
            buffering = false,
            terminalError = message,
        )
    }

    /**
     * Play (or switch to) a channel. Reuses the single ExoPlayer — only the
     * media item changes. `initialPlay` controls the loading caption:
     * first ever play shows "正在连接直播", subsequent switches show the
     * "正在切换…" state.
     */
    fun switchChannel(
        channelId: String,
        channelName: String,
        decision: PlaybackDecision,
        initialPlay: Boolean = false,
        channelLogo: String? = null,
    ) {
        if (released) return
        resolvingChannel = false
        lines = decision.orderedLines
        if (lines.isEmpty()) {
            player.stop()
            mutableState.value = mutableState.value.copy(
                channelId = channelId,
                channelName = channelName,
                channelLogo = channelLogo,
                lineCount = 0,
                lineIndex = 0,
                firstFrameMs = null,
                switching = false,
                buffering = false,
                terminalError = "无可用线路",
            )
            return
        }
        startLine(0, channelId, channelName, initialPlay, channelLogo)
    }

    private fun startLine(
        index: Int,
        channelId: String = mutableState.value.channelId,
        channelName: String = mutableState.value.channelName,
        initialPlay: Boolean = false,
        channelLogo: String? = mutableState.value.channelLogo,
    ) {
        if (released) return
        val line = lines.getOrNull(index) ?: return
        resolvingChannel = false
        firstFrameRecorded = false
        prepareStartedAtMs = System.currentTimeMillis()
        mutableState.value = mutableState.value.copy(
            channelId = channelId,
            channelName = channelName,
            channelLogo = channelLogo,
            lineIndex = index,
            lineCount = lines.size,
            firstFrameMs = null,
            // Not switching only on the very first play of the first line.
            switching = !(initialPlay && index == 0),
            buffering = false,
            terminalError = null,
        )
        // Reset per-stream stats so the previous line's stale data never leaks
        // into the panel while the new stream buffers.
        mutableStats.value = PlaybackStats(
            streamHost = runCatching { URL(line.url).host }.getOrNull(),
        )
        player.setMediaItem(MediaItem.fromUri(line.url))
        player.playWhenReady = true
        player.prepare()
        // Reset buffering watchdog for the new line.
        mainHandler.removeCallbacks(bufferWatchdogRunnable)
        bufferingSinceMs = 0L
        bufferRetried = false
    }

    private fun handleLineError(error: PlaybackException) {
        // A stale callback from the previous media item can arrive while the
        // next channel's decision is still being resolved. It must not fail over
        // lines that belong to the new target.
        if (resolvingChannel) return
        val kind = error.toPlaybackErrorKind()
        val currentLine = lines.getOrNull(mutableState.value.lineIndex)
        diagnosticsRepository.recordEvent(
            DiagnosticEvent(
                timestampMs = System.currentTimeMillis(),
                kind = kind,
                message = error.message ?: error.errorCodeName,
                lineStreamId = currentLine?.streamId,
            ),
        )

        // 008-pipeline-reliability T042: report the failure to the server so
        // its health metrics reflect real playback experience.
        val channelId = mutableState.value.channelId
        if (channelId.isNotEmpty() && currentLine != null) {
            // Use actual playback position, not wall-clock since prepare.
            val playedMs = player.currentPosition.coerceAtLeast(0L)
            reportPlayback?.invoke(
                channelId,
                currentLine.streamId,
                kind.name.lowercase(),
                playedMs,
            )
        }

        val nextLineIndex = mutableState.value.lineIndex + 1
        if (nextLineIndex < lines.size) {
            // Failover to the next line of the SAME channel (a genuine switch).
            startLine(nextLineIndex)
        } else {
            mutableState.value = mutableState.value.copy(
                switching = false,
                terminalError = "所有线路均失败：${kind.label}",
            )
            player.stop()
        }
    }

    /**
     * Recompute the derived stats (buffer health + playback state) by reading
     * the player directly. Designed to be polled by the UI every ~500ms while
     * the stats panel is open. Event-driven fields come from the listener.
     */
    fun refreshDerivedStats() {
        val buffered = player.bufferedPosition
        val current = player.currentPosition
        val healthMs = when {
            buffered == C.TIME_UNSET || current == C.TIME_UNSET -> 0L
            buffered < 0 || current < 0 -> 0L
            else -> (buffered - current).coerceAtLeast(0L)
        }
        mutableStats.value = mutableStats.value.copy(
            bufferHealthMs = healthMs,
            state = player.playbackState.toPlaybackStateLabel(),
        )
    }

    fun release() {
        if (!released) {
            released = true
            resolvingChannel = false
            mainHandler.removeCallbacks(bufferWatchdogRunnable)
            player.removeAnalyticsListener(statsListener)
            player.release()
        }
    }

    private fun Int.toPlaybackStateLabel(): PlaybackStateLabel = when (this) {
        Player.STATE_IDLE -> PlaybackStateLabel.IDLE
        Player.STATE_BUFFERING -> PlaybackStateLabel.BUFFERING
        Player.STATE_READY -> PlaybackStateLabel.READY
        Player.STATE_ENDED -> PlaybackStateLabel.ENDED
        else -> PlaybackStateLabel.IDLE
    }

    companion object {
        /** How long to wait in STATE_BUFFERING before attempting recovery. */
        private const val BUFFER_TIMEOUT_MS = 15_000L
    }
}
