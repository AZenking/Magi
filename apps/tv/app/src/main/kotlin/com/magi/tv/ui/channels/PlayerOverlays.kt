package com.magi.tv.ui.channels

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
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
            .clip(RoundedCornerShape(14.dp))
            .background(MagiTvPalette.Surface.copy(alpha = 0.94f))
            .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(14.dp))
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
    onOpenChannelList: () -> Unit,
    onActionFocusChanged: (Boolean) -> Unit = {},
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val actionFocusRequester = remember { FocusRequester() }
    LaunchedEffect(enabled) {
        if (!enabled) {
            onActionFocusChanged(false)
            return@LaunchedEffect
        }
        // Make the recovery action the first remote target. A terminal player
        // error must never leave the user staring at a non-focusable card.
        repeat(8) {
            kotlinx.coroutines.delay(50)
            if (actionFocusRequester.requestFocus()) return@LaunchedEffect
        }
    }

    Column(
        modifier = modifier
            .width(560.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(MagiTvPalette.Surface.copy(alpha = 0.97f))
            .border(1.dp, MagiTvPalette.Error.copy(alpha = 0.5f), RoundedCornerShape(18.dp))
            .padding(horizontal = 38.dp, vertical = 34.dp),
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
            text = "按 ← 打开频道列表并切换线路",
            color = MagiTvPalette.Primary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(14.dp))
        MagiTvActionButton(
            label = "打开频道列表",
            onClick = onOpenChannelList,
            primary = true,
            enabled = enabled,
            compact = true,
            modifier = Modifier
                .focusRequester(actionFocusRequester)
                .onFocusChanged { onActionFocusChanged(it.isFocused) },
        )
    }
}

@Composable
internal fun PlayerInfoOverlay(
    state: PlayerUiState,
    onActionFocusChanged: (Boolean) -> Unit = {},
    onOpenDiagnostics: () -> Unit = {},
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(196.dp)
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color.Transparent,
                        Color.Black.copy(alpha = 0.18f),
                        Color.Black.copy(alpha = 0.92f),
                    ),
                ),
            ),
    ) {
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 48.dp, vertical = 24.dp),
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
                    fontSize = 30.sp,
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
                    text = "OK 显示或隐藏信息",
                    color = MagiTvPalette.Muted,
                    fontSize = 14.sp,
                )
                Spacer(Modifier.height(10.dp))
                MagiTvActionButton(
                    label = "诊断",
                    onClick = onOpenDiagnostics,
                    compact = true,
                    modifier = Modifier.onFocusChanged { onActionFocusChanged(it.isFocused) },
                )
            }
        }
    }
}
