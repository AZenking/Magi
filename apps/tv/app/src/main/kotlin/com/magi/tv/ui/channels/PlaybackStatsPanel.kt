package com.magi.tv.ui.channels

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.magi.tv.playback.PlaybackStateLabel
import com.magi.tv.playback.PlaybackStats
import com.magi.tv.ui.MagiTvPalette

/**
 * Compact, always-on "Stats for nerds" HUD pinned to the top-right corner of
 * the live player (YouTube-style debug overlay). Renders a monospaced key/value
 * block that refreshes live from [com.magi.tv.playback.Media3PlaybackSession.stats].
 *
 * Demasked per constitution VIII: only the stream host + playback metrics are
 * shown — never the full URL, path, Token, or API Key.
 */
@Composable
internal fun PlaybackStatsHud(
    stats: PlaybackStats,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color.Black.copy(alpha = 0.6f))
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        StatLine("State", stats.state.label())
        StatLine("Res", formatResolution(stats.videoWidth, stats.videoHeight))
        StatLine("Codec", stats.videoCodec ?: "—")
        StatLine("Fps", formatFrameRate(stats.frameRate))
        StatLine("BR", formatBitrateShort(stats.videoBitrate))
        StatLine("BW", formatBandwidthShort(stats.bandwidthBps))
        StatLine("Buf", formatBuffer(stats.bufferHealthMs))
        StatLine("Drop", stats.droppedFrames.toString())
        StatLine("Audio", stats.audioCodec ?: "—")
        StatLine("Host", stats.streamHost ?: "—")
    }
}

@Composable
private fun StatLine(name: String, value: String) {
    Row {
        Text(
            text = name,
            modifier = Modifier.width(40.dp),
            color = MagiTvPalette.Muted,
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace,
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = value,
            color = MagiTvPalette.Text,
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
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
    if (fps <= 0f) "—" else "${"%.0f".format(fps)}"

private fun formatBitrateShort(bps: Int?): String = when {
    bps == null || bps <= 0 -> "—"
    bps >= 1_000_000 -> "${"%.1f".format(bps / 1_000_000.0)}M"
    else -> "${bps / 1000}k"
}

private fun formatBandwidthShort(bps: Long): String = when {
    bps <= 0 -> "—"
    bps >= 1_000_000 -> "${"%.1f".format(bps / 1_000_000.0)}M"
    else -> "${bps / 1000}k"
}

private fun formatBuffer(ms: Long): String =
    if (ms <= 0) "—" else "${"%.1f".format(ms / 1000.0)}s"
