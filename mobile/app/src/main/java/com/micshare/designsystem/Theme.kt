package com.micshare.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Micshare Theme - Apple-inspired Material3 theme.
 * Uses dark mode as default (app is dark-themed).
 */
object MicshareTheme {

    // Dark color scheme (primary)
    private val DarkColors = darkColorScheme(
        primary = MicshareColors.BrandPrimary,
        onPrimary = MicshareColors.BrandOnPrimary,
        primaryContainer = MicshareColors.BrandPrimaryDark,
        onPrimaryContainer = MicshareColors.BrandOnPrimary,

        secondary = MicshareColors.SystemGreen,
        onSecondary = Color.White,
        secondaryContainer = MicshareColors.BackgroundTertiary,
        onSecondaryContainer = Color.White,

        tertiary = MicshareColors.SystemOrange,
        onTertiary = Color.White,
        tertiaryContainer = MicshareColors.WarningBackground,
        onTertiaryContainer = Color.White,

        error = MicshareColors.Error,
        onError = Color.White,
        errorContainer = MicshareColors.ErrorBackground,
        onErrorContainer = Color.White,

        background = MicshareColors.BackgroundPrimary,
        onBackground = MicshareColors.TextPrimary,

        surface = MicshareColors.Surface,
        onSurface = MicshareColors.TextPrimary,
        surfaceVariant = MicshareColors.BackgroundTertiary,
        onSurfaceVariant = MicshareColors.TextSecondary,

        outline = MicshareColors.Border,
        outlineVariant = MicshareColors.FillSecondary,

        inverseSurface = MicshareColors.BackgroundPrimary,
        inverseOnSurface = MicshareColors.TextPrimary,
        inversePrimary = MicshareColors.BrandPrimaryLight,
    )

    // Light color scheme (for completeness, though app defaults to dark)
    private val LightColors = lightColorScheme(
        primary = MicshareColors.BrandPrimaryDark,
        onPrimary = Color.White,
        primaryContainer = MicshareColors.BrandPrimaryLight,
        onPrimaryContainer = Color.Black,

        secondary = MicshareColors.SystemGreen,
        onSecondary = Color.White,
        secondaryContainer = MicshareColors.BackgroundTertiary,
        onSecondaryContainer = Color.Black,

        tertiary = MicshareColors.SystemOrange,
        onTertiary = Color.White,
        tertiaryContainer = MicshareColors.WarningBackground,
        onTertiaryContainer = Color.Black,

        error = MicshareColors.Error,
        onError = Color.White,
        errorContainer = MicshareColors.ErrorBackground,
        onErrorContainer = Color.Black,

        background = Color.White,
        onBackground = Color.Black,

        surface = Color.White,
        onSurface = Color.Black,
        surfaceVariant = MicshareColors.FillPrimary,
        onSurfaceVariant = MicshareColors.TextSecondary,

        outline = MicshareColors.Separator,
        outlineVariant = MicshareColors.FillSecondary,

        inverseSurface = MicshareColors.BackgroundPrimary,
        inverseOnSurface = MicshareColors.TextPrimary,
        inversePrimary = MicshareColors.BrandPrimary,
    )

    @Composable
    fun Theme(
        darkTheme: Boolean = true, // Force dark theme
        content: @Composable () -> Unit,
    ) {
        val colors = if (darkTheme) DarkColors else LightColors

        MaterialTheme(
            colorScheme = colors,
            typography = MicshareTypography.Material3Typography,
            content = content,
        )
    }
}

/**
 * Extension to provide Material3 typography from our custom system.
 */
internal val MicshareTypography.Material3Typography: androidx.compose.material3.Typography
    get() = androidx.compose.material3.Typography(
        displayLarge = DisplayLarge,
        displayMedium = DisplayMedium,
        displaySmall = DisplaySmall,
        headlineLarge = HeadlineLarge,
        headlineMedium = HeadlineMedium,
        headlineSmall = HeadlineSmall,
        titleLarge = TitleLarge,
        titleMedium = TitleMedium,
        titleSmall = TitleSmall,
        bodyLarge = BodyLarge,
        bodyMedium = BodyMedium,
        bodySmall = BodySmall,
        labelLarge = LabelLarge,
        labelMedium = LabelMedium,
        labelSmall = LabelSmall,
    )