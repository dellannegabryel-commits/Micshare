package com.micshare.designsystem.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.micshare.designsystem.MicshareColors

// Re-export all new components from MicshareComponents
import com.micshare.designsystem.components.GlassPanel
import com.micshare.designsystem.components.GlassStatusCard
import com.micshare.designsystem.components.HeroMuteButton
import com.micshare.designsystem.components.PillSlider
import com.micshare.designsystem.components.StatPill
import com.micshare.designsystem.components.StatPillVariant
import com.micshare.designsystem.components.StatusState
import com.micshare.designsystem.components.AnimatedStatusText

// Legacy icon aliases for backward compatibility
val AccentPrimary: Color = MicshareColors.BrandPrimary

val Logout: ImageVector = Icons.Default.ExitToApp
val Memory: ImageVector = Icons.Default.Info
val Mic: ImageVector = Icons.Default.PlayArrow
val MicOff: ImageVector = Icons.Default.Close
val SignalWifiStatusbar4Bar: ImageVector = Icons.Default.Done
val ErrorOutline: ImageVector = Icons.Default.Warning
val Trend: ImageVector = Icons.Default.Star
val Computer: ImageVector = Icons.Default.Share
val Refresh: ImageVector = Icons.Default.Refresh

// Legacy enums for backward compatibility
enum class CardVariant { Primary, Secondary, Outlined, Elevated }
enum class ButtonVariant { Primary, Secondary, Danger, Outlined }
enum class ButtonSize { Small, Medium, Large }
enum class StatCardVariant { Default, Success, Warning, Danger }

// Deprecated legacy components - use new GlassPanel, HeroMuteButton, PillSlider, StatPill instead

/**
 * @Deprecated Use GlassPanel instead
 */
@Composable
@Deprecated("Use GlassPanel", ReplaceWith("GlassPanel(modifier, content)"))
fun MicshareCard(
    modifier: Modifier = Modifier,
    variant: CardVariant = CardVariant.Primary,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val containerColor = when (variant) {
        CardVariant.Primary -> MicshareColors.Surface
        CardVariant.Secondary -> MicshareColors.BackgroundTertiary
        CardVariant.Outlined -> Color.Transparent
        CardVariant.Elevated -> MicshareColors.SurfaceElevated
    }
    val border = if (variant == CardVariant.Outlined) BorderStroke(1.dp, MicshareColors.Border) else null

    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier,
            colors = CardDefaults.cardColors(containerColor = containerColor),
            border = border,
            shape = RoundedCornerShape(16.dp),
            content = content
        )
    } else {
        Card(
            modifier = modifier,
            colors = CardDefaults.cardColors(containerColor = containerColor),
            border = border,
            shape = RoundedCornerShape(16.dp),
            content = content
        )
    }
}

/**
 * @Deprecated Use HeroMuteButton or standard Button with MicshareTheme.Shapes.Pill
 */
@Composable
@Deprecated("Use HeroMuteButton for mute button or Button with Pill shape", ReplaceWith(""))
fun MicshareButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Primary,
    size: ButtonSize = ButtonSize.Large,
    enabled: Boolean = true,
    border: BorderStroke? = null,
    content: @Composable RowScope.() -> Unit
) {
    val containerColor = when (variant) {
        ButtonVariant.Primary -> MicshareColors.BrandPrimary
        ButtonVariant.Secondary -> MicshareColors.BackgroundTertiary
        ButtonVariant.Danger -> MicshareColors.ErrorBackground
        ButtonVariant.Outlined -> Color.Transparent
    }
    val contentColor = when (variant) {
        ButtonVariant.Primary -> MicshareColors.BrandOnPrimary
        ButtonVariant.Secondary -> MicshareColors.TextPrimary
        ButtonVariant.Danger -> MicshareColors.Error
        ButtonVariant.Outlined -> MicshareColors.BrandPrimary
    }
    val height = when (size) {
        ButtonSize.Small -> 36.dp
        ButtonSize.Medium -> 48.dp
        ButtonSize.Large -> 56.dp
    }
    val resolvedBorder = border ?: if (variant == ButtonVariant.Outlined) BorderStroke(1.dp, MicshareColors.BrandPrimary) else null

    Button(
        onClick = onClick,
        modifier = modifier.height(height),
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = containerColor.copy(alpha = 0.5f),
            disabledContentColor = contentColor.copy(alpha = 0.5f)
        ),
        shape = RoundedCornerShape(12.dp),
        border = resolvedBorder,
        content = content
    )
}

/**
 * @Deprecated Use standard TextField with MicshareTheme
 */
@Composable
@Deprecated("Use standard Material3 TextField", ReplaceWith(""))
fun MicshareTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    singleLine: Boolean = true,
    enabled: Boolean = true,
    isError: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    textStyle: TextStyle = TextStyle(fontSize = 16.sp, color = Color.White),
    colors: TextFieldColors = TextFieldDefaults.colors(
        focusedContainerColor = MicshareColors.Surface,
        unfocusedContainerColor = MicshareColors.Surface,
        focusedIndicatorColor = MicshareColors.BrandPrimary,
        unfocusedIndicatorColor = Color.Transparent,
        disabledIndicatorColor = Color.Transparent,
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White
    )
) {
    TextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        label = label?.let { { Text(it) } },
        placeholder = placeholder?.let { { Text(it, color = Color.DarkGray) } },
        singleLine = singleLine,
        enabled = enabled,
        isError = isError,
        keyboardOptions = keyboardOptions,
        textStyle = textStyle,
        colors = colors,
        shape = RoundedCornerShape(12.dp)
    )
}

/**
 * @Deprecated Use GlassStatusCard or StatPill instead
 */
@Composable
@Deprecated("Use GlassStatusCard or StatPill", ReplaceWith(""))
fun MicshareStatusIndicator(
    state: StatusState,
    text: String,
    size: StatusSize = StatusSize.Medium,
    modifier: Modifier = Modifier
) {
    val color = when (state) {
        StatusState.Connected -> MicshareColors.SystemGreen
        StatusState.Reconnecting -> MicshareColors.SystemOrange
        StatusState.Disconnected -> MicshareColors.Error
    }
    val dotSize = when (size) {
        StatusSize.Small -> 6.dp
        StatusSize.Medium -> 8.dp
        StatusSize.Large -> 10.dp
    }
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(dotSize)
                .background(color, RoundedCornerShape(dotSize / 2))
        )
        Text(text = text, fontSize = 14.sp, color = color)
    }
}

/**
 * @Deprecated Use PillSlider instead
 */
@Composable
@Deprecated("Use PillSlider", ReplaceWith(""))
fun MicshareSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    valueRange: ClosedFloatingPointRange<Float> = 0f..1f,
    steps: Int = 0
) {
    Slider(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        valueRange = valueRange,
        steps = steps,
        colors = SliderDefaults.colors(
            thumbColor = MicshareColors.BrandPrimary,
            activeTrackColor = MicshareColors.BrandPrimary,
            inactiveTrackColor = MicshareColors.BackgroundTertiary
        )
    )
}

/**
 * @Deprecated Use StatPill instead
 */
@Composable
@Deprecated("Use StatPill", ReplaceWith(""))
fun MicshareStatCard(
    title: String,
    value: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    variant: StatCardVariant = StatCardVariant.Default
) {
    val color = when (variant) {
        StatCardVariant.Default -> Color.Gray
        StatCardVariant.Success -> MicshareColors.SystemGreen
        StatCardVariant.Warning -> MicshareColors.SystemOrange
        StatCardVariant.Danger -> MicshareColors.Error
    }
    Card(
        modifier = modifier.height(72.dp),
        colors = CardDefaults.cardColors(containerColor = MicshareColors.Surface),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(title, fontSize = 11.sp, color = Color.Gray)
            Spacer(modifier = Modifier.height(2.dp))
            Text(value, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

enum class StatusSize { Small, Medium, Large }