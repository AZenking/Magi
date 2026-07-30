package com.magi.tv.ui.channels

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.magi.tv.domain.model.Channel
import com.magi.tv.domain.model.Programme
import com.magi.tv.ui.MagiTvChannelMark
import com.magi.tv.ui.MagiTvPalette
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The "Left" overlay: a semi-transparent side sheet combining a channel list
 * (left) with the focused channel's programme guide (right). Selecting a
 * channel calls [onSelectChannel] (which switches playback + closes the sheet).
 *
 * Roadmap §9.4 three-column layout, adapted as an in-player overlay.
 */
@Composable
fun ChannelEpgSideSheet(
    visible: Boolean,
    channels: List<Channel>,
    currentChannelId: String,
    guide: List<Programme>,
    guideLoading: Boolean,
    onSelectChannel: (Channel) -> Unit,
    onChannelFocused: (Channel) -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInHorizontally(initialOffsetX = { -it }) + fadeIn(),
        exit = slideOutHorizontally(targetOffsetX = { -it }) + fadeOut(),
        modifier = modifier.fillMaxSize(),
    ) {
        // Dim the playing video behind the sheet.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MagiTvPalette.Background.copy(alpha = 0.92f)),
        ) {
            Row(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                ChannelListColumn(
                    channels = channels,
                    currentChannelId = currentChannelId,
                    onSelectChannel = onSelectChannel,
                    onChannelFocused = onChannelFocused,
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                )
                ProgrammeGuideColumn(
                    guide = guide,
                    loading = guideLoading,
                    modifier = Modifier.weight(1.2f).fillMaxHeight(),
                )
            }
        }
    }
}

@Composable
private fun ChannelListColumn(
    channels: List<Channel>,
    currentChannelId: String,
    onSelectChannel: (Channel) -> Unit,
    onChannelFocused: (Channel) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    var focusedId by remember { mutableStateOf(currentChannelId) }

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MagiTvPalette.Surface)
            .padding(vertical = 8.dp),
    ) {
        LazyColumn(state = listState) {
            items(channels, key = { it.id }) { channel ->
                val isCurrent = channel.id == currentChannelId
                var focused by remember { mutableStateOf(false) }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            when {
                                focused -> MagiTvPalette.SurfaceFocused
                                isCurrent -> MagiTvPalette.SurfaceElevated
                                else -> MagiTvPalette.Surface
                            },
                        )
                        .border(
                            width = if (focused) 2.dp else 0.dp,
                            color = if (focused) MagiTvPalette.Primary else Color.Transparent,
                            shape = RoundedCornerShape(8.dp),
                        )
                        .onFocusChanged {
                            focused = it.isFocused
                            if (it.isFocused) {
                                focusedId = channel.id
                                onChannelFocused(channel)
                            }
                        }
                        .clickable(
                            role = Role.Button,
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { onSelectChannel(channel) }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MagiTvChannelMark(
                        name = channel.name,
                        seed = channel.id.hashCode(),
                        size = 36.dp,
                        logo = channel.logo,
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = channel.name,
                            color = MagiTvPalette.Text,
                            fontSize = 15.sp,
                            fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = channel.group ?: "其它",
                            color = MagiTvPalette.Muted,
                            fontSize = 12.sp,
                            maxLines = 1,
                        )
                    }
                    if (isCurrent) {
                        Text(
                            text = "LIVE",
                            color = MagiTvPalette.Primary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProgrammeGuideColumn(
    guide: List<Programme>,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    val timeFmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    val nowMs = remember { System.currentTimeMillis() }

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MagiTvPalette.Surface)
            .padding(16.dp),
    ) {
        Text(
            text = "节目单",
            color = MagiTvPalette.Text,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(12.dp))
        when {
            loading -> Text("加载中…", color = MagiTvPalette.Muted, fontSize = 15.sp)
            guide.isEmpty() -> Text("暂无节目单", color = MagiTvPalette.Muted, fontSize = 15.sp)
            else -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(guide.take(20), key = { "${it.startAt}-${it.title}" }) { p ->
                        val start = parseTime(p.startAt)
                        val stop = parseTime(p.stopAt)
                        val isNow = nowMs in (start?.time ?: 0)..(stop?.time ?: 0)
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "${start?.let { timeFmt.format(it) } ?: "--:--"} – ${stop?.let { timeFmt.format(it) } ?: "--:--"}",
                                    color = if (isNow) MagiTvPalette.Primary else MagiTvPalette.Muted,
                                    fontSize = 13.sp,
                                )
                                if (isNow) {
                                    Spacer(Modifier.width(8.dp))
                                    Text("正在播出", color = MagiTvPalette.Primary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            Text(
                                text = p.title ?: "（未命名节目）",
                                color = MagiTvPalette.Text,
                                fontSize = 15.sp,
                                fontWeight = if (isNow) FontWeight.SemiBold else FontWeight.Normal,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun parseTime(iso: String): Date? = runCatching {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
        .parse(iso)
}.getOrNull()
