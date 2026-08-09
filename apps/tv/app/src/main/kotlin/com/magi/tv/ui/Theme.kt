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
    // "Midnight cinema": low-glare surfaces for a dark living room, with a
    // cool focus ring that remains unmistakable from a sofa distance.
    val Background = Color(0xFF070B11)
    val Surface = Color(0xFF0F1620)
    val SurfaceElevated = Color(0xFF151F2C)
    val SurfaceFocused = Color(0xFF1B3045)
    val Border = Color(0xFF263547)
    val Focus = Color(0xFF72C5FF)
    val Primary = Color(0xFF5AA8FF)
    val PrimarySoft = Color(0xFF173B61)
    val Text = Color(0xFFF4F7FB)
    val Muted = Color(0xFFA5B2C2)
    val Subtle = Color(0xFF6F7E91)
    val Live = Color(0xFFFF5C70)
    val Success = Color(0xFF55D6A7)
    val Warning = Color(0xFFF6C56A)
    val Error = Color(0xFFFF7180)
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
