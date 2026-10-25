package com.micshare.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = MicshareGreen,
    primaryContainer = MicshareGreenDark,
    secondary = MicshareGreenLight,
    secondaryContainer = MicshareGreenDark,
    tertiary = MicshareGreenLight,
    tertiaryContainer = MicshareGreenDark,
    surface = MicshareSurface,
    surfaceVariant = MicshareSurfaceVariant,
    background = MicshareBackground,
    error = MicshareError,
    onPrimary = Color.Black,
    onPrimaryContainer = Color.White,
    onSecondary = Color.Black,
    onSecondaryContainer = Color.White,
    onTertiary = Color.Black,
    onTertiaryContainer = Color.White,
    onSurface = MicshareOnSurface,
    onSurfaceVariant = MicshareOnSurface,
    onBackground = MicshareOnBackground,
    onError = MicshareOnError,
    outline = Color.White.copy(alpha = 0.38f),
    outlineVariant = Color.White.copy(alpha = 0.3f),
    scrim = Color.Black,
    shadow = Color.Black,
    inverseSurface = MicshareOnBackground,
    inverseOnSurface = MicshareBackground,
    inversePrimary = MicshareGreenDark
)

private val LightColorScheme = lightColorScheme(
    primary = MicshareGreenDark,
    primaryContainer = MicshareGreenLight,
    secondary = MicshareGreenDark,
    secondaryContainer = MicshareGreenLight,
    tertiary = MicshareGreenDark,
    tertiaryContainer = MicshareGreenLight,
    surface = Color.White,
    surfaceVariant = Color(0xFFF5F5F5),
    background = Color.White,
    error = MicshareError,
    onPrimary = Color.White,
    onPrimaryContainer = Color.Black,
    onSecondary = Color.White,
    onSecondaryContainer = Color.Black,
    onTertiary = Color.White,
    onTertiaryContainer = Color.Black,
    onSurface = Color.Black,
    onSurfaceVariant = Color(0xFF444444),
    onBackground = Color.Black,
    onError = MicshareOnError,
    outline = Color.Black.copy(alpha = 0.38f),
    outlineVariant = Color.Black.copy(alpha = 0.3f),
    scrim = Color.Black,
    shadow = Color.Black,
    inverseSurface = MicshareBackground,
    inverseOnSurface = MicshareOnBackground,
    inversePrimary = MicshareGreen
)

@Composable
fun Micshare(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = MicshareTypography,
        content = content
    )
}