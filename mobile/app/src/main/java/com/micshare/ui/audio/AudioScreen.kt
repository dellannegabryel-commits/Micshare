package com.micshare.ui.audio

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PhonelinkErase
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SignalWifiStatusbar4Bar
import androidx.compose.material.icons.filled.StayCurrentLandscape
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.CircleShape
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.micshare.audio.AudioCodec
import com.micshare.designsystem.MicshareTheme
import com.micshare.designsystem.components.AnimatedStatusText
import com.micshare.designsystem.components.GlassPanel
import com.micshare.designsystem.components.GlassStatusCard
import com.micshare.designsystem.components.HeroMuteButton
import com.micshare.designsystem.components.PillSlider
import com.micshare.designsystem.components.StatPill
import com.micshare.designsystem.components.StatPillVariant
import com.micshare.designsystem.components.StatusState

@Composable
fun AudioScreen(
    viewModel: AudioViewModel,
    onDisconnect: () -> Unit,
) {
    val connected by viewModel.connected.collectAsStateWithLifecycle()
    val muted by viewModel.muted.collectAsStateWithLifecycle()
    val volume by viewModel.volume.collectAsStateWithLifecycle()
    val reconnecting by viewModel.reconnecting.collectAsStateWithLifecycle()
    val loss by viewModel.statsLoss.collectAsStateWithLifecycle()
    val buffer by viewModel.statsBuffer.collectAsStateWithLifecycle()
    val gaps by viewModel.statsGaps.collectAsStateWithLifecycle()
    val reconns by viewModel.statsReconnects.collectAsStateWithLifecycle()
    val currentMicSource by viewModel.micSourceIndex.collectAsStateWithLifecycle()
    val keepScreenOn by viewModel.keepScreenOn.collectAsStateWithLifecycle()
    val noiseSuppression by viewModel.noiseSuppression.collectAsStateWithLifecycle()
    val autoGain by viewModel.autoGain.collectAsStateWithLifecycle()
    val echoCancellation by viewModel.echoCancellation.collectAsStateWithLifecycle()
    val codec by viewModel.codec.collectAsStateWithLifecycle()

    if (keepScreenOn) {
        val view = LocalView.current
        DisposableEffect(Unit) {
            view.keepScreenOn = true
            onDispose {
                view.keepScreenOn = false
            }
        }
    }

    // Status state derived from viewModel
    val statusState = if (reconnecting) StatusState.Reconnecting
        else if (connected) StatusState.Connected
        else StatusState.Disconnected

    val colors = MaterialTheme.colorScheme

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        // Full-screen background with subtle gradient
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.surface),
        )

        val scrollState = rememberScrollState()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(vertical = MicshareTheme.Spacing.ScreenVertical)
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.spacedBy(MicshareTheme.Spacing.Lg),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Glass Status Card - header with connection info
            GlassStatusCard(
                title = viewModel.pcNameDisplay,
                subtitle = "Sessão: ${viewModel.sessionIdDisplay}",
                statusState = statusState,
            )

            // Hero Mute Button - center of attention
            HeroMuteButton(
                isMuted = muted,
                onClick = { viewModel.toggleMute() },
                modifier = Modifier
                    .width(220.dp)
                    .height(220.dp),
            )

            // Volume Control - Pill Slider
            GlassPanel(contentPadding = MicshareTheme.Spacing.Md) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(MicshareTheme.Spacing.Md),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.VolumeUp,
                                contentDescription = null,
                                tint = colors.onSurfaceVariant,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                text = "Volume",
                                style = MaterialTheme.typography.labelLarge,
                                color = colors.onSurface,
                            )
                        }
                        AnimatedStatusText(
                            text = "${(volume * 100).toInt()}%",
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                            color = colors.primary,
                        )
                    }

                    Spacer(modifier = Modifier.height(MicshareTheme.Spacing.Xs))

                    PillSlider(
                        value = volume.toFloat(),
                        onValueChange = { viewModel.setVolume(it.toDouble()) },
                        valueRange = 0.0f..4.0f,
                        steps = 40,
                    )
                }
            }

            // Collapsible Advanced Settings Panel
            GlassPanel() {
                AdvancedSettingsPanel(
                    noiseSuppression = noiseSuppression,
                    onNoiseSuppressionChange = { viewModel.setNoiseSuppression(it) },
                    autoGain = autoGain,
                    onAutoGainChange = { viewModel.setAutoGain(it) },
                    echoCancellation = echoCancellation,
                    onEchoCancellationChange = { viewModel.setEchoCancellation(it) },
                    codec = codec,
                    onCodecChange = { viewModel.setCodec(it) },
                    currentMicSource = currentMicSource,
                    onMicSourceChange = { viewModel.setMicSource(it) },
                )
            }

            // Keep Screen On Toggle
            GlassPanel() {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(MicshareTheme.Spacing.Md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(MicshareTheme.Spacing.Md),
                    ) {
                        Box(
                            modifier = Modifier.size(40.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Default.StayCurrentLandscape,
                                contentDescription = null,
                                tint = colors.onSurfaceVariant,
                                modifier = Modifier.size(24.dp),
                            )
                        }
                        Column {
                            Text(
                                text = "Manter tela acesa",
                                style = MaterialTheme.typography.bodyMedium,
                                color = colors.onSurface,
                            )
                            Text(
                                text = "Evita que a tela apague durante transmissão",
                                style = MaterialTheme.typography.bodySmall,
                                color = colors.onSurfaceVariant,
                            )
                        }
                    }
                    Switch(
                        checked = keepScreenOn,
                        onCheckedChange = { viewModel.setKeepScreenOn(it) },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = colors.primary,
                            checkedTrackColor = colors.primaryContainer,
                        ),
                    )
                }
            }

            // Stats Row - compact pills
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MicshareTheme.Spacing.ScreenHorizontal),
                horizontalArrangement = Arrangement.spacedBy(MicshareTheme.Spacing.ItemGap),
            ) {
                StatPill(
                    title = "Loss",
                    value = "${String.format("%.1f", loss)}%",
                    icon = Icons.Default.Refresh,
                    variant = if (loss > 5) StatPillVariant.Danger else StatPillVariant.Success,
                    modifier = Modifier.weight(1f, fill = false),
                )
                StatPill(
                    title = "Buffer",
                    value = "${buffer}ms",
                    icon = Icons.Default.SignalWifiStatusbar4Bar,
                    variant = if (buffer > 80) StatPillVariant.Warning else StatPillVariant.Success,
                    modifier = Modifier.weight(1f, fill = false),
                )
                StatPill(
                    title = "Gaps",
                    value = gaps.toString(),
                    icon = Icons.Default.Settings,
                    variant = StatPillVariant.Default,
                    modifier = Modifier.weight(1f, fill = false),
                )
                StatPill(
                    title = "Reconns",
                    value = reconns.toString(),
                    icon = Icons.Default.Refresh,
                    variant = StatPillVariant.Default,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }

            Spacer(modifier = Modifier.height(MicshareTheme.Spacing.Sm))

            // Disconnect Button - bottom
            GlassPanel() {
                Button(
                    onClick = onDisconnect,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .padding(horizontal = MicshareTheme.Spacing.Md),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = colors.errorContainer.copy(alpha = 0.8f),
                        contentColor = colors.onErrorContainer,
                    ),
                    shape = MicshareTheme.Shapes.Pill,
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Default.PhonelinkErase,
                            contentDescription = null,
                            tint = colors.onErrorContainer,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Desconectar",
                            style = MaterialTheme.typography.labelLarge,
                            color = colors.onErrorContainer,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AdvancedSettingsPanel(
    noiseSuppression: Boolean,
    onNoiseSuppressionChange: (Boolean) -> Unit,
    autoGain: Boolean,
    onAutoGainChange: (Boolean) -> Unit,
    echoCancellation: Boolean,
    onEchoCancellationChange: (Boolean) -> Unit,
    codec: AudioCodec,
    onCodecChange: (AudioCodec) -> Unit,
    currentMicSource: Int,
    onMicSourceChange: (Int) -> Unit,
) {
    val expanded = remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme

    Column(modifier = Modifier.fillMaxWidth()) {
        // Header with expand toggle (no extra padding - GlassPanel provides it)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Ajustes Avançados",
                style = MaterialTheme.typography.labelLarge,
                color = colors.onSurface,
            )
            IconButton(
                onClick = { expanded.value = !expanded.value },
                modifier = Modifier.size(32.dp),
            ) {
                val rotation by animateFloatAsState(
                    targetValue = if (expanded.value) 180f else 0f,
                    animationSpec = spring(
                        dampingRatio = Spring.DampingRatioMediumBouncy,
                        stiffness = Spring.StiffnessLow,
                    ),
                )
                Icon(
                    imageVector = Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = colors.onSurfaceVariant,
                    modifier = Modifier
                        .size(24.dp)
                        .graphicsLayer { this.rotationZ = rotation },
                )
            }
        }

        androidx.compose.animation.AnimatedVisibility(
            visible = expanded.value,
            enter = androidx.compose.animation.expandVertically(
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessLow,
                ),
            ),
            exit = androidx.compose.animation.shrinkVertically(
                animationSpec = tween(200),
            ),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MicshareTheme.Spacing.Xxs)
                    .padding(bottom = MicshareTheme.Spacing.Xxs),
            ) {
                // NS Toggle
                GlassSettingRow(
                    title = "Supressão de Ruído (NS)",
                    subtitle = "Pode cortar voz distante se ligada",
                    icon = { Icon(Icons.Default.MicOff, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.size(24.dp)) },
                    trailing = {
                        Switch(
                            checked = noiseSuppression,
                            onCheckedChange = onNoiseSuppressionChange,
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = colors.primary,
                                checkedTrackColor = colors.primaryContainer,
                            ),
                        )
                    },
                )

                // AGC Toggle
                GlassSettingRow(
                    title = "Ganho Automático (AGC)",
                    subtitle = "Amplifica voz baixa automaticamente",
                    icon = { Icon(Icons.Default.VolumeUp, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.size(24.dp)) },
                    trailing = {
                        Switch(
                            checked = autoGain,
                            onCheckedChange = onAutoGainChange,
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = colors.primary,
                                checkedTrackColor = colors.primaryContainer,
                            ),
                        )
                    },
                )

                // AEC Toggle
                GlassSettingRow(
                    title = "Cancelamento de Eco (AEC)",
                    subtitle = "Som metálico se não houver saída no celular",
                    icon = { Icon(Icons.Default.PhonelinkErase, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.size(24.dp)) },
                    trailing = {
                        Switch(
                            checked = echoCancellation,
                            onCheckedChange = onEchoCancellationChange,
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = colors.primary,
                                checkedTrackColor = colors.primaryContainer,
                            ),
                        )
                    },
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .padding(top = 2.dp)
                        .padding(bottom = 2.dp)
                        .background(colors.outlineVariant.copy(alpha = 0.15f)),
                )

                // Codec Selector
                GlassSettingRow(
                    title = "Codec de Áudio",
                    subtitle = "Opus economiza banda, PCM compatibilidade máxima",
                    icon = { Icon(Icons.Default.Settings, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.size(24.dp)) },
                    trailing = {
                        GlassCodecSelector(
                            currentCodec = codec,
                            onCodecChange = onCodecChange,
                        )
                    },
                )

                // Mic Source Selector
                GlassSettingRow(
                    title = "Fonte do Microfone",
                    subtitle = "Ajuste se a voz estiver baixa ou com eco",
                    icon = { Icon(Icons.Default.Mic, contentDescription = null, tint = colors.onSurfaceVariant, modifier = Modifier.size(24.dp)) },
                    trailing = {
                        GlassMicSourceSelector(
                            currentSource = currentMicSource,
                            onSourceChange = onMicSourceChange,
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun GlassSettingRow(
    title: String,
    subtitle: String,
    icon: @Composable () -> Unit,
    trailing: @Composable () -> Unit,
) {
    val colors = MaterialTheme.colorScheme

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MicshareTheme.Spacing.Xxs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MicshareTheme.Spacing.Md),
            modifier = Modifier.weight(1f),
        ) {
            Box(
                modifier = Modifier.size(40.dp),
                contentAlignment = Alignment.Center,
            ) {
                icon()
            }
            Column {
                Text(text = title, style = MaterialTheme.typography.bodyMedium, color = colors.onSurface)
                Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
            }
        }
        trailing()
    }
}

@Composable
private fun GlassCodecSelector(
    currentCodec: AudioCodec,
    onCodecChange: (AudioCodec) -> Unit,
) {
    val colors = MaterialTheme.colorScheme

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val codecs = listOf(AudioCodec.Pcm, AudioCodec.Opus(24000))
        codecs.forEach { c ->
            val isSelected = when {
                c == AudioCodec.Pcm -> !(currentCodec is AudioCodec.Opus)
                c is AudioCodec.Opus -> currentCodec is AudioCodec.Opus
                else -> false
            }
            Button(
                onClick = { onCodecChange(c) },
                modifier = Modifier
                    .weight(1f, fill = false)
                    .height(32.dp)
                    .wrapContentWidth(Alignment.CenterHorizontally),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isSelected) colors.primaryContainer else colors.surfaceContainerHighest.copy(alpha = 0.5f),
                    contentColor = if (isSelected) colors.onPrimaryContainer else colors.onSurfaceVariant,
                ),
                shape = MicshareTheme.Shapes.Pill,
            ) {
                Text(
                    text = when (c) {
                        is AudioCodec.Opus -> "Opus ${c.bitrate / 1000}kbps"
                        else -> "PCM 16-bit"
                    },
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun GlassMicSourceSelector(
    currentSource: Int,
    onSourceChange: (Int) -> Unit,
) {
    val colors = MaterialTheme.colorScheme

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val sources = listOf("VoIP", "Reconhecim.", "Padrão")
        sources.forEachIndexed { index, label ->
            Button(
                onClick = { onSourceChange(index) },
                modifier = Modifier
                    .weight(1f, fill = false)
                    .height(32.dp)
                    .wrapContentWidth(Alignment.CenterHorizontally),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (currentSource == index) colors.primaryContainer else colors.surfaceContainerHighest.copy(alpha = 0.5f),
                    contentColor = if (currentSource == index) colors.onPrimaryContainer else colors.onSurfaceVariant,
                ),
                shape = MicshareTheme.Shapes.Pill,
            ) {
                Text(
                    label,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
            }
        }
    }
}