package com.magi.tv.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Shared palette for every MAGI TV surface. */
object MagiTvPalette {
    val Background = Color(0xFF0A111A)
    val Surface = Color(0xFF111923)
    val SurfaceElevated = Color(0xFF18212D)
    val SurfaceFocused = Color(0xFF1B2B42)
    val Border = Color(0xFF2A3442)
    val Primary = Color(0xFF1677FF)
    val PrimarySoft = Color(0xFF123768)
    val Text = Color(0xFFF5F7FA)
    val Muted = Color(0xFF9AA7B6)
    val Subtle = Color(0xFF667487)
    val Live = Color(0xFFE63746)
    val Success = Color(0xFF32C48D)
    val Warning = Color(0xFFFFB020)
    val Error = Color(0xFFFF5A65)
}

private val MagiColorScheme = darkColorScheme(
    primary = MagiTvPalette.Primary,
    onPrimary = Color.White,
    primaryContainer = MagiTvPalette.PrimarySoft,
    onPrimaryContainer = MagiTvPalette.Text,
    background = MagiTvPalette.Background,
    onBackground = MagiTvPalette.Text,
    surface = MagiTvPalette.Surface,
    onSurface = MagiTvPalette.Text,
    surfaceVariant = MagiTvPalette.SurfaceElevated,
    onSurfaceVariant = MagiTvPalette.Muted,
    outline = MagiTvPalette.Border,
    error = MagiTvPalette.Error,
    onError = Color.White,
)

private val MagiTypography = Typography(
    displaySmall = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 40.sp,
        lineHeight = 48.sp,
    ),
    headlineLarge = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 34.sp,
        lineHeight = 42.sp,
    ),
    headlineMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 28.sp,
        lineHeight = 36.sp,
    ),
    titleLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        lineHeight = 29.sp,
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 25.sp,
    ),
    bodyLarge = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 17.sp,
        lineHeight = 25.sp,
    ),
    bodyMedium = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    labelLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
    ),
)

@Composable
fun MagiTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = MagiColorScheme,
        typography = MagiTypography,
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MagiTvPalette.Background,
            contentColor = MagiTvPalette.Text,
        ) {
            content()
        }
    }
}
