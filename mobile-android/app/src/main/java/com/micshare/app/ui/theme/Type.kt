package com.micshare.app.ui.theme

import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val MicshareFontFamily = FontFamily.Default

data class MicshareTypography(
    val displayLarge: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 57.sp,
        lineHeight = 64.sp,
        letterSpacing = -0.25.sp
    ),
    val displayMedium: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 45.sp,
        lineHeight = 52.sp
    ),
    val displaySmall: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 36.sp,
        lineHeight = 44.sp
    ),
    val headlineLarge: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 40.sp
    ),
    val headlineMedium: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 36.sp
    ),
    val headlineSmall: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 32.sp
    ),
    val titleLarge: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        lineHeight = 28.sp
    ),
    val titleMedium: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.15.sp
    ),
    val titleSmall: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp
    ),
    val bodyLarge: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp
    ),
    val bodyMedium: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.25.sp
    ),
    val bodySmall: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp
    ),
    val labelLarge: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp
    ),
    val labelMedium: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    ),
    val labelSmall: androidx.compose.ui.text.TextStyle = androidx.compose.ui.text.TextStyle(
        fontFamily = MicshareFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    )
)