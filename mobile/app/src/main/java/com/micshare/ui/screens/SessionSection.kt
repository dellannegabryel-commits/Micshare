package com.micshare.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.micshare.ui.components.ButtonVariant
import com.micshare.ui.components.GlassCard
import com.micshare.ui.components.PillButton
import com.micshare.ui.components.StatPill
import com.micshare.ui.components.StatusPill
import com.micshare.ui.theme.Green400
import com.micshare.ui.theme.Green500
import com.micshare.ui.theme.Red400
import com.micshare.ui.theme.Red500
import com.micshare.ui.theme.Yellow400
import com.micshare.viewmodel.Phase
import com.micshare.viewmodel.UiState
import kotlin.math.roundToInt

/**
 * Painel da sessão ativa: status do PC, controles de áudio e estatísticas.
 */
@Composable
fun SessionSection(
    state: UiState,
    onDisconnect: () -> Unit,
    onToggleMute: () -> Unit,
    onVolumeChange: (Float) -> Unit,
) {
    ServerStatusCard(state = state, onDisconnect = onDisconnect)
    AudioControlsCard(
        muted = state.muted,
        volume = state.volume,
        onToggleMute = onToggleMute,
        onVolumeChange = onVolumeChange,
    )
    StatsCard(state = state)
}

/** Card de status do PC conectado. */
@Composable
private fun ServerStatusCard(
    state: UiState,
    onDisconnect: () -> Unit,
) {
    GlassCard {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = state.server?.name ?: "PC",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            StatusPill(text = state.phase.label(), tone = state.phase.tone())
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StatPill(
                value = state.sessionId ?: "—",
                label = "Sessão",
                modifier = Modifier.weight(1f),
            )
            StatPill(
                value = state.codec ?: "—",
                label = "Codec",
                modifier = Modifier.weight(1f),
            )
            StatPill(
                value = state.audio.framesSent.toString(),
                label = "Frames",
                modifier = Modifier.weight(1f),
                accent = MaterialTheme.colorScheme.primary,
            )
        }

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        ) {
            Text(
                text = "${state.server?.host ?: "—"}:${state.server?.ctrlPort ?: "—"}",
                style = MaterialTheme.typography.bodyMedium,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }

        PillButton(
            text = "Desconectar",
            onClick = onDisconnect,
            variant = ButtonVariant.Danger,
            loading = state.phase == Phase.Connecting,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, bottom = 20.dp),
        )
    }
}

/** Card de controles de áudio (mute e volume). */
@Composable
private fun AudioControlsCard(
    muted: Boolean,
    volume: Float,
    onToggleMute: () -> Unit,
    onVolumeChange: (Float) -> Unit,
) {
    GlassCard {
        Text(
            text = "Controles de áudio",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 12.dp),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(48.dp),
                shape = RoundedCornerShape(12.dp),
                color = if (muted) Red500.copy(alpha = 0.16f) else Green500.copy(alpha = 0.16f),
            ) {
                Icon(
                    imageVector = if (muted) Icons.Filled.MicOff else Icons.Filled.Mic,
                    contentDescription = null,
                    tint = if (muted) Red400 else Green400,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                )
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (muted) "Microfone mutado" else "Microfone ativo",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = if (muted) {
                        "Os frames são enviados com a flag de mute"
                    } else {
                        "Transmitindo áudio para o PC"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Switch(checked = muted, onCheckedChange = { onToggleMute() })
        }

        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.VolumeUp,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Volume",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${(volume * 100).roundToInt()}%",
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Slider(
                value = volume,
                onValueChange = onVolumeChange,
                valueRange = 0f..4f,
                steps = 39,
            )
        }

        Spacer(Modifier.height(8.dp))
    }
}

/** Card de estatísticas recebidas do PC. */
@Composable
private fun StatsCard(state: UiState) {
    val stats = state.stats

    GlassCard {
        Text(
            text = "Estatísticas em tempo real",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 12.dp),
        )

        Column(
            modifier = Modifier.padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatPill(
                    value = stats?.let { "${"%.1f".format(it.lossPct)}%" } ?: "—",
                    label = "Perda",
                    modifier = Modifier.weight(1f),
                    accent = lossAccent(stats?.lossPct),
                )
                StatPill(
                    value = stats?.let { "${it.bufferMs}ms" } ?: "—",
                    label = "Buffer",
                    modifier = Modifier.weight(1f),
                    accent = bufferAccent(stats?.bufferMs),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatPill(
                    value = stats?.seqGaps?.toString() ?: "—",
                    label = "Gaps",
                    modifier = Modifier.weight(1f),
                )
                StatPill(
                    value = stats?.reconnects?.toString() ?: "—",
                    label = "Reconexões",
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Spacer(Modifier.height(20.dp))
    }
}

/** Cor de destaque da perda de pacotes. */
@Composable
private fun lossAccent(lossPct: Float?): Color? = when {
    lossPct == null -> null
    lossPct > 5f -> Red400
    lossPct > 1f -> Yellow400
    else -> Green400
}

/** Cor de destaque da profundidade do buffer. */
@Composable
private fun bufferAccent(bufferMs: Int?): Color? = when {
    bufferMs == null -> null
    bufferMs > 80 -> Yellow400
    else -> null
}
