package com.magi.tv.ui.channels

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.magi.tv.playback.PlaybackStateLabel
import com.magi.tv.playback.PlaybackStats
import com.magi.tv.ui.MagiTvPalette

/**
 * YouTube "Stats for nerds"–style panel that slides in from the right edge,
 * overlaying the live player while playback continues. All metrics come from
 * [com.magi.tv.playback.Media3PlaybackSession.stats]. Stream hosts are demasked
 * (no path / token — constitution VIII).
 */
@Composable
internal fun PlaybackStatsPanel(
    visible: Boolean,
    stats: PlaybackStats,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInHorizontally(initialOffsetX = { it }) + fadeIn(),
        exit = slideOutHorizontally(targetOffsetX = { it }) + fadeOut(),
        modifier = modifier.fillMaxSize(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MagiTvPalette.Background.copy(alpha = 0.78f)),
            contentAlignment = Alignment.CenterEnd,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(420.dp)
                    .background(MagiTvPalette.Surface.copy(alpha = 0.97f))
                    .border(1.dp, MagiTvPalette.Border)
                    .padding(horizontal = 28.dp, vertical = 26.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                // Header
                Column {
                    Text(
                        text = "实时播放统计",
                        color = MagiTvPalette.Text,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Stats for nerds · 按返回关闭",
                        color = MagiTvPalette.Subtle,
                        fontSize = 13.sp,
                    )
                }

                StatsSection(title = "播放") {
                    StatRow("状态", stats.state.label())
                    StatRow("缓冲", formatBuffer(stats.bufferHealthMs))
                    StatRow("累计丢帧", stats.droppedFrames.toString())
                    StatRow("源 Host", stats.streamHost ?: "—")
                }

                StatsSection(title = "视频") {
                    StatRow("分辨率", formatResolution(stats.videoWidth, stats.videoHeight))
                    StatRow("帧率", formatFrameRate(stats.frameRate))
                    StatRow("编码", stats.videoCodec ?: "—")
                    StatRow("Profile", stats.videoProfile ?: "—")
                    StatRow("码率", formatBitrate(stats.videoBitrate))
                }

                StatsSection(title = "音频") {
                    StatRow("编码", stats.audioCodec ?: "—")
                    StatRow("声道", formatChannels(stats.audioChannels))
                    StatRow("采样率", formatSampleRate(stats.audioSampleRate))
                    StatRow("码率", formatBitrate(stats.audioBitrate))
                }

                StatsSection(title = "网络") {
                    StatRow("估算带宽", formatBandwidth(stats.bandwidthBps))
                }

                Spacer(Modifier.height(4.dp))
                Text(
                    text = "仅展示 host 与播放指标,不含完整地址、Token 或 API Key。",
                    color = MagiTvPalette.Subtle,
                    fontSize = 12.sp,
                    lineHeight = 15.sp,
                )
            }
        }
    }
}

@Composable
private fun StatsSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MagiTvPalette.SurfaceElevated)
            .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(12.dp))
            .padding(horizontal = 18.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = title,
            color = MagiTvPalette.Primary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
        content()
    }
}

@Composable
private fun StatRow(
    name: String,
    value: String,
) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = name,
            modifier = Modifier.weight(1f),
            color = MagiTvPalette.Muted,
            fontSize = 14.sp,
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = value,
            modifier = Modifier.weight(1.1f),
            color = MagiTvPalette.Text,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = androidx.compose.ui.text.style.TextAlign.End,
        )
    }
}

private fun PlaybackStateLabel.label(): String = when (this) {
    PlaybackStateLabel.IDLE -> "IDLE"
    PlaybackStateLabel.BUFFERING -> "BUFFERING"
    PlaybackStateLabel.READY -> "READY"
    PlaybackStateLabel.ENDED -> "ENDED"
}

private fun formatResolution(w: Int, h: Int): String =
    if (w == 0 || h == 0) "—" else "${w}×${h}"

private fun formatFrameRate(fps: Float): String =
    if (fps <= 0f) "—" else "${"%.2f".format(fps)} fps"

private fun formatChannels(count: Int): String = when (count) {
    0 -> "—"
    1 -> "1 (mono)"
    2 -> "2 (stereo)"
    else -> "$count"
}

private fun formatSampleRate(hz: Int): String =
    if (hz <= 0) "—" else "${hz / 1000} kHz"

private fun formatBitrate(bps: Int?): String = when {
    bps == null || bps <= 0 -> "—"
    bps >= 1_000_000 -> "${"%.2f".format(bps / 1_000_000.0)} Mbit/s"
    else -> "${bps / 1000} kbit/s"
}

private fun formatBandwidth(bps: Long): String = when {
    bps <= 0 -> "—"
    bps >= 1_000_000 -> "${"%.2f".format(bps / 1_000_000.0)} Mbps"
    else -> "${bps / 1000} kbps"
}

private fun formatBuffer(ms: Long): String =
    if (ms <= 0) "—" else "${"%.2f".format(ms / 1000.0)} s"
