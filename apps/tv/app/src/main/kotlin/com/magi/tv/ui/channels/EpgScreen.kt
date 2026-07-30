package com.magi.tv.ui.channels

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.magi.tv.domain.model.Channel
import com.magi.tv.domain.model.Programme
import com.magi.tv.ui.MagiTvPalette
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

private val EpgBackground = MagiTvPalette.Background
private val EpgSurface = MagiTvPalette.Surface
private val EpgCard = MagiTvPalette.SurfaceElevated
private val EpgCardFocused = MagiTvPalette.SurfaceFocused
private val EpgBorder = MagiTvPalette.Border
private val EpgPrimary = MagiTvPalette.Primary
private val EpgText = MagiTvPalette.Text
private val EpgMuted = MagiTvPalette.Muted
private val LiveRed = MagiTvPalette.Live

private const val GuideWindowHours = 3
private const val MaximumGuideChannels = 6
private const val HalfHourMs = 30 * 60 * 1000L
private const val GuideWindowMs = GuideWindowHours * 60 * 60 * 1000L

/**
 * High-fidelity TV programme guide.
 *
 * The all-channel entry renders a channel × time grid. A channel-specific entry
 * uses the same surface with one row, preserving the same D-pad interaction and
 * programme-detail panel.
 */
@Composable
fun EpgScreen(
    state: EpgUiState,
    channels: List<Channel>,
    channelId: String,
    channelName: String,
    modifier: Modifier = Modifier,
) {
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var selectedProgramme by remember { mutableStateOf<Programme?>(null) }
    val programmes = state.programmes
    LaunchedEffect(Unit) {
        while (true) {
            nowMs = System.currentTimeMillis()
            delay(30_000)
        }
    }

    val windowStart = remember(nowMs) { floorToHalfHour(nowMs) }
    val windowEnd = windowStart + GuideWindowMs
    val rows = remember(programmes, channels, channelId, channelName, windowStart) {
        buildGuideRows(
            programmes = programmes,
            channels = channels,
            requestedChannelId = channelId,
            requestedChannelName = channelName,
            windowStart = windowStart,
            windowEnd = windowEnd,
        )
    }

    LaunchedEffect(programmes, nowMs) {
        val currentSelection = selectedProgramme
        if (currentSelection == null || currentSelection !in programmes) {
            selectedProgramme = programmes.firstOrNull { isNow(it, nowMs) }
                ?: programmes.firstOrNull()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(EpgBackground)
            .padding(horizontal = 28.dp, vertical = 22.dp),
    ) {
        GuideHeader(nowMs = nowMs)
        Spacer(Modifier.height(18.dp))

        when {
            state.loading -> GuideMessage {
                CircularProgressIndicator(color = EpgPrimary, strokeWidth = 3.dp)
                Spacer(Modifier.height(16.dp))
                Text("节目单加载中…", color = EpgMuted, fontSize = 18.sp)
            }
            state.errorMessage != null -> GuideMessage {
                Text(
                    text = "节目单加载失败",
                    color = EpgText,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(state.errorMessage.orEmpty(), color = EpgMuted, fontSize = 16.sp)
            }
            rows.isEmpty() -> GuideMessage {
                Text("暂无节目单", color = EpgText, fontSize = 22.sp)
                Spacer(Modifier.height(8.dp))
                Text("当前时间段没有可显示的节目", color = EpgMuted, fontSize = 16.sp)
            }
            else -> {
                GuideBody(
                    rows = rows,
                    selectedProgramme = selectedProgramme,
                    nowMs = nowMs,
                    windowStart = windowStart,
                    windowEnd = windowEnd,
                    onProgrammeFocused = { selectedProgramme = it },
                )
            }
        }
    }
}

@Composable
private fun GuideHeader(nowMs: Long) {
    val dateText = remember(nowMs) {
        SimpleDateFormat("今天 M月d日 E", Locale.SIMPLIFIED_CHINESE).format(Date(nowMs))
    }
    val timeText = remember(nowMs) {
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(nowMs))
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "MAGI TV",
            color = EpgText,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp,
        )
        Spacer(Modifier.width(46.dp))
        Text(
            text = "节目单",
            color = EpgText,
            fontSize = 34.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.width(28.dp))
        Text(
            text = dateText,
            color = EpgMuted,
            fontSize = 18.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.weight(1f))
        Text(
            text = timeText,
            color = EpgText,
            fontSize = 32.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun GuideMessage(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
        content = content,
    )
}

@Composable
private fun GuideBody(
    rows: List<GuideChannelRow>,
    selectedProgramme: Programme?,
    nowMs: Long,
    windowStart: Long,
    windowEnd: Long,
    onProgrammeFocused: (Programme) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxSize(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            TimelineHeader(
                windowStart = windowStart,
                windowEnd = windowEnd,
                nowMs = nowMs,
            )
            Spacer(Modifier.height(8.dp))
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                rows.forEachIndexed { index, row ->
                    GuideChannelRow(
                        row = row,
                        rowIndex = index,
                        selectedProgramme = selectedProgramme,
                        nowMs = nowMs,
                        windowStart = windowStart,
                        windowEnd = windowEnd,
                        onProgrammeFocused = onProgrammeFocused,
                    )
                }
            }
        }
        ProgrammeDetailsPanel(
            programme = selectedProgramme,
            channel = rows.firstOrNull {
                normalizeChannelId(it.channelId) ==
                    normalizeChannelId(selectedProgramme?.channelId.orEmpty())
            },
            nowMs = nowMs,
            modifier = Modifier
                .width(286.dp)
                .fillMaxHeight(),
        )
    }
}

@Composable
private fun TimelineHeader(
    windowStart: Long,
    windowEnd: Long,
    nowMs: Long,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Spacer(Modifier.width(210.dp))
        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
        ) {
            val labelWidth = 54.dp
            repeat(GuideWindowHours * 2 + 1) { index ->
                val tickMs = windowStart + index * HalfHourMs
                val ratio = (tickMs - windowStart).toFloat() / (windowEnd - windowStart)
                val x = (maxWidth * ratio - labelWidth / 2)
                    .coerceIn(0.dp, maxWidth - labelWidth)
                Text(
                    text = formatTime(tickMs),
                    modifier = Modifier
                        .width(labelWidth)
                        .offset(x = x),
                    color = EpgMuted,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
            }

            if (nowMs in windowStart..windowEnd) {
                val nowRatio = (nowMs - windowStart).toFloat() / (windowEnd - windowStart)
                val x = (maxWidth * nowRatio - 24.dp)
                    .coerceIn(0.dp, maxWidth - 48.dp)
                Box(
                    modifier = Modifier
                        .offset(x = x, y = (-5).dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(EpgPrimary)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Text(
                        text = formatTime(nowMs),
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun GuideChannelRow(
    row: GuideChannelRow,
    rowIndex: Int,
    selectedProgramme: Programme?,
    nowMs: Long,
    windowStart: Long,
    windowEnd: Long,
    onProgrammeFocused: (Programme) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(82.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        ChannelIdentity(
            row = row,
            rowIndex = rowIndex,
            modifier = Modifier.width(205.dp),
        )
        TimelineRow(
            programmes = row.programmes,
            selectedProgramme = selectedProgramme,
            nowMs = nowMs,
            windowStart = windowStart,
            windowEnd = windowEnd,
            onProgrammeFocused = onProgrammeFocused,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ChannelIdentity(
    row: GuideChannelRow,
    rowIndex: Int,
    modifier: Modifier = Modifier,
) {
    val logoColors = listOf(
        Color(0xFF2188FF),
        Color(0xFFFFB020),
        Color(0xFF67C23A),
        Color(0xFF8B5CF6),
        Color(0xFFFF4D6D),
        Color(0xFF18B8C9),
    )
    val logoColor = logoColors[rowIndex % logoColors.size]
    val channelMark = row.name.firstOrNull()?.toString() ?: "M"

    Row(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(8.dp))
            .background(EpgSurface)
            .border(1.dp, EpgBorder, RoundedCornerShape(8.dp))
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(logoColor.copy(alpha = 0.2f))
                .border(2.dp, logoColor, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = channelMark,
                color = logoColor,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = row.number ?: "${rowIndex + 1}",
                color = EpgText,
                fontSize = 19.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = row.name,
                color = EpgMuted,
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun TimelineRow(
    programmes: List<GuideProgramme>,
    selectedProgramme: Programme?,
    nowMs: Long,
    windowStart: Long,
    windowEnd: Long,
    onProgrammeFocused: (Programme) -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(8.dp))
            .background(EpgSurface),
    ) {
        programmes.forEach { item ->
            val clippedStart = max(item.startMs, windowStart)
            val clippedEnd = min(item.stopMs, windowEnd)
            if (clippedEnd > clippedStart) {
                val startRatio =
                    (clippedStart - windowStart).toFloat() / (windowEnd - windowStart)
                val widthRatio =
                    (clippedEnd - clippedStart).toFloat() / (windowEnd - windowStart)
                val x = maxWidth * startRatio
                val width = (maxWidth * widthRatio - 4.dp).coerceAtLeast(48.dp)

                ProgrammeCard(
                    item = item,
                    selected = selectedProgramme == item.programme,
                    isLive = isNow(item.programme, nowMs),
                    onFocused = { onProgrammeFocused(item.programme) },
                    modifier = Modifier
                        .offset(x = x)
                        .width(width)
                        .fillMaxHeight(),
                )
            }
        }

        if (nowMs in windowStart..windowEnd) {
            val nowRatio = (nowMs - windowStart).toFloat() / (windowEnd - windowStart)
            Box(
                modifier = Modifier
                    .offset(x = maxWidth * nowRatio)
                    .width(1.dp)
                    .fillMaxHeight()
                    .background(EpgPrimary)
                    .zIndex(4f),
            )
        }
    }
}

@Composable
private fun ProgrammeCard(
    item: GuideProgramme,
    selected: Boolean,
    isLive: Boolean,
    onFocused: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val emphasized = focused || selected
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.035f else 1f,
        animationSpec = tween(140),
        label = "programme-focus-scale",
    )
    val shape = RoundedCornerShape(7.dp)

    Column(
        modifier = modifier
            .padding(horizontal = 2.dp, vertical = 1.dp)
            .zIndex(if (focused) 5f else if (selected) 3f else 1f)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .shadow(
                elevation = if (focused) 12.dp else 0.dp,
                shape = shape,
                ambientColor = EpgPrimary,
                spotColor = EpgPrimary,
            )
            .clip(shape)
            .background(if (emphasized) EpgCardFocused else EpgCard)
            .border(
                width = if (emphasized) 2.dp else 1.dp,
                color = if (emphasized) EpgPrimary else EpgBorder,
                shape = shape,
            )
            .onFocusChanged {
                focused = it.isFocused
                if (it.isFocused) onFocused()
            }
            .focusable()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "${formatTime(item.startMs)}–${formatTime(item.stopMs)}",
            color = EpgMuted,
            fontSize = 12.sp,
            maxLines = 1,
        )
        Spacer(Modifier.height(5.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = item.programme.title ?: "未命名节目",
                modifier = Modifier.weight(1f),
                color = EpgText,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (isLive && emphasized) {
                Spacer(Modifier.width(6.dp))
                LiveBadge()
            }
        }
    }
}

@Composable
private fun ProgrammeDetailsPanel(
    programme: Programme?,
    channel: GuideChannelRow?,
    nowMs: Long,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(EpgSurface)
            .border(1.dp, EpgBorder, RoundedCornerShape(10.dp))
            .padding(horizontal = 24.dp, vertical = 28.dp),
    ) {
        if (programme == null) {
            Spacer(Modifier.weight(1f))
            Text(
                text = "选择节目查看详情",
                modifier = Modifier.align(Alignment.CenterHorizontally),
                color = EpgMuted,
                fontSize = 17.sp,
            )
            Spacer(Modifier.weight(1f))
            return@Column
        }

        val start = parseIso(programme.startAt)?.time
        val stop = parseIso(programme.stopAt)?.time
        val durationMinutes = if (start != null && stop != null) {
            ((stop - start) / 60_000).coerceAtLeast(1)
        } else {
            null
        }
        val channelMark = channel?.name?.firstOrNull()?.toString() ?: "M"

        Box(
            modifier = Modifier
                .size(74.dp)
                .clip(CircleShape)
                .background(EpgPrimary.copy(alpha = 0.18f))
                .border(2.dp, EpgPrimary, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = channelMark,
                color = EpgPrimary,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(32.dp))
        Text(
            text = programme.title ?: "未命名节目",
            color = EpgText,
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = if (start != null && stop != null) {
                    "${formatTime(start)}–${formatTime(stop)}"
                } else {
                    "--:--"
                },
                color = EpgMuted,
                fontSize = 18.sp,
                fontWeight = FontWeight.Medium,
            )
            if (isNow(programme, nowMs)) {
                Spacer(Modifier.width(12.dp))
                LiveBadge()
            }
        }
        Spacer(Modifier.height(26.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(EpgBorder),
        )
        Spacer(Modifier.height(26.dp))
        Text(
            text = programme.subTitle
                ?: "当前节目暂无更多简介。请通过节目单浏览相邻时段内容。",
            color = EpgMuted,
            fontSize = 16.sp,
            lineHeight = 25.sp,
            maxLines = 6,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.weight(1f))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(EpgBorder),
        )
        Spacer(Modifier.height(20.dp))
        durationMinutes?.let {
            DetailMeta(label = "$it 分钟")
            Spacer(Modifier.height(14.dp))
        }
        DetailMeta(label = programme.category ?: "未分类")
    }
}

@Composable
private fun LiveBadge() {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(LiveRed)
            .padding(horizontal = 7.dp, vertical = 3.dp),
    ) {
        Text(
            text = "LIVE",
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun DetailMeta(label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(EpgMuted),
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = label,
            color = EpgMuted,
            fontSize = 15.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private data class GuideChannelRow(
    val channelId: String,
    val name: String,
    val number: String?,
    val programmes: List<GuideProgramme>,
)

private data class GuideProgramme(
    val programme: Programme,
    val startMs: Long,
    val stopMs: Long,
)

private fun buildGuideRows(
    programmes: List<Programme>,
    channels: List<Channel>,
    requestedChannelId: String,
    requestedChannelName: String,
    windowStart: Long,
    windowEnd: Long,
): List<GuideChannelRow> {
    val slotsByChannel = programmes.mapNotNull { programme ->
        val start = parseIso(programme.startAt)?.time ?: return@mapNotNull null
        val stop = parseIso(programme.stopAt)?.time ?: return@mapNotNull null
        if (stop <= windowStart || start >= windowEnd) return@mapNotNull null
        normalizeChannelId(programme.channelId) to GuideProgramme(programme, start, stop)
    }.groupBy(
        keySelector = { it.first },
        valueTransform = { it.second },
    )

    val channelsById = channels.associateBy { normalizeChannelId(it.id) }
    val requestedId = normalizeChannelId(requestedChannelId)
    val orderedIds = if (requestedId.isNotBlank()) {
        listOf(requestedId)
    } else {
        channels.map { normalizeChannelId(it.id) }
            .filter { it in slotsByChannel }
            .plus(slotsByChannel.keys)
            .distinct()
            .take(MaximumGuideChannels)
    }

    return orderedIds.mapNotNull { id ->
        val slots = slotsByChannel[id].orEmpty().sortedBy { it.startMs }
        if (slots.isEmpty()) return@mapNotNull null
        val channel = channelsById[id]
        GuideChannelRow(
            channelId = channel?.id ?: slots.first().programme.channelId,
            name = channel?.name
                ?: requestedChannelName.takeIf { requestedId.isNotBlank() }
                ?: "频道 ${id.takeLast(4)}",
            number = channel?.channelNumber?.toString(),
            programmes = slots,
        )
    }
}

private fun floorToHalfHour(epochMs: Long): Long = epochMs - (epochMs % HalfHourMs)

private fun normalizeChannelId(id: String): String = id.removePrefix("magi:")

private fun formatTime(epochMs: Long): String =
    SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(epochMs))

private fun parseIso(iso: String): Date? {
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSSX",
        "yyyy-MM-dd'T'HH:mm:ssX",
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
    )
    return patterns.firstNotNullOfOrNull { pattern ->
        runCatching {
            SimpleDateFormat(pattern, Locale.US).apply {
                timeZone = java.util.TimeZone.getTimeZone("UTC")
            }.parse(iso)
        }.getOrNull()
    }
}

private fun isNow(programme: Programme, nowMs: Long): Boolean {
    val start = parseIso(programme.startAt)?.time ?: return false
    val stop = parseIso(programme.stopAt)?.time ?: return false
    return nowMs in start until stop
}
