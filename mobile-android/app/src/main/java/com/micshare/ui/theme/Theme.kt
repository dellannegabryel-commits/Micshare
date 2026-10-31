package com.micshare.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = Sky400,
    onPrimary = Color(0xFF082F49),
    primaryContainer = Sky700,
    onPrimaryContainer = Neutral50,
    secondary = Neutral400,
    onSecondary = Neutral900,
    secondaryContainer = Neutral800,
    onSecondaryContainer = Neutral100,
    tertiary = Green400,
    onTertiary = Neutral900,
    background = Neutral900,
    onBackground = Neutral50,
    surface = Neutral900,
    onSurface = Neutral50,
    surfaceVariant = Neutral800,
    onSurfaceVariant = Neutral400,
    outline = Neutral700,
    outlineVariant = Neutral700,
    error = Red400,
    onError = Neutral900,
    scrim = Color.Black,
)

private val LightColorScheme = lightColorScheme(
    primary = Sky500,
    onPrimary = Color.White,
    primaryContainer = Sky300,
    onPrimaryContainer = Neutral900,
    secondary = Neutral600,
    onSecondary = Color.White,
    secondaryContainer = Neutral100,
    onSecondaryContainer = Neutral900,
    tertiary = Green500,
    onTertiary = Color.White,
    background = Neutral50,
    onBackground = Neutral900,
    surface = Neutral50,
    onSurface = Neutral900,
    surfaceVariant = Neutral100,
    onSurfaceVariant = Neutral600,
    outline = Neutral200,
    outlineVariant = Neutral200,
    error = Red500,
    onError = Color.White,
    scrim = Color.Black,
)

/**
 * Tema do Micshare.
 *
 * Segue a paleta do app PC (sky + neutros + cores semânticas) e aplica as
 * barras do sistema no mesmo tom de fundo.
 */
@Composable
fun MicshareTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            // App edge-to-edge: as barras ficam transparentes e o fundo do
            // Compose aparece por baixo. Só o contraste dos ícones é ajustado.
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = MicshareTypography,
        content = content,
    )
}
