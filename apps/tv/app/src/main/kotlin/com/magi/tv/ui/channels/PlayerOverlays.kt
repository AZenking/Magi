package com.magi.tv.ui.channels

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.magi.tv.playback.PlayerUiState
import com.magi.tv.ui.MagiTvActionButton
import com.magi.tv.ui.MagiTvChannelMark
import com.magi.tv.ui.MagiTvPalette
import com.magi.tv.ui.MagiTvStatusBadge

/**
 * Overlay composables reused by the persistent live player ([LivePlaybackScreen]):
 * the loading/connecting caption, the terminal-error card, and the OK-toggled
 * info bar (which also hosts the diagnostics entry).
 */

@Composable
internal fun LoadingOverlay(
    state: PlayerUiState,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MagiTvPalette.Surface.copy(alpha = 0.94f))
            .padding(horizontal = 28.dp, vertical = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(28.dp),
            color = MagiTvPalette.Primary,
            strokeWidth = 3.dp,
        )
        Spacer(Modifier.width(18.dp))
        Column {
            Text(
                text = if (state.switching) "正在切换备用线路" else "正在连接直播",
                color = MagiTvPalette.Text,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                text = "${state.channelName} · 线路 ${state.lineIndex + 1}/${state.lineCount}",
                color = MagiTvPalette.Muted,
                fontSize = 14.sp,
            )
        }
    }
}

@Composable
internal fun PlayerErrorOverlay(
    message: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .width(520.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MagiTvPalette.Surface.copy(alpha = 0.96f))
            .padding(horizontal = 34.dp, vertical = 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(14.dp)
                .clip(CircleShape)
                .background(MagiTvPalette.Error),
        )
        Spacer(Modifier.height(18.dp))
        Text(
            text = "暂时无法播放",
            color = MagiTvPalette.Text,
            fontSize = 25.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = message,
            color = MagiTvPalette.Muted,
            fontSize = 16.sp,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(18.dp))
        Text(
            text = "按返回键退出播放",
            color = MagiTvPalette.Primary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
internal fun PlayerInfoOverlay(
    state: PlayerUiState,
    onOpenDiagnostics: () -> Unit = {},
    onOpenStats: () -> Unit = {},
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(230.dp)
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color.Transparent,
                        Color.Black.copy(alpha = 0.28f),
                        Color.Black.copy(alpha = 0.94f),
                    ),
                ),
            ),
    ) {
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 44.dp, vertical = 30.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MagiTvChannelMark(
                name = state.channelName,
                size = 58.dp,
                logo = state.channelLogo,
            )
            Spacer(Modifier.width(18.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MagiTvStatusBadge(label = "LIVE")
                    Text(
                        text = "线路 ${state.lineIndex + 1}/${state.lineCount}",
                        color = MagiTvPalette.Muted,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = state.channelName,
                    color = MagiTvPalette.Text,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "首帧 ${state.firstFrameMs ?: 0} ms",
                    color = MagiTvPalette.Text,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(7.dp))
                Text(
                    text = "方向键选择 · 返回关闭",
                    color = MagiTvPalette.Muted,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(10.dp))
                MagiTvActionButton(
                    label = "统计",
                    onClick = onOpenStats,
                    compact = true,
                )
                Spacer(Modifier.height(8.dp))
                MagiTvActionButton(
                    label = "诊断",
                    onClick = onOpenDiagnostics,
                    compact = true,
                )
            }
        }
    }
}
