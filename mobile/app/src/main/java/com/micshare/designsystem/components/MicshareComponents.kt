package com.micshare.designsystem.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.SignalWifi4Bar
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.micshare.designsystem.MicshareTheme
import kotlin.ranges.ClosedFloatingPointRange
import androidx.compose.ui.tooling.preview.Preview

/**
 * Hero Mute Button - the centerpiece of the audio screen.
 * A large circular button with spring animations for press/release and active state pulsing.
 */
@Composable
fun HeroMuteButton(
    isMuted: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = MaterialTheme.colorScheme

    // Interaction source to track press state for spring animation
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed = interactionSource.collectIsPressedAsState()

    // Spring animation for press scale (squish effect)
    val scale by animateDpAsState(
        targetValue = if (isPressed.value) 0.92.dp else 1.dp,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow,
        ),
        label = "muteButtonScale"
    )

    // Active state color animation
    val activeColor by androidx.compose.animation.animateColorAsState(
        targetValue = if (isMuted) {
            colors.errorContainer.copy(alpha = 0.9f)
        } else {
            colors.primaryContainer.copy(alpha = 0.9f)
        },
        animationSpec = tween(300),
        label = "muteButtonColor"
    )

    // Active text color
    val textColor = if (isMuted) colors.onErrorContainer else colors.onPrimaryContainer

    // Pulse animation when active (not muted)
    val pulseScale by animateFloatAsState(
        targetValue = if (!isMuted) 1.02f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseScale"
    )

    // Icon rotation/animation
    val iconRotation by animateFloatAsState(
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "iconRotation"
    )

    val icon = if (isMuted) Icons.Default.MicOff else Icons.Default.Mic

    Box(
        modifier = modifier
            .graphicsLayer {
                val scaleVal = scale.value
                val combinedScale = scaleVal * pulseScale
                scaleX = combinedScale
                scaleY = combinedScale
            }
            .fillMaxSize()
            .clip(CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Button(
            onClick = { if (enabled) onClick() },
            modifier = Modifier
                .fillMaxSize()
                .clip(CircleShape),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
            ),
            shape = CircleShape,
            interactionSource = interactionSource,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(activeColor, CircleShape),
            ) {
                if (!isMuted) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(4.dp)
                            .graphicsLayer { alpha = 0.15f }
                            .background(colors.primary, CircleShape)
                    )
                }
            }

            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier
                        .size(56.dp)
                        .graphicsLayer {
                            rotationZ = if (isMuted) 0f else iconRotation * 0.1f
                        },
                    tint = textColor,
                )

                androidx.compose.foundation.layout.Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = if (isMuted) "MUDO" else "ATIVO",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = textColor,
                    letterSpacing = 0.5.sp,
                )
            }
        }
    }
}

/**
 * Pill Slider - thick capsule-style slider matching PixelOS/Android 14 volume control.
 */
@Composable
fun PillSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    valueRange: ClosedFloatingPointRange<Float> = 0f..1f,
    steps: Int = 0,
    trackHeight: androidx.compose.ui.unit.Dp = 6.dp,
    thumbSize: androidx.compose.ui.unit.Dp = 24.dp,
) {
    val colors = MaterialTheme.colorScheme
    val interactionSource = remember { MutableInteractionSource() }

    val sliderHeight = thumbSize.coerceAtLeast(trackHeight)

    Slider(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .height(sliderHeight)
            .padding(horizontal = 8.dp),
        valueRange = valueRange,
        steps = steps,
        interactionSource = interactionSource,
        colors = SliderDefaults.colors(
            thumbColor = colors.primary,
            activeTrackColor = colors.primary,
            inactiveTrackColor = colors.surfaceContainerHighest,
            activeTickColor = colors.primary.copy(alpha = 0.5f),
            inactiveTickColor = colors.surfaceContainerHighest.copy(alpha = 0.5f),
            disabledThumbColor = colors.onSurface.copy(alpha = 0.3f),
            disabledActiveTrackColor = colors.onSurface.copy(alpha = 0.1f),
            disabledInactiveTrackColor = colors.onSurface.copy(alpha = 0.1f),
        ),
    )
}

/**
 * Glass Status Card - frosted glass panel for connection status/header.
 */
@Composable
fun GlassStatusCard(
    title: String,
    subtitle: String,
    statusState: StatusState,
    modifier: Modifier = Modifier,
    connectedText: String = "Conectado",
    reconnectingText: String = "Reconectando...",
    disconnectedText: String = "Desconectado",
) {
    val colors = MaterialTheme.colorScheme

    val statusColor = when (statusState) {
        StatusState.Connected -> colors.primary
        StatusState.Reconnecting -> colors.secondary
        StatusState.Disconnected -> colors.error
    }

    val statusText = when (statusState) {
        StatusState.Connected -> connectedText
        StatusState.Reconnecting -> reconnectingText
        StatusState.Disconnected -> disconnectedText
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MicshareTheme.Spacing.ScreenHorizontal),
        colors = CardDefaults.cardColors(
            containerColor = colors.surfaceContainerHighest.copy(alpha = 0.7f),
        ),
        shape = MicshareTheme.Shapes.Glass,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, colors.outlineVariant.copy(alpha = 0.2f)),
    ) {
        Column(
            modifier = Modifier.padding(MicshareTheme.Spacing.Md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                color = colors.onSurface,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )

            androidx.compose.foundation.layout.Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = colors.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )

            androidx.compose.foundation.layout.Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(statusColor, CircleShape),
                )

                androidx.compose.foundation.layout.Spacer(modifier = Modifier.width(8.dp))

                Text(
                    text = statusText,
                    style = MaterialTheme.typography.labelMedium,
                    color = statusColor,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

/**
 * Glass Panel - reusable frosted glass container for settings/cards.
 */
@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    contentPadding: androidx.compose.ui.unit.Dp = MicshareTheme.Spacing.Md,
    content: @Composable () -> Unit,
) {
    val colors = MaterialTheme.colorScheme

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MicshareTheme.Spacing.ScreenHorizontal),
        colors = CardDefaults.cardColors(
            containerColor = colors.surfaceContainerHighest.copy(alpha = 0.6f),
        ),
        shape = MicshareTheme.Shapes.Glass,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, colors.outlineVariant.copy(alpha = 0.15f)),
    ) {
        Box(
            modifier = Modifier.padding(contentPadding),
            contentAlignment = Alignment.TopStart,
        ) {
            content()
        }
    }
}

/**
 * Stat Pill - compact horizontal stat display.
 */
@Composable
fun StatPill(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    variant: StatPillVariant = StatPillVariant.Default,
) {
    val colors = MaterialTheme.colorScheme

    val (bgColor, textColor) = when (variant) {
        StatPillVariant.Default -> colors.surfaceContainerHighest to colors.onSurfaceVariant
        StatPillVariant.Success -> colors.primaryContainer to colors.onPrimaryContainer
        StatPillVariant.Warning -> colors.secondaryContainer to colors.onSecondaryContainer
        StatPillVariant.Danger -> colors.errorContainer to colors.onErrorContainer
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor.copy(alpha = 0.8f)),
        shape = MicshareTheme.Shapes.Pill,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = textColor,
                modifier = Modifier.size(16.dp),
            )
            Column(
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.titleSmall,
                    color = textColor,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelSmall,
                    color = textColor.copy(alpha = 0.7f),
                )
            }
        }
    }
}

enum class StatPillVariant { Default, Success, Warning, Danger }
enum class StatusState { Connected, Reconnecting, Disconnected }

/**
 * Animated content for status text transitions.
 */
@Composable
fun AnimatedStatusText(
    text: String,
    modifier: Modifier = Modifier,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodyMedium,
    color: Color = MaterialTheme.colorScheme.onSurface,
) {
    androidx.compose.animation.Crossfade(
        targetState = text,
        animationSpec = tween(200),
        modifier = modifier,
    ) { targetText ->
        Text(
            text = targetText,
            style = style,
            color = color,
        )
    }
}

/**
 * Preview composables for design system components.
 */
@Preview(name = "HeroMuteButton - Active", showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun HeroMuteButtonActivePreview() {
    MaterialTheme {
        HeroMuteButton(
            isMuted = false,
            onClick = {},
            modifier = Modifier.size(120.dp),
        )
    }
}

@Preview(name = "HeroMuteButton - Muted", showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun HeroMuteButtonMutedPreview() {
    MaterialTheme {
        HeroMuteButton(
            isMuted = true,
            onClick = {},
            modifier = Modifier.size(120.dp),
        )
    }
}

@Preview(name = "Pill Slider", showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun PillSliderPreview() {
    MaterialTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            PillSlider(value = 0.3f, onValueChange = {},
                trackHeight = 6.dp, thumbSize = 24.dp)
            PillSlider(value = 0.7f, onValueChange = {},
                trackHeight = 8.dp, thumbSize = 28.dp)
            PillSlider(value = 1f, onValueChange = {},
                trackHeight = 4.dp, thumbSize = 20.dp)
        }
    }
}

@Preview(name = "Glass Status Card", showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun GlassStatusCardPreview() {
    MaterialTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            GlassStatusCard(
                title = "Conexão Estável",
                subtitle = "Microfone ativo e transmitindo",
                statusState = StatusState.Connected,
                modifier = Modifier.fillMaxWidth()
            )
            GlassStatusCard(
                title = "Reconectando...",
                subtitle = "Tentando restabelecer conexão",
                statusState = StatusState.Reconnecting,
                modifier = Modifier.fillMaxWidth()
            )
            GlassStatusCard(
                title = "Desconectado",
                subtitle = "Toque para conectar",
                statusState = StatusState.Disconnected,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Preview(name = "Glass Panel", showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun GlassPanelPreview() {
    MaterialTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            GlassPanel(modifier = Modifier.fillMaxWidth(), contentPadding = MicshareTheme.Spacing.Md) {
                Column {
                    Text("Configurações", style = MaterialTheme.typography.titleLarge)
                    Text("Ajuste suas preferências de áudio e rede", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Preview(name = "Stat Pills", showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun StatPillsPreview() {
    MaterialTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatPill(title = "Latência", value = "12ms", icon = Icons.Default.Speed, variant = StatPillVariant.Success)
                StatPill(title = "Qualidade", value = "98%", icon = Icons.Default.SignalWifi4Bar, variant = StatPillVariant.Default)
            }
            Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatPill(title = "Buffer", value = "2.1s", icon = Icons.Default.Warning, variant = StatPillVariant.Warning)
                StatPill(title = "Erros", value = "3", icon = Icons.Default.ErrorOutline, variant = StatPillVariant.Danger)
            }
        }
    }
}

@Preview(name = "Animated Status Text", showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun AnimatedStatusTextPreview() {
    MaterialTheme {
        Column(modifier = Modifier.padding(16.dp)) {
            AnimatedStatusText(text = "Conectado", style = MaterialTheme.typography.headlineMedium)
            AnimatedStatusText(text = "Reconectando...", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.secondary)
        }
    }
}