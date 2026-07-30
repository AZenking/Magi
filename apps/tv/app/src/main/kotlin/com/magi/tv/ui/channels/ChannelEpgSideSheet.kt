package com.magi.tv.ui.channels

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.magi.tv.domain.model.Channel
import com.magi.tv.domain.model.ChannelGroup
import com.magi.tv.domain.model.Programme
import com.magi.tv.ui.MagiTvPalette
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val TimeFmt = DateTimeFormatter.ofPattern("HH:mm")
    .withZone(ZoneId.systemDefault())
private val DateFmt = DateTimeFormatter.ofPattern("M/d E", Locale.CHINESE)
    .withZone(ZoneId.systemDefault())

// Constitution VIII: safe area margins.
private val SafePadding = 48.dp
// Constitution VIII: minimum touch target.
private val MinTouchTarget = 48.dp

/**
 * Full-screen overlay: compact top header (date/group selectors + now + now-playing)
 * + three-column body (channels 26% / time 9% / programmes 65%).
 *
 * All rows are focusable + clickable for D-pad. Programme cards have 84dp base height
 * with focus outline. Logo uses rounded-rect ContentScale.Fit. nowMs ticks every minute.
 */
@Composable
fun ChannelEpgSideSheet(
    visible: Boolean,
    channels: List<Channel>,
    groups: List<ChannelGroup>,
    selectedGroup: String?,
    currentChannelId: String,
    currentChannelName: String?,
    guide: List<Programme>,
    guideLoading: Boolean,
    guideError: TvError?,
    guideStale: Boolean,
    tuneError: String?,
    selectedDate: LocalDate,
    onSelectGroup: (String?) -> Unit,
    onSelectDate: (LocalDate) -> Unit,
    onSelectChannel: (Channel) -> Unit,
    onPlayCurrent: () -> Unit,
    onChannelFocused: (Channel) -> Unit,
    onReconfigure: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // nowMs ticks every minute to refresh "正在播出" + progress.
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(visible) {
        while (visible) {
            nowMs = System.currentTimeMillis()
            delay(60_000)
        }
    }

    AnimatedVisibility(
        visible = visible,
        enter = slideInHorizontally(initialOffsetX = { -it }) + fadeIn(),
        exit = slideOutHorizontally(targetOffsetX = { -it }) + fadeOut(),
        modifier = modifier.fillMaxSize(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MagiTvPalette.Background.copy(alpha = 0.95f)),
        ) {
            Column(
                modifier = Modifier.fillMaxSize().padding(SafePadding),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TopHeader(
                    groups = groups,
                    selectedGroup = selectedGroup,
                    onSelectGroup = onSelectGroup,
                    selectedDate = selectedDate,
                    onSelectDate = onSelectDate,
                    currentChannelName = currentChannelName,
                    tuneError = tuneError,
                    nowMs = nowMs,
                )

                Row(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    // Column 1: channels (26%)
                    ChannelListColumn(
                        visible = visible,
                        channels = channels,
                        currentChannelId = currentChannelId,
                        onSelectChannel = onSelectChannel,
                        onChannelFocused = onChannelFocused,
                        modifier = Modifier.weight(0.26f).fillMaxHeight(),
                    )
                    // Column 2+3: time (9%) + programmes (65%) merged into one scrollable list
                    ProgrammeColumn(
                        guide = guide,
                        loading = guideLoading,
                        error = guideError,
                        stale = guideStale,
                        nowMs = nowMs,
                        onPlayChannel = onPlayCurrent,
                        onReconfigure = onReconfigure,
                        modifier = Modifier.weight(0.74f).fillMaxHeight(),
                    )
                }
            }
        }
    }
}

// --- Compact top header ---

@Composable
private fun TopHeader(
    groups: List<ChannelGroup>,
    selectedGroup: String?,
    onSelectGroup: (String?) -> Unit,
    selectedDate: LocalDate,
    onSelectDate: (LocalDate) -> Unit,
    currentChannelName: String?,
    tuneError: String?,
    nowMs: Long,
    modifier: Modifier = Modifier,
) {
    val today = LocalDate.now()
    val dates = (0..6).map { today.plusDays(it.toLong()) }
    val nowStr = TimeFmt.format(Instant.ofEpochMilli(nowMs))

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Row 1: back hint + now time + date selector (compact single row)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("‹ 返回", color = MagiTvPalette.Muted, fontSize = 16.sp)
            Spacer(Modifier.weight(1f))
            Text(nowStr, color = MagiTvPalette.Muted, fontSize = 16.sp)
            dates.forEach { date ->
                val label = if (date == today) "今天" else DateFmt.format(date.atStartOfDay(ZoneId.systemDefault()).toInstant())
                FocusableFilterChip(
                    label = label,
                    selected = date == selectedDate,
                    onClick = { onSelectDate(date) },
                )
            }
        }
        // Row 2: group selector in LazyRow (scrolls, all groups reachable) + now-playing
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text("正在播放：${currentChannelName ?: "—"}",
                color = MagiTvPalette.Primary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            if (tuneError != null) {
                Spacer(Modifier.width(12.dp))
                Text(
                    text = "⚠ 切换失败：$tuneError",
                    color = MagiTvPalette.Error,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        androidx.compose.foundation.lazy.LazyRow(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                FocusableFilterChip(label = "全部", selected = selectedGroup == null, onClick = { onSelectGroup(null) })
            }
            items(groups, key = { it.name ?: "_null" }) { g ->
                FocusableFilterChip(
                    label = "${g.name ?: "其它"} ${g.count}",
                    selected = selectedGroup == g.name,
                    onClick = { onSelectGroup(g.name) },
                )
            }
        }
    }
}

/** Filter chip with DISTINCT focus vs selected states (constitution VIII: focus ≠ selected). */
@Composable
private fun FocusableFilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val bg = when {
        focused -> MagiTvPalette.SurfaceFocused
        selected -> MagiTvPalette.Primary.copy(alpha = 0.2f)
        else -> MagiTvPalette.SurfaceElevated
    }
    val borderC = when {
        focused -> MagiTvPalette.Primary
        selected -> MagiTvPalette.Primary.copy(alpha = 0.5f)
        else -> MagiTvPalette.Border
    }
    val textC = if (selected) MagiTvPalette.Primary else MagiTvPalette.Muted
    Box(
        modifier = Modifier
            .defaultMinSize(minHeight = MinTouchTarget) // constitution: ≥48dp touch target
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .border(if (focused) 2.dp else 1.dp, borderC, RoundedCornerShape(8.dp))
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = textC,
            fontSize = 16.sp, // constitution: key text ≥16sp
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        )
    }
}

// --- Channel list column ---

@Composable
private fun ChannelListColumn(
    visible: Boolean,
    channels: List<Channel>,
    currentChannelId: String,
    onSelectChannel: (Channel) -> Unit,
    onChannelFocused: (Channel) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    val focusReq = remember { FocusRequester() }

    // Bind focus to current channel if in list, else first item.
    val focusTargetId = if (channels.any { it.id == currentChannelId }) currentChannelId
        else channels.firstOrNull()?.id

    LaunchedEffect(visible, channels.size, focusTargetId) {
        if (visible && channels.isNotEmpty()) {
            val idx = channels.indexOfFirst { it.id == focusTargetId }.coerceAtLeast(0)
            listState.scrollToItem(idx)
            runCatching { focusReq.requestFocus() }
        }
    }

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(MagiTvPalette.Surface)
            .padding(vertical = 4.dp),
    ) {
        LazyColumn(state = listState) {
            items(channels, key = { it.id }) { channel ->
                val isCurrent = channel.id == currentChannelId
                val isFocusTarget = channel.id == focusTargetId
                var focused by remember { mutableStateOf(false) }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(if (isFocusTarget) Modifier.focusRequester(focusReq) else Modifier)
                        .defaultMinSize(minHeight = MinTouchTarget)
                        .padding(horizontal = 4.dp, vertical = 2.dp)
                        .clip(RoundedCornerShape(6.dp))
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
                            shape = RoundedCornerShape(6.dp),
                        )
                        .onFocusChanged {
                            focused = it.isFocused
                            if (it.isFocused) onChannelFocused(channel)
                        }
                        .focusable()
                        .clickable(
                            role = Role.Button,
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { onSelectChannel(channel) }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ChannelLogo(channel)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = channel.name,
                        color = MagiTvPalette.Text,
                        fontSize = 16.sp, // constitution: key text ≥16sp
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (isCurrent) {
                        Text("LIVE", color = MagiTvPalette.Primary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

/** Channel logo: rounded-rect ContentScale.Fit (constitution: not forced circle). */
@Composable
private fun ChannelLogo(channel: Channel) {
    val size = 56.dp
    if (!channel.logo.isNullOrEmpty()) {
        AsyncImage(
            model = channel.logo,
            contentDescription = channel.name,
            contentScale = ContentScale.Fit,
            modifier = Modifier.size(size).clip(RoundedCornerShape(6.dp)),
        )
    } else {
        Box(
            modifier = Modifier
                .size(size)
                .clip(RoundedCornerShape(6.dp))
                .background(MagiTvPalette.Primary.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = channel.name.firstOrNull()?.toString()?.uppercase() ?: "?",
                color = MagiTvPalette.Primary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

// --- Programme column (time column + programme cards, all focusable) ---

@Composable
private fun ProgrammeColumn(
    guide: List<Programme>,
    loading: Boolean,
    error: TvError?,
    stale: Boolean,
    nowMs: Long,
    onPlayChannel: () -> Unit,
    onReconfigure: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()

    // Auto-scroll to the current programme ONLY when the guide changes
    // (new channel / new date). Do NOT re-trigger on nowMs tick — that would
    // yank the scroll position back while the user is browsing.
    LaunchedEffect(guide) {
        if (guide.isNotEmpty()) {
            val nowIdx = guide.indexOfFirst { nowMs in it.startAt..it.stopAt }
            val target = if (nowIdx >= 0) nowIdx else 0
            listState.scrollToItem(target)
        }
    }
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(MagiTvPalette.Surface)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("节目单", color = MagiTvPalette.Text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            if (stale) {
                Spacer(Modifier.width(8.dp))
                Text("数据可能已过期", color = MagiTvPalette.Muted, fontSize = 16.sp)
            }
        }
        Spacer(Modifier.height(8.dp))
        when {
            loading -> Text("加载中…", color = MagiTvPalette.Muted, fontSize = 16.sp)
            error is TvError.Unauthorized -> Column {
                Text("鉴权失败", color = MagiTvPalette.Error, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                Text("API Key 可能已过期。", color = MagiTvPalette.Muted, fontSize = 16.sp)
                Spacer(Modifier.height(8.dp))
                com.magi.tv.ui.MagiTvActionButton(label = "重新配置", onClick = onReconfigure, primary = true, compact = true)
            }
            error != null && guide.isEmpty() -> Text(error.message, color = MagiTvPalette.Muted, fontSize = 16.sp)
            guide.isEmpty() -> Text("该频道暂无节目单", color = MagiTvPalette.Muted, fontSize = 16.sp)
            else -> {
                LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(guide, key = { "${it.startAt}-${it.title}" }) { p ->
                        ProgrammeCard(p, nowMs, onPlayChannel = onPlayChannel)
                    }
                }
            }
        }
    }
}

/** Programme card: 84dp base height, focusable, focus outline, current-programme progress.
 *  Current programme OK → play channel; past/future OK → no-op (detail popup later). */
@Composable
private fun ProgrammeCard(p: Programme, nowMs: Long, onPlayChannel: () -> Unit) {
    val isNow = nowMs in p.startAt..p.stopAt
    var focused by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 84.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (focused) MagiTvPalette.SurfaceFocused else MagiTvPalette.SurfaceElevated)
            .border(
                width = if (focused) 2.dp else 0.dp,
                color = if (focused) MagiTvPalette.Primary else Color.Transparent,
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged { focused = it.isFocused }
            .focusable()
            .clickable(
                role = Role.Button,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { if (isNow) onPlayChannel() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "${TimeFmt.format(Instant.ofEpochMilli(p.startAt))} – ${TimeFmt.format(Instant.ofEpochMilli(p.stopAt))}",
                color = if (isNow) MagiTvPalette.Primary else MagiTvPalette.Muted,
                fontSize = 16.sp, // constitution: key text ≥16sp
            )
            if (isNow) {
                Spacer(Modifier.width(8.dp))
                Text("● 正在播出", color = MagiTvPalette.Primary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = p.title ?: "（未命名节目）",
            color = MagiTvPalette.Text,
            fontSize = 16.sp,
            fontWeight = if (isNow) FontWeight.SemiBold else FontWeight.Normal,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        // Progress bar for current programme
        if (isNow) {
            val total = (p.stopAt - p.startAt).coerceAtLeast(1L)
            val elapsed = (nowMs - p.startAt).coerceIn(0L, total)
            val remaining = ((p.stopAt - nowMs) / 60_000L).coerceAtLeast(0L)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(3.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(MagiTvPalette.Border),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(elapsed.toFloat() / total)
                            .height(3.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(MagiTvPalette.Primary),
                    )
                }
                Spacer(Modifier.width(8.dp))
                Text("剩余 ${remaining}min", color = MagiTvPalette.Muted, fontSize = 14.sp)
            }
        }
    }
}
