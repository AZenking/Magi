package com.magi.tv.ui.channels

import android.media.MediaCodecList
import android.os.Build
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.magi.tv.domain.model.DiagnosticEvent
import com.magi.tv.ui.MagiTvPalette
import com.magi.tv.ui.MagiTvScreenHeader
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DiagnosticsScreen(
    state: DiagnosticsUiState,
    modifier: Modifier = Modifier,
) {
    val events = state.events
    val firstFrameMs = state.lastFirstFrameMs
    val decoders = remember { deviceDecoderSummary() }
    val deviceModel = remember {
        "${Build.MANUFACTURER} ${Build.MODEL} · Android API ${Build.VERSION.SDK_INT}"
    }
    val errorCounts = remember(events) {
        events.groupingBy { it.kind.label }.eachCount()
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MagiTvPalette.Background)
            .padding(horizontal = 28.dp, vertical = 22.dp),
    ) {
        MagiTvScreenHeader(
            title = "播放诊断",
            subtitle = "设备能力与最近播放状态",
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(22.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DiagnosticStatCard(
                label = "设备",
                value = Build.MODEL,
                hint = "API ${Build.VERSION.SDK_INT}",
                color = MagiTvPalette.Primary,
                modifier = Modifier.weight(1f),
            )
            DiagnosticStatCard(
                label = "最近首帧",
                value = firstFrameMs?.let { "$it ms" } ?: "—",
                hint = if (firstFrameMs == null) "尚无播放记录" else "上一次成功播放",
                color = MagiTvPalette.Success,
                modifier = Modifier.weight(1f),
            )
            DiagnosticStatCard(
                label = "最近错误",
                value = events.size.toString(),
                hint = "${errorCounts.size} 个错误分类",
                color = if (events.isEmpty()) {
                    MagiTvPalette.Success
                } else {
                    MagiTvPalette.Warning
                },
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(16.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(
                modifier = Modifier
                    .weight(0.78f)
                    .fillMaxHeight()
                    .diagnosticPanel(),
            ) {
                Text(
                    text = "设备与解码能力",
                    color = MagiTvPalette.Text,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = deviceModel,
                    color = MagiTvPalette.Muted,
                    fontSize = 14.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(14.dp))
                decoders.forEach { decoder ->
                    DecoderCapabilityRow(
                        name = decoder.name,
                        supported = decoder.supported,
                    )
                    Spacer(Modifier.height(8.dp))
                }
                Spacer(Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(MagiTvPalette.Border),
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "诊断信息仅包含设备能力、错误分类与脱敏线路 ID，不记录播放地址或 API Key。",
                    color = MagiTvPalette.Subtle,
                    fontSize = 14.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Column(
                modifier = Modifier
                    .weight(1.22f)
                    .fillMaxHeight()
                    .diagnosticPanel(),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "最近播放事件",
                        color = MagiTvPalette.Text,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        text = "最多保留 50 条",
                        color = MagiTvPalette.Subtle,
                        fontSize = 14.sp,
                    )
                }
                Spacer(Modifier.height(16.dp))

                if (events.isEmpty()) {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(MagiTvPalette.Success.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "✓",
                                color = MagiTvPalette.Success,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        Text(
                            text = "暂无播放错误",
                            color = MagiTvPalette.Text,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "最近的播放过程没有产生诊断事件",
                            color = MagiTvPalette.Muted,
                            fontSize = 14.sp,
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(
                            items = events.asReversed().take(15),
                            key = { "${it.timestampMs}-${it.lineStreamId}" },
                        ) { event ->
                            DiagnosticEventRow(event)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosticStatCard(
    label: String,
    value: String,
    hint: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .height(104.dp)
            .clip(RoundedCornerShape(11.dp))
            .background(MagiTvPalette.Surface)
            .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(11.dp))
            .padding(horizontal = 20.dp, vertical = 17.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(color),
        )
        Spacer(Modifier.width(15.dp))
        Column {
            Text(
                text = label,
                color = MagiTvPalette.Muted,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = value,
                color = MagiTvPalette.Text,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = hint,
                color = MagiTvPalette.Subtle,
                fontSize = 14.sp,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun DecoderCapabilityRow(
    name: String,
    supported: Boolean,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MagiTvPalette.SurfaceElevated)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(
                    if (supported) MagiTvPalette.Success else MagiTvPalette.Error,
                ),
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = name,
            modifier = Modifier.weight(1f),
            color = MagiTvPalette.Text,
            fontSize = 15.sp,
        )
        Text(
            text = if (supported) "支持" else "不支持",
            color = if (supported) MagiTvPalette.Success else MagiTvPalette.Error,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun DiagnosticEventRow(event: DiagnosticEvent) {
    val time = remember(event.timestampMs) {
        SimpleDateFormat("HH:mm:ss", Locale.US).format(Date(event.timestampMs))
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MagiTvPalette.SurfaceElevated)
            .padding(horizontal = 15.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(MagiTvPalette.Warning),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = event.kind.label,
                    color = MagiTvPalette.Text,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = time,
                    color = MagiTvPalette.Subtle,
                    fontSize = 14.sp,
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = event.message,
                color = MagiTvPalette.Muted,
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(12.dp))
        Text(
            text = event.lineStreamId?.take(12) ?: "无线路 ID",
            color = MagiTvPalette.Subtle,
            fontSize = 14.sp,
            maxLines = 1,
        )
    }
}

private fun Modifier.diagnosticPanel(): Modifier =
    clip(RoundedCornerShape(12.dp))
        .background(MagiTvPalette.Surface)
        .border(1.dp, MagiTvPalette.Border, RoundedCornerShape(12.dp))
        .padding(horizontal = 22.dp, vertical = 16.dp)

private data class DecoderCapability(
    val name: String,
    val supported: Boolean,
)

private fun deviceDecoderSummary(): List<DecoderCapability> {
    val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
    return listOf(
        DecoderCapability("H.264 / AVC", list.supportsDecoder("video/avc")),
        DecoderCapability("H.265 / HEVC", list.supportsDecoder("video/hevc")),
        DecoderCapability("AAC 音频", list.supportsDecoder("mp4a-latm")),
    )
}

private fun MediaCodecList.supportsDecoder(mimeType: String): Boolean =
    codecInfos.any {
        !it.isEncoder && it.supportedTypes.any { type ->
            type.equals(mimeType, ignoreCase = true)
        }
    }
