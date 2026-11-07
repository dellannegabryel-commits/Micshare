package com.micshare.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.micshare.audio.AudioSourcePlanner
import com.micshare.audio.MicDevice
import com.micshare.audio.MicDevices
import com.micshare.ui.components.GlassCard

/**
 * Entrada de áudio: fonte, microfone e ganho automático.
 *
 * Fica na tela ociosa (antes de conectar): a captura só abre com o
 * `AudioRecord`, então trocar de microfone no meio do stream exigiria
 * reiniciar a sessão de áudio (corte no áudio + resync no PC).
 *
 * @param source fonte de áudio escolhida.
 * @param micId microfone escolhido (`NO_DEVICE` = padrão do sistema).
 * @param agc ganho automático ligado.
 * @param mics microfones disponíveis.
 * @param sources fontes suportadas pelo aparelho.
 * @param onSourceChange troca a fonte.
 * @param onMicChange troca o microfone.
 * @param onAgcChange liga/desliga o AGC.
 */
@Composable
fun AudioInputSection(
    source: Int,
    micId: Int,
    agc: Boolean,
    mics: List<MicDevice>,
    sources: List<Int>,
    onSourceChange: (Int) -> Unit,
    onMicChange: (Int) -> Unit,
    onAgcChange: (Boolean) -> Unit,
) {
    GlassCard {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Entrada de áudio",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = "Vale na próxima conexão.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            DropdownField(
                label = "Fonte",
                current = AudioSourcePlanner.label(source),
                options = sources.map { candidate ->
                    AudioSourcePlanner.label(candidate) to { onSourceChange(candidate) }
                },
            )

            DropdownField(
                label = "Microfone",
                current = mics.firstOrNull { it.id == micId }?.name ?: "Padrão do sistema",
                options = listOf<Pair<String, () -> Unit>>(
                    "Padrão do sistema" to { onMicChange(MicDevices.NO_DEVICE) },
                ) + mics.map { device ->
                    device.name to { onMicChange(device.id) }
                },
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Ganho automático (AGC)",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                Switch(checked = agc, onCheckedChange = onAgcChange)
            }
        }
    }
}

/** Campo com lista suspensa. */
@Composable
private fun DropdownField(
    label: String,
    current: String,
    options: List<Pair<String, () -> Unit>>,
) {
    var expanded by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Box {
            Surface(
                onClick = { expanded = true },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = current,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(
                        imageVector = Icons.Filled.KeyboardArrowDown,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
            ) {
                options.forEach { (text, action) ->
                    DropdownMenuItem(
                        text = { Text(text) },
                        onClick = {
                            expanded = false
                            action()
                        },
                    )
                }
            }
        }
    }
}
