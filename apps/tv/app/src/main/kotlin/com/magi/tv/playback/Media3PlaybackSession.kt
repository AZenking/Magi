package com.magi.tv.playback

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.magi.tv.domain.model.DiagnosticEvent
import com.magi.tv.domain.model.PlaybackDecision
import com.magi.tv.domain.repository.DiagnosticsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

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
 */
class Media3PlaybackSession(
    context: Context,
    private val diagnosticsRepository: DiagnosticsRepository,
) {
    private val player = ExoPlayer.Builder(context.applicationContext).build()

    /** Lines of the *currently active* channel. Updated on [switchChannel]. */
    private var lines: List<com.magi.tv.domain.model.PlaybackLine> = emptyList()

    private val mutableState = MutableStateFlow(PlayerUiState())
    val state = mutableState.asStateFlow()

    private var prepareStartedAtMs = 0L
    private var firstFrameRecorded = false
    private var released = false

    init {
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

    fun release() {
        if (!released) {
            released = true
            player.release()
        }
    }
}
