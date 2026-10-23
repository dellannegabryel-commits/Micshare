package com.micshare.designsystem

import androidx.compose.ui.graphics.Color

/**
 * Micshare color system - Apple-inspired dark theme.
 */
object MicshareColors {

    // Brand colors (Blue)
    val BrandPrimary = Color(0xFF007AFF)
    val BrandPrimaryLight = Color(0xFF4DA6FF)
    val BrandPrimaryDark = Color(0xFF0056CC)
    val BrandOnPrimary = Color.White

    // Semantic colors (Dark mode first)
    val BackgroundPrimary = Color(0xFF000000)
    val BackgroundSecondary = Color(0xFF1C1C1E)
    val BackgroundTertiary = Color(0xFF2C2C2E)

    val FillPrimary = Color(0xFF3A3A3C)
    val FillSecondary = Color(0xFF48484A)
    val FillTertiary = Color(0xFF5A5A5C)

    val Separator = Color(0xFF38383A)

    val TextPrimary = Color(0xFFFFFFFF)
    val TextSecondary = Color(0xFFEBEBF5)
    val TextTertiary = Color(0xFFEBEBF599)
    val TextDisabled = Color(0xFFEBEBF54D)
    val TextPlaceholder = Color(0xFFEBEBF54D)

    val SystemBlue = Color(0xFF007AFF)
    val SystemGreen = Color(0xFF34C759)
    val SystemRed = Color(0xFFFF3B30)
    val SystemOrange = Color(0xFFFF9F0A)

    // Semantic aliases
    val Surface = BackgroundSecondary
    val SurfaceElevated = BackgroundTertiary
    val SurfaceOverlay = Color(0xBF000000)

    val Border = Separator
    val BorderFocused = SystemBlue

    val Error = SystemRed
    val ErrorBackground = Color(0xFF422C2C)
    val ErrorBorder = Color(0xFF8B3A3A)

    val Success = SystemGreen
    val SuccessBackground = Color(0xFF2C422C)

    val Warning = SystemOrange
    val WarningBackground = Color(0xFF423A2C)
}