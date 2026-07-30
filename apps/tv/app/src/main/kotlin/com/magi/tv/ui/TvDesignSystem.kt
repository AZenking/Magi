package com.magi.tv.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun MagiTvWordmark(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "MAGI",
            color = MagiTvPalette.Text,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.4.sp,
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = "TV",
            color = MagiTvPalette.Primary,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.4.sp,
        )
    }
}

@Composable
fun MagiTvScreenHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    showClock: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MagiTvWordmark()
        Spacer(Modifier.width(44.dp))
        Text(
            text = title,
            color = MagiTvPalette.Text,
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
        )
        subtitle?.let {
            Spacer(Modifier.width(22.dp))
            Text(
                text = it,
                color = MagiTvPalette.Muted,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.weight(1f))
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = actions,
        )
        if (showClock) {
            Spacer(Modifier.width(28.dp))
            Text(
                text = rememberClockText(),
                color = MagiTvPalette.Text,
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
fun MagiTvActionButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    compact: Boolean = false,
    enabled: Boolean = true,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.04f else 1f,
        animationSpec = tween(130),
        label = "action-focus",
    )
    val shape = RoundedCornerShape(if (compact) 8.dp else 10.dp)
    val background = when {
        !enabled -> MagiTvPalette.SurfaceElevated.copy(alpha = 0.55f)
        primary -> MagiTvPalette.Primary
        focused -> MagiTvPalette.SurfaceFocused
        else -> MagiTvPalette.SurfaceElevated
    }
    val borderColor = when {
        !enabled -> MagiTvPalette.Border.copy(alpha = 0.45f)
        focused || primary -> MagiTvPalette.Primary
        else -> MagiTvPalette.Border
    }
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = modifier
            .heightIn(min = if (compact) 44.dp else 52.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .shadow(
                elevation = if (focused) 10.dp else 0.dp,
                shape = shape,
                ambientColor = MagiTvPalette.Primary,
                spotColor = MagiTvPalette.Primary,
            )
            .clip(shape)
            .background(background)
            .border(
                width = if (focused || primary) 2.dp else 1.dp,
                color = borderColor,
                shape = shape,
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(
                enabled = enabled,
                role = Role.Button,
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .padding(
                horizontal = if (compact) 18.dp else 24.dp,
                vertical = if (compact) 9.dp else 13.dp,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (enabled) MagiTvPalette.Text else MagiTvPalette.Subtle,
            fontSize = if (compact) 14.sp else 16.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}

@Composable
fun MagiTvFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(9.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val background = when {
        focused -> MagiTvPalette.Primary
        selected -> MagiTvPalette.PrimarySoft
        else -> MagiTvPalette.Surface
    }

    Box(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(background)
            .border(
                width = if (focused || selected) 2.dp else 1.dp,
                color = if (focused || selected) {
                    MagiTvPalette.Primary
                } else {
                    MagiTvPalette.Border
                },
                shape = shape,
            )
            .onFocusChanged { focused = it.isFocused }
            .clickable(
                role = Role.Tab,
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 18.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = MagiTvPalette.Text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}

@Composable
fun MagiTvChannelMark(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 52.dp,
    seed: Int = name.hashCode(),
    logo: String? = null,
) {
    val colors = listOf(
        Color(0xFF2188FF),
        Color(0xFFFFB020),
        Color(0xFF67C23A),
        Color(0xFF8B5CF6),
        Color(0xFFFF4D6D),
        Color(0xFF18B8C9),
    )
    val color = colors[(seed and Int.MAX_VALUE) % colors.size]
    val mark = name.firstOrNull()?.toString()?.uppercase() ?: "M"

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(color.copy(alpha = 0.18f))
            .border(2.dp, color, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        // Real logo when available; falls back to the colored initial otherwise.
        if (!logo.isNullOrEmpty()) {
            coil3.compose.AsyncImage(
                model = logo,
                contentDescription = name,
                modifier = Modifier.size(size).clip(CircleShape),
            )
        } else {
            Text(
                text = mark,
                color = color,
                fontSize = (size.value * 0.38f).sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
fun MagiTvStatusBadge(
    label: String,
    modifier: Modifier = Modifier,
    color: Color = MagiTvPalette.Live,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(color)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}

@Composable
private fun rememberClockText(): String {
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            nowMs = System.currentTimeMillis()
        }
    }
    return remember(nowMs) {
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(nowMs))
    }
}
