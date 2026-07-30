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
import androidx.media3.exoplayer.analytics.AnalyticsListener
import com.magi.tv.domain.model.DiagnosticEvent
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.repository.DiagnosticsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.URL

data class PlayerUiState(
    val channelId: String = "",
    val channelName: String = "",
    val channelLogo: String? = null,
    val lineIndex: Int = 0,
    val lineCount: Int = 1,
    val firstFrameMs: Long? = null,
    val switching: Boolean = false,
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
    private val player = ExoPlayer.Builder(context.applicationContext)
        .setAudioAttributes(
            // Declare MEDIA usage so the system grants audio focus and routes
            // output correctly. Without this, Android TV may suppress audio
            // because the player never requests focus.
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            /* handleAudioFocus = */ true,
        )
        .setHandleAudioBecomingNoisy(true)
        .build()

    /** Lines of the *currently active* channel. Updated on [switchChannel]. */
    private var lines: List<com.magi.tv.domain.model.PlaybackLine> = emptyList()

    private val mutableState = MutableStateFlow(PlayerUiState())
    val state = mutableState.asStateFlow()

    /** Real-time playback metrics for the "Stats for nerds" panel. */
    private val mutableStats = MutableStateFlow(PlaybackStats())
    val stats = mutableStats.asStateFlow()

    private var prepareStartedAtMs = 0L
    private var firstFrameRecorded = false
    private var released = false

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
                    if (playbackState == Player.STATE_READY && !firstFrameRecorded) {
                        firstFrameRecorded = true
                        val firstFrameMs =
                            System.currentTimeMillis() - prepareStartedAtMs
                        mutableState.value = mutableState.value.copy(
                            firstFrameMs = firstFrameMs,
                            switching = false,
                        )
                        diagnosticsRepository.recordFirstFrame(firstFrameMs)
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    handleLineError(error)
                }
            },
        )
    }

    fun player(): ExoPlayer = player

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
        lines = decision.orderedLines
        if (lines.isEmpty()) {
            mutableState.value = mutableState.value.copy(
                channelId = channelId,
                channelName = channelName,
                channelLogo = channelLogo,
                lineCount = 0,
                lineIndex = 0,
                firstFrameMs = null,
                switching = false,
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
        val line = lines.getOrNull(index) ?: return
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
    }

    private fun handleLineError(error: PlaybackException) {
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

    /** Clear the terminal error (e.g. after the user retries / switches away). */
    fun clearError() {
        if (mutableState.value.terminalError != null) {
            mutableState.value = mutableState.value.copy(terminalError = null)
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
}
