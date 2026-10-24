package com.micshare.designsystem

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * PixelOS / Celestia Shell inspired theme for Micshare.
 * Uses Material 3 Dynamic Colors (Monet) with custom shapes and elevation tokens.
 */
object MicshareTheme {

    // PixelOS-inspired shapes - heavy rounding (squircles)
    object Shapes {
        val ExtraSmall = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
        val Small = androidx.compose.foundation.shape.RoundedCornerShape(16.dp)
        val Medium = androidx.compose.foundation.shape.RoundedCornerShape(28.dp)
        val Large = androidx.compose.foundation.shape.RoundedCornerShape(32.dp)
        val ExtraLarge = androidx.compose.foundation.shape.RoundedCornerShape(40.dp)

        val Pill = androidx.compose.foundation.shape.RoundedCornerShape(100.dp)
        val Circle = androidx.compose.foundation.shape.CircleShape
        val Squircle = androidx.compose.foundation.shape.RoundedCornerShape(28.dp)
        val Hero = androidx.compose.foundation.shape.RoundedCornerShape(56.dp)
        val Glass = androidx.compose.foundation.shape.RoundedCornerShape(24.dp)
    }

    // Spacing system matching PixelOS rhythm
    object Spacing {
        val Xxs = 4.dp
        val Xs = 8.dp
        val Sm = 12.dp
        val Md = 16.dp
        val Lg = 24.dp
        val Xl = 32.dp
        val Xxl = 48.dp
        val Xxxl = 64.dp

        val ScreenHorizontal = 24.dp
        val ScreenVertical = 16.dp
        val ItemGap = 12.dp
        val SectionGap = 32.dp
    }

    // Elevation tokens using tonal surfaces instead of heavy shadows
    object Elevation {
        val Level0 = 0.dp
        val Level1 = 1.dp
        val Level2 = 3.dp
        val Level3 = 6.dp
        val Level4 = 8.dp
        val Level5 = 12.dp
    }

    // Custom typography - clean, geometric
    private val InterFontFamily = androidx.compose.ui.text.font.FontFamily.Default

    private val MicshareTypography = Typography(
        displayLarge = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 57.sp,
            lineHeight = 64.sp,
            letterSpacing = -0.25.sp,
        ),
        displayMedium = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 45.sp,
            lineHeight = 52.sp,
            letterSpacing = 0.sp,
        ),
        displaySmall = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 36.sp,
            lineHeight = 44.sp,
            letterSpacing = 0.sp,
        ),
        headlineLarge = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 32.sp,
            lineHeight = 40.sp,
            letterSpacing = 0.sp,
        ),
        headlineMedium = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 28.sp,
            lineHeight = 36.sp,
            letterSpacing = 0.sp,
        ),
        headlineSmall = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 24.sp,
            lineHeight = 32.sp,
            letterSpacing = 0.sp,
        ),
        titleLarge = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 22.sp,
            lineHeight = 28.sp,
            letterSpacing = 0.sp,
        ),
        titleMedium = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
            fontSize = 16.sp,
            lineHeight = 24.sp,
            letterSpacing = 0.15.sp,
        ),
        titleSmall = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            letterSpacing = 0.1.sp,
        ),
        bodyLarge = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 16.sp,
            lineHeight = 24.sp,
            letterSpacing = 0.5.sp,
        ),
        bodyMedium = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            letterSpacing = 0.25.sp,
        ),
        bodySmall = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.4.sp,
        ),
        labelLarge = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            letterSpacing = 0.1.sp,
        ),
        labelMedium = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.5.sp,
        ),
        labelSmall = androidx.compose.ui.text.TextStyle(
            fontFamily = InterFontFamily,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.5.sp,
        ),
    )

    @Composable
    fun Theme(
        context: Context,
        content: @Composable () -> Unit,
    ) {
        val isSystemDark = isSystemInDarkTheme()
        val colorScheme = if (isSystemDark) {
            dynamicDarkColorScheme(context)
        } else {
            dynamicLightColorScheme(context)
        }

        SideEffect {
            val window = (context as? androidx.appcompat.app.AppCompatActivity)?.window
            window?.let {
                WindowCompat.setDecorFitsSystemWindows(it, false)
                val controller = WindowInsetsControllerCompat(it, it.decorView)
                controller.isAppearanceLightStatusBars = !isSystemDark
                controller.isAppearanceLightNavigationBars = !isSystemDark
            }
        }

        MaterialTheme(
            colorScheme = colorScheme,
            typography = MicshareTypography,
            shapes = androidx.compose.material3.Shapes(
                extraSmall = Shapes.ExtraSmall,
                small = Shapes.Small,
                medium = Shapes.Medium,
                large = Shapes.Large,
                extraLarge = Shapes.ExtraLarge,
            ),
            content = content,
        )
    }
}