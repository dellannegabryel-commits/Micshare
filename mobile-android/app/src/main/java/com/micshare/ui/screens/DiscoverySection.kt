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
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.micshare.network.DiscoveredServer
import com.micshare.ui.components.ButtonVariant
import com.micshare.ui.components.GlassCard
import com.micshare.ui.components.PillButton
import com.micshare.ui.components.StatusPill
import com.micshare.ui.components.Tone

/**
 * Lista de PCs descobertos na rede local.
 *
 * @param servers PCs encontrados (beacon recebido).
 * @param scanning `true` enquanto a descoberta está ativa.
 * @param onConnect conecta a um PC.
 * @param onRefresh reinicia a descoberta.
 */
@Composable
fun DiscoverySection(
    servers: List<DiscoveredServer>,
    scanning: Boolean,
    onConnect: (DiscoveredServer) -> Unit,
    onRefresh: () -> Unit,
) {
    GlassCard {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 12.dp, top = 16.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Servidores na rede",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = if (scanning) "Procurando PCs..." else "Descoberta pausada",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            IconButton(onClick = onRefresh) {
                Icon(
                    imageVector = Icons.Filled.Refresh,
                    contentDescription = "Atualizar descoberta",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (servers.isEmpty()) {
            EmptyDiscovery()
        } else {
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                servers.forEach { server ->
                    ServerRow(server = server, onConnect = { onConnect(server) })
                }
            }
        }

        Spacer(Modifier.height(12.dp))
    }
}

/** Estado vazio da descoberta. */
@Composable
private fun EmptyDiscovery() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Nenhum servidor encontrado",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Certifique-se de que o Micshare está rodando no PC e na mesma rede Wi-Fi.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/** Linha de um PC descoberto. */
@Composable
private fun ServerRow(
    server: DiscoveredServer,
    onConnect: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = server.name,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    if (server.pair) {
                        StatusPill(text = "Código", tone = Tone.Warning)
                    }
                }

                Spacer(Modifier.height(2.dp))

                Text(
                    text = "${server.host}:${server.ctrlPort}",
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.width(12.dp))

            PillButton(
                text = "Conectar",
                onClick = onConnect,
                variant = ButtonVariant.Primary,
                modifier = Modifier.width(120.dp),
            )
        }
    }
}
