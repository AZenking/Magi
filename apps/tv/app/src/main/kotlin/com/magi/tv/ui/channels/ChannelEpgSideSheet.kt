package com.magi.tv.ui.channels

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
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
import com.magi.tv.ui.MagiTvActionButton
import com.magi.tv.ui.MagiTvPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DateFmt = DateTimeFormatter.ofPattern("M/d E", Locale.CHINESE)
    .withZone(ZoneId.systemDefault())

private val SafePadding = 48.dp
private val MinTouchTarget = 48.dp
private val ChannelColumnWidth = 300.dp
private val ProgrammeRowHeight = 92.dp

/**
 * Full-screen EPG overlay. The player remains alive behind the overlay and the
 * overlay owns all D-pad focus while visible.
 *
 * The four-hour viewport is intentionally rendered as a fixed lane rather than
 * several nested horizontal LazyRows. Left/right at a lane edge shifts the
 * window by one 30-minute tick, so the time ruler and every channel row always
 * stay aligned on Android TV.
 */
@Composable
fun ChannelEpgSideSheet(
    visible: Boolean,
    channels: List<Channel>,
    groups: List<ChannelGroup>,
    selectedFilter: ChannelDirectoryFilter,
    favoriteChannelIds: Set<String>,
    currentChannelId: String,
    currentChannelName: String?,
    currentChannelPlayable: Boolean,
    guidesByChannel: Map<String, EpgChannelGuideState>,
    guideWindow: EpgTimeWindow,
    tuneError: String?,
    selectedDate: LocalDate,
    onSelectFilter: (ChannelDirectoryFilter) -> Unit,
    onSelectDate: (LocalDate) -> Unit,
    onShiftGuideWindow: (Int) -> Unit,
    onSelectChannel: (Channel) -> Unit,
    onCloseCurrentChannel: () -> Unit,
    onChannelFocused: (Channel) -> Unit,
    onVisibleGuideChannelsChanged: (List<String>) -> Unit,
    onToggleCurrentFavorite: () -> Unit,
    onReconfigure: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val channelFocusRequester = remember { FocusRequester() }
    val programmeFocusRequester = remember { FocusRequester() }
    val headerFocusRequester = remember { FocusRequester() }
    val gridListState = rememberLazyListState()
    var focusZone by remember { mutableStateOf(EpgFocusZone.Channel) }
    val initialFocusChannelId = initialEpgFocusChannelId(channels, currentChannelId)
    var focusedChannelId by remember(initialFocusChannelId) {
        mutableStateOf(initialFocusChannelId.orEmpty())
    }
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(visible) {
        while (visible) {
            nowMs = System.currentTimeMillis()
            delay(30_000)
        }
    }

    val initialGuideState = initialFocusChannelId?.let { id ->
        guidesByChannel[id] ?: guidesByChannel[id.removePrefix("magi:")]
    }
    // Guide data arrives asynchronously. It must not steal focus back to the
    // initial row after the viewer has already navigated elsewhere.
    LaunchedEffect(visible, initialFocusChannelId) {
        if (!visible) return@LaunchedEffect
        if (initialFocusChannelId == null) {
            onVisibleGuideChannelsChanged(emptyList())
            repeat(10) {
                delay(50)
                if (headerFocusRequester.requestFocus()) return@LaunchedEffect
            }
            return@LaunchedEffect
        }
        val initialIndex = channels.indexOfFirst { it.id == initialFocusChannelId }.coerceAtLeast(0)
        gridListState.scrollToItem(initialIndex)
        repeat(10) {
            delay(50)
            val programmes = initialGuideState?.programmes.orEmpty()
            val hasCurrentProgramme = programmes.any { nowMs in it.startAt until it.stopAt }
            val focused = if (hasCurrentProgramme) {
                programmeFocusRequester.requestFocus()
            } else {
                channelFocusRequester.requestFocus()
            }
            if (focused) return@LaunchedEffect
        }
    }

    LaunchedEffect(visible, channels, gridListState) {
        if (!visible) return@LaunchedEffect
        if (channels.isEmpty()) {
            onVisibleGuideChannelsChanged(emptyList())
            return@LaunchedEffect
        }
        snapshotFlow {
            gridListState.layoutInfo.visibleItemsInfo
                .mapNotNull { channels.getOrNull(it.index)?.id }
        }.distinctUntilChanged().collect { ids ->
            onVisibleGuideChannelsChanged(ids)
        }
    }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier.fillMaxSize(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0f to MagiTvPalette.Background.copy(alpha = 0.99f),
                        0.56f to MagiTvPalette.Surface.copy(alpha = 0.985f),
                        1f to MagiTvPalette.Background.copy(alpha = 0.97f),
                    ),
                )
                .onPreviewKeyEvent { event ->
                    if (event.type != KeyEventType.KeyUp) return@onPreviewKeyEvent false
                    when (event.key) {
                        Key.DirectionLeft -> when (focusZone) {
                            EpgFocusZone.Programme -> false
                            else -> {
                                onClose()
                                true
                            }
                        }
                        // Channel cells own Right so they can target the
                        // programme requester for their own row. Do not use a
                        // global requester here or an empty row could jump to
                        // another channel's programme.
                        Key.DirectionRight -> false
                        Key.DirectionUp -> if (
                            focusZone == EpgFocusZone.Channel &&
                                focusedChannelId == initialFocusChannelId
                        ) {
                            headerFocusRequester.requestFocus()
                        } else {
                            false
                        }
                        // Let Compose follow the visual order through date,
                        // filters and the grid. Forcing every Header Down into
                        // the grid made the date/filter rows asymmetric.
                        Key.DirectionDown -> false
                        else -> false
                    }
                },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(SafePadding),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                EpgHeader(
                    groups = groups,
                    selectedFilter = selectedFilter,
                    selectedDate = selectedDate,
                    currentChannelName = currentChannelName,
                    currentChannelId = currentChannelId,
                    currentChannelIsFavorite = currentChannelId in favoriteChannelIds,
                    tuneError = tuneError,
                    nowMs = nowMs,
                    onSelectFilter = onSelectFilter,
                    onSelectDate = onSelectDate,
                    onToggleCurrentFavorite = onToggleCurrentFavorite,
                    onReconfigure = onReconfigure,
                    focusRequester = headerFocusRequester,
                    onFocusZone = { focusZone = EpgFocusZone.Header },
                )

                EpgGrid(
                    channels = channels,
                    currentChannelId = currentChannelId,
                    currentChannelPlayable = currentChannelPlayable,
                    favoriteChannelIds = favoriteChannelIds,
                    guidesByChannel = guidesByChannel,
                    guideWindow = guideWindow,
                    nowMs = nowMs,
                    listState = gridListState,
                    channelFocusRequester = channelFocusRequester,
                    programmeFocusRequester = programmeFocusRequester,
                    focusedChannelId = focusedChannelId,
                    onFocusZone = { focusZone = it },
                    onChannelFocused = { channel ->
                        focusedChannelId = channel.id
                        onChannelFocused(channel)
                    },
                    onSelectChannel = onSelectChannel,
                    onCloseCurrentChannel = onCloseCurrentChannel,
                    onShiftGuideWindow = onShiftGuideWindow,
                    onRequestHeaderFocus = { headerFocusRequester.requestFocus() },
                    modifier = Modifier.fillMaxWidth().weight(1f),
                )
            }
        }
    }
}

private enum class EpgFocusZone {
    Header,
    Channel,
    Programme,
}

/** The player channel if visible, otherwise the first channel in the active filter. */
internal fun initialEpgFocusChannelId(channels: List<Channel>, currentChannelId: String): String? =
    channels.firstOrNull { it.id == currentChannelId }?.id ?: channels.firstOrNull()?.id

/** Selecting the playing channel in EPG is a dismiss action, not a re-tune. */
internal fun shouldCloseEpgForSelectedChannel(
    selectedChannelId: String,
    currentChannelId: String,
    currentChannelPlayable: Boolean,
): Boolean = selectedChannelId == currentChannelId && currentChannelPlayable

@Composable
private fun EpgHeader(
    groups: List<ChannelGroup>,
    selectedFilter: ChannelDirectoryFilter,
    selectedDate: LocalDate,
    currentChannelName: String?,
    currentChannelId: String,
    currentChannelIsFavorite: Boolean,
    tuneError: String?,
    nowMs: Long,
    onSelectFilter: (ChannelDirectoryFilter) -> Unit,
    onSelectDate: (LocalDate) -> Unit,
    onToggleCurrentFavorite: () -> Unit,
    onReconfigure: () -> Unit,
    focusRequester: FocusRequester,
    onFocusZone: () -> Unit,
) {
    val today = LocalDate.now()
    val dates = (0..6).map { today.plusDays(it.toLong()) }
    val dateFocusRequester = remember { FocusRequester() }
    val dateListState = rememberLazyListState()
    val filterListState = rememberLazyListState()
    var dateFocusVersion by remember { mutableStateOf(0) }
    var filterFocusVersion by remember { mutableStateOf(0) }

    LaunchedEffect(selectedDate, dateFocusVersion) {
        dates.indexOf(selectedDate).takeIf { it >= 0 }?.let { dateListState.animateScrollToItem(it) }
        if (dateFocusVersion > 0) {
            delay(50)
            dateFocusRequester.requestFocus()
        }
    }
    LaunchedEffect(selectedFilter, filterFocusVersion, groups) {
        val filterIndex = when (selectedFilter) {
            ChannelDirectoryFilter.All -> 0
            ChannelDirectoryFilter.Favorites -> 1
            ChannelDirectoryFilter.Recent -> 2
            is ChannelDirectoryFilter.Group -> 3 + groups.indexOfFirst { it.name == selectedFilter.name }.coerceAtLeast(0)
        }
        filterListState.animateScrollToItem(filterIndex.coerceIn(0, (3 + groups.size - 1).coerceAtLeast(0)))
        if (filterFocusVersion > 0) {
            delay(50)
            focusRequester.requestFocus()
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("节目单", color = MagiTvPalette.Text, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(12.dp))
            Text(
                text = currentChannelName ?: "未选择频道",
                color = MagiTvPalette.Muted,
                fontSize = 17.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.weight(1f))
            Text("← 返回播放", color = MagiTvPalette.Muted, fontSize = 15.sp)
            Spacer(Modifier.width(16.dp))
            Text(nowMs.toEpgTimeLabel(), color = MagiTvPalette.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("日期", color = MagiTvPalette.Subtle, fontSize = 15.sp, modifier = Modifier.width(44.dp))
            EpgChipRow(
                state = dateListState,
                modifier = Modifier.weight(1f),
            ) {
                items(dates, key = { it.toString() }) { date ->
                    FocusableEpgChip(
                        label = when {
                            date == today -> "今天  ${DateFmt.format(date.atStartOfDay(ZoneId.systemDefault()).toInstant())}"
                            date == today.plusDays(1) -> "明天  ${DateFmt.format(date.atStartOfDay(ZoneId.systemDefault()).toInstant())}"
                            else -> DateFmt.format(date.atStartOfDay(ZoneId.systemDefault()).toInstant())
                        },
                        selected = date == selectedDate,
                        onClick = {
                            onSelectDate(date)
                            dateFocusVersion++
                        },
                        onFocused = onFocusZone,
                        focusRequester = if (date == selectedDate) dateFocusRequester else null,
                    )
                }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("分组", color = MagiTvPalette.Subtle, fontSize = 15.sp, modifier = Modifier.width(44.dp))
            EpgChipRow(
                state = filterListState,
                modifier = Modifier.weight(1f),
            ) {
                item {
                    FocusableEpgChip(
                        label = "全部",
                        selected = selectedFilter == ChannelDirectoryFilter.All,
                        onClick = {
                            onSelectFilter(ChannelDirectoryFilter.All)
                            filterFocusVersion++
                        },
                        onFocused = onFocusZone,
                        focusRequester = if (selectedFilter == ChannelDirectoryFilter.All) focusRequester else null,
                    )
                }
                item {
                    FocusableEpgChip(
                        label = "收藏",
                        selected = selectedFilter == ChannelDirectoryFilter.Favorites,
                        onClick = {
                            onSelectFilter(ChannelDirectoryFilter.Favorites)
                            filterFocusVersion++
                        },
                        onFocused = onFocusZone,
                        focusRequester = if (selectedFilter == ChannelDirectoryFilter.Favorites) focusRequester else null,
                    )
                }
                item {
                    FocusableEpgChip(
                        label = "最近",
                        selected = selectedFilter == ChannelDirectoryFilter.Recent,
                        onClick = {
                            onSelectFilter(ChannelDirectoryFilter.Recent)
                            filterFocusVersion++
                        },
                        onFocused = onFocusZone,
                        focusRequester = if (selectedFilter == ChannelDirectoryFilter.Recent) focusRequester else null,
                    )
                }
                items(groups, key = { it.name ?: "_null" }) { group ->
                    FocusableEpgChip(
                        label = "${group.name ?: "其它"} ${group.count}",
                        selected = selectedFilter == ChannelDirectoryFilter.Group(group.name),
                        onClick = {
                            onSelectFilter(ChannelDirectoryFilter.Group(group.name))
                            filterFocusVersion++
                        },
                        onFocused = onFocusZone,
                        focusRequester = if (selectedFilter == ChannelDirectoryFilter.Group(group.name)) focusRequester else null,
                    )
                }
            }
            Spacer(Modifier.width(10.dp))
            MagiTvActionButton(
                label = if (currentChannelIsFavorite) "★ 已收藏" else "☆ 收藏",
                onClick = onToggleCurrentFavorite,
                compact = true,
                enabled = currentChannelId.isNotBlank(),
                modifier = Modifier.onFocusChanged { if (it.isFocused) onFocusZone() },
            )
        }

        if (tuneError != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(MagiTvPalette.Error.copy(alpha = 0.12f))
                    .border(1.dp, MagiTvPalette.Error.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 7.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("连接异常", color = MagiTvPalette.Error, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(tuneError, color = MagiTvPalette.Muted, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.weight(1f))
                MagiTvActionButton(
                    label = "重新配置",
                    onClick = onReconfigure,
                    compact = true,
                    modifier = Modifier.onFocusChanged { if (it.isFocused) onFocusZone() },
                )
            }
        }
    }
}

/** A TV-friendly horizontal chip row with scroll padding and edge affordances. */
@Composable
private fun EpgChipRow(
    state: androidx.compose.foundation.lazy.LazyListState,
    modifier: Modifier = Modifier,
    content: LazyListScope.() -> Unit,
) {
    Box(modifier = modifier.height(64.dp)) {
        LazyRow(
            state = state,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(start = 4.dp, end = 24.dp),
            modifier = Modifier.fillMaxWidth(),
            content = content,
        )
        if (state.canScrollBackward) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .width(18.dp)
                    .fillMaxHeight()
                    .background(
                        Brush.horizontalGradient(
                            listOf(MagiTvPalette.Background, MagiTvPalette.Background.copy(alpha = 0f)),
                        ),
                    ),
            )
        }
        if (state.canScrollForward) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .width(18.dp)
                    .fillMaxHeight()
                    .background(
                        Brush.horizontalGradient(
                            listOf(MagiTvPalette.Background.copy(alpha = 0f), MagiTvPalette.Background),
                        ),
                    ),
            )
        }
    }
}

@Composable
private fun FocusableEpgChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    onFocused: () -> Unit,
    focusRequester: FocusRequester?,
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(10.dp)
    Box(
        modifier = Modifier
            .defaultMinSize(minHeight = MinTouchTarget)
            .then(focusRequester?.let { Modifier.focusRequester(it) } ?: Modifier)
            .shadow(if (focused) 8.dp else 0.dp, shape, ambientColor = MagiTvPalette.Focus, spotColor = MagiTvPalette.Focus)
            .clip(shape)
            .background(if (focused) MagiTvPalette.SurfaceFocused else if (selected) MagiTvPalette.PrimarySoft else MagiTvPalette.SurfaceElevated)
            .border(
                width = if (focused) 3.dp else if (selected) 2.dp else 1.dp,
                color = if (focused) MagiTvPalette.Focus else if (selected) MagiTvPalette.Primary else MagiTvPalette.Border,
                shape = shape,
            )
            .onFocusChanged {
                focused = it.isFocused
                if (it.isFocused) onFocused()
            }
            .focusable()
            .clickable(
                role = Role.Tab,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (selected) MagiTvPalette.Text else MagiTvPalette.Muted,
            fontSize = 16.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
        )
    }
}

@Composable
private fun EpgGrid(
    channels: List<Channel>,
    currentChannelId: String,
    currentChannelPlayable: Boolean,
    favoriteChannelIds: Set<String>,
    guidesByChannel: Map<String, EpgChannelGuideState>,
    guideWindow: EpgTimeWindow,
    nowMs: Long,
    listState: androidx.compose.foundation.lazy.LazyListState,
    channelFocusRequester: FocusRequester,
    programmeFocusRequester: FocusRequester,
    focusedChannelId: String,
    onFocusZone: (EpgFocusZone) -> Unit,
    onChannelFocused: (Channel) -> Unit,
    onSelectChannel: (Channel) -> Unit,
    onCloseCurrentChannel: () -> Unit,
    onShiftGuideWindow: (Int) -> Unit,
    onRequestHeaderFocus: () -> Boolean,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        TimeRuler(window = guideWindow, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        if (channels.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MagiTvPalette.Surface)
                    .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "这个分类暂无频道",
                        color = MagiTvPalette.Text,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "可在顶部切换分类，或按 ← 返回播放",
                        color = MagiTvPalette.Muted,
                        fontSize = 15.sp,
                    )
                }
            }
            return@Column
        }
        LazyColumn(
            state = listState,
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            items(channels, key = { it.id }) { channel ->
                val initialChannelId = initialEpgFocusChannelId(channels, currentChannelId)
                val rowChannelFocusRequester = remember(channel.id) { FocusRequester() }
                val rowProgrammeFocusRequester = remember(channel.id) { FocusRequester() }
                val isInitialChannel = channel.id == initialChannelId
                val channelRowFocusRequester = if (isInitialChannel) {
                    channelFocusRequester
                } else {
                    rowChannelFocusRequester
                }
                val rowProgrammeRequester = if (isInitialChannel) {
                    programmeFocusRequester
                } else {
                    rowProgrammeFocusRequester
                }
                EpgChannelRow(
                    channel = channel,
                    isCurrent = channel.id == currentChannelId,
                    isFocusedChannel = channel.id == focusedChannelId,
                    isFavorite = channel.id in favoriteChannelIds,
                    guideState = guidesByChannel[channel.id] ?: guidesByChannel[channel.id.removePrefix("magi:")],
                    window = guideWindow,
                    nowMs = nowMs,
                    focusRequester = channelRowFocusRequester,
                    programmeFocusRequester = rowProgrammeRequester,
                    onFocusZone = onFocusZone,
                    onFocusChannel = { onChannelFocused(channel) },
                    onSelectChannel = {
                        if (shouldCloseEpgForSelectedChannel(channel.id, currentChannelId, currentChannelPlayable)) {
                            onCloseCurrentChannel()
                        } else {
                            onSelectChannel(channel)
                        }
                    },
                    onPlayChannel = {
                        if (shouldCloseEpgForSelectedChannel(channel.id, currentChannelId, currentChannelPlayable)) {
                            onCloseCurrentChannel()
                        } else {
                            onSelectChannel(channel)
                        }
                    },
                    onShiftGuideWindow = onShiftGuideWindow,
                    onRequestHeaderFocus = if (channel.id == initialChannelId) {
                        onRequestHeaderFocus
                    } else {
                        { false }
                    },
                )
            }
        }
    }
}

@Composable
private fun TimeRuler(window: EpgTimeWindow, modifier: Modifier = Modifier) {
    Row(modifier = modifier.height(42.dp)) {
        Box(
            modifier = Modifier
                .width(ChannelColumnWidth)
                .fillMaxHeight()
                .clip(RoundedCornerShape(10.dp))
                .background(MagiTvPalette.Surface)
                .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(10.dp))
                .padding(horizontal = 16.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text("频道", color = MagiTvPalette.Text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(8.dp))
        TimeLane(window = window, modifier = Modifier.weight(1f).fillMaxHeight())
    }
}

@Composable
private fun TimeLane(window: EpgTimeWindow, modifier: Modifier = Modifier) {
    BoxWithConstraints(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(MagiTvPalette.Surface)
            .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(10.dp)),
    ) {
        val width = maxWidth
        val tickCount = ((window.endAt - window.startAt) / window.stepMs).toInt()
        for (index in 0..tickCount) {
            val fraction = index.toFloat() / tickCount.coerceAtLeast(1)
            val x = width * fraction
            Box(
                modifier = Modifier
                    .offset(x = x - 1.dp)
                    .width(2.dp)
                    .fillMaxHeight()
                    .background(MagiTvPalette.Border.copy(alpha = 0.55f)),
            )
            if (index < tickCount) {
                Text(
                    text = (window.startAt + index * window.stepMs).toEpgTimeLabel(),
                    color = MagiTvPalette.Muted,
                    fontSize = 14.sp,
                    modifier = Modifier.offset(x = x + 8.dp, y = 10.dp),
                )
            }
        }
    }
}

@Composable
private fun EpgChannelRow(
    channel: Channel,
    isCurrent: Boolean,
    isFocusedChannel: Boolean,
    isFavorite: Boolean,
    guideState: EpgChannelGuideState?,
    window: EpgTimeWindow,
    nowMs: Long,
    focusRequester: FocusRequester,
    programmeFocusRequester: FocusRequester,
    onFocusZone: (EpgFocusZone) -> Unit,
    onFocusChannel: () -> Unit,
    onSelectChannel: () -> Unit,
    onPlayChannel: () -> Unit,
    onShiftGuideWindow: (Int) -> Unit,
    onRequestHeaderFocus: () -> Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ProgrammeRowHeight),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ChannelCell(
            channel = channel,
            isCurrent = isCurrent,
            isFocused = isFocusedChannel,
            isFavorite = isFavorite,
            focusRequester = focusRequester,
            onFocusZone = { onFocusZone(EpgFocusZone.Channel) },
            onFocusChannel = onFocusChannel,
            onSelectChannel = onSelectChannel,
            onRequestProgrammeFocus = { programmeFocusRequester.requestFocus() },
            onRequestHeaderFocus = onRequestHeaderFocus,
            modifier = Modifier.width(ChannelColumnWidth).fillMaxHeight(),
        )
        ProgrammeLane(
            channel = channel,
            guideState = guideState,
            window = window,
            nowMs = nowMs,
            focusRequester = programmeFocusRequester,
            onFocusZone = { onFocusZone(EpgFocusZone.Programme) },
            onPlayChannel = onPlayChannel,
            onShiftGuideWindow = onShiftGuideWindow,
            onRequestChannelFocus = { focusRequester.requestFocus() },
            modifier = Modifier.weight(1f).fillMaxHeight(),
        )
    }
}

@Composable
private fun ChannelCell(
    channel: Channel,
    isCurrent: Boolean,
    isFocused: Boolean,
    isFavorite: Boolean,
    focusRequester: FocusRequester,
    onFocusZone: () -> Unit,
    onFocusChannel: () -> Unit,
    onSelectChannel: () -> Unit,
    onRequestProgrammeFocus: () -> Boolean,
    onRequestHeaderFocus: () -> Boolean,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .focusRequester(focusRequester)
            .clip(RoundedCornerShape(10.dp))
            .background(if (isFocused) MagiTvPalette.SurfaceFocused else if (isCurrent) MagiTvPalette.SurfaceElevated else MagiTvPalette.Surface)
            .border(if (isFocused) 3.dp else 1.dp, if (isFocused) MagiTvPalette.Focus else MagiTvPalette.Border, RoundedCornerShape(10.dp))
            .onFocusChanged { if (it.isFocused) { onFocusZone(); onFocusChannel() } }
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (event.key) {
                    Key.DirectionRight -> onRequestProgrammeFocus()
                    Key.DirectionUp -> onRequestHeaderFocus()
                    else -> false
                }
            }
            .focusable()
            .clickable(
                role = Role.Button,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onSelectChannel,
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ChannelLogo(channel)
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                channel.channelNumber?.let {
                    Text("$it", color = MagiTvPalette.Subtle, fontSize = 13.sp)
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    text = channel.name,
                    color = MagiTvPalette.Text,
                    fontSize = 16.sp,
                    fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isFavorite) Text("★", color = MagiTvPalette.Warning, fontSize = 13.sp)
                if (isCurrent) {
                    Spacer(Modifier.width(5.dp))
                    Text("LIVE", color = MagiTvPalette.Live, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun ProgrammeLane(
    channel: Channel,
    guideState: EpgChannelGuideState?,
    window: EpgTimeWindow,
    nowMs: Long,
    focusRequester: FocusRequester,
    onFocusZone: () -> Unit,
    onPlayChannel: () -> Unit,
    onShiftGuideWindow: (Int) -> Unit,
    onRequestChannelFocus: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val placements = guideState?.programmes.orEmpty().mapNotNull { it.placementIn(window) }
    val placementKeys = remember(placements) {
        placements.map { "${it.programme.startAt}:${it.programme.stopAt}:${it.programme.title}" }
    }
    val rememberedFocusRequesters = remember(placementKeys) {
        List(placements.size) { FocusRequester() }
    }
    val targetIndex = placements.indexOfFirst { nowMs in it.programme.startAt until it.programme.stopAt }
        .takeIf { it >= 0 }
        ?: placements.indices.firstOrNull()
    val focusRequesters = rememberedFocusRequesters.mapIndexed { index, requester ->
        if (index == targetIndex) focusRequester else requester
    }
    BoxWithConstraints(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(MagiTvPalette.Surface)
            .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(10.dp)),
    ) {
        val laneWidth = maxWidth
        Canvas(Modifier.matchParentSize()) {
            val tickCount = ((window.endAt - window.startAt) / window.stepMs).toInt().coerceAtLeast(1)
            for (index in 0..tickCount) {
                val x = size.width * index / tickCount
                drawLine(
                    color = MagiTvPalette.Border.copy(alpha = 0.5f),
                    start = Offset(x, 0f),
                    end = Offset(x, size.height),
                    strokeWidth = 1f,
                )
            }
            if (nowMs in window.startAt until window.endAt) {
                val x = size.width * ((nowMs - window.startAt).toFloat() / (window.endAt - window.startAt).toFloat())
                drawLine(
                    color = MagiTvPalette.Live,
                    start = Offset(x, 0f),
                    end = Offset(x, size.height),
                    strokeWidth = 2f,
                )
            }
        }

        if (guideState?.stale == true) {
            Text(
                text = "缓存节目单",
                color = MagiTvPalette.Warning,
                fontSize = 12.sp,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }

        if (guideState?.loading == true && placements.isEmpty()) {
            Row(
                modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("加载节目单…", color = MagiTvPalette.Muted, fontSize = 15.sp)
            }
        } else if (placements.isEmpty()) {
            Row(
                modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (guideState?.error != null) "节目单加载失败" else "暂无节目单",
                    color = if (guideState?.error != null) MagiTvPalette.Error else MagiTvPalette.Muted,
                    fontSize = 15.sp,
                )
            }
        }

        placements.forEachIndexed { index, placement ->
            val x = laneWidth * (placement.startOffsetMs.toFloat() / (window.endAt - window.startAt).toFloat())
            val width = (laneWidth * (placement.durationMs.toFloat() / (window.endAt - window.startAt).toFloat()))
                .coerceAtLeast(84.dp)
            val isNow = nowMs in placement.programme.startAt until placement.programme.stopAt
            ProgrammeBlock(
                placement = placement,
                isNow = isNow,
                nowMs = nowMs,
                focusRequester = focusRequesters[index],
                onFocusZone = onFocusZone,
                onPlayChannel = onPlayChannel,
                onMoveToPrevious = {
                    if (index > 0) focusRequesters[index - 1].requestFocus()
                    else {
                        onRequestChannelFocus()
                        true
                    }
                },
                onMoveToNext = {
                    if (index < placements.lastIndex) focusRequesters[index + 1].requestFocus()
                    else {
                        onShiftGuideWindow(1)
                        true
                    }
                },
                modifier = Modifier
                    .offset(x = x)
                    .width(width)
                    .fillMaxHeight()
                    .padding(4.dp),
            )
        }
    }
}

@Composable
private fun ProgrammeBlock(
    placement: EpgProgrammePlacement,
    isNow: Boolean,
    nowMs: Long,
    focusRequester: FocusRequester,
    onFocusZone: () -> Unit,
    onPlayChannel: () -> Unit,
    onMoveToPrevious: () -> Boolean,
    onMoveToNext: () -> Boolean,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val title = placement.programme.title?.takeIf { it.isNotBlank() } ?: "未命名节目"
    Box(
        modifier = modifier
            .focusRequester(focusRequester)
            .clip(RoundedCornerShape(8.dp))
            .background(
                when {
                    focused -> MagiTvPalette.SurfaceFocused
                    isNow -> MagiTvPalette.PrimarySoft
                    else -> MagiTvPalette.SurfaceElevated
                },
            )
            .border(
                width = if (focused) 3.dp else 1.dp,
                color = when {
                    focused -> MagiTvPalette.Focus
                    isNow -> MagiTvPalette.Primary
                    else -> MagiTvPalette.Border
                },
                shape = RoundedCornerShape(8.dp),
            )
            .onFocusChanged {
                focused = it.isFocused
                if (it.isFocused) onFocusZone()
            }
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (event.key) {
                    Key.DirectionLeft -> onMoveToPrevious()
                    Key.DirectionRight -> onMoveToNext()
                    else -> false
                }
            }
            .focusable()
            .clickable(
                role = Role.Button,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onPlayChannel,
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "${placement.programme.startAt.toEpgTimeLabel()}–${placement.programme.stopAt.toEpgTimeLabel()}",
                    color = if (isNow) MagiTvPalette.Primary else MagiTvPalette.Muted,
                    fontSize = 13.sp,
                    maxLines = 1,
                )
                if (isNow) {
                    Spacer(Modifier.width(6.dp))
                    Text("正在播出", color = MagiTvPalette.Live, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
            Text(
                text = title,
                color = MagiTvPalette.Text,
                fontSize = 16.sp,
                fontWeight = if (isNow) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (isNow) {
                val total = (placement.programme.stopAt - placement.programme.startAt).coerceAtLeast(1L)
                val elapsed = (nowMs - placement.programme.startAt).coerceIn(0L, total)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(MagiTvPalette.Border),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(elapsed.toFloat() / total)
                            .height(3.dp)
                            .background(MagiTvPalette.Primary),
                    )
                }
            }
        }
    }
}

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
