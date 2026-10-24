package com.micshare.ui.discovery

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.micshare.designsystem.MicshareTheme
import com.micshare.designsystem.components.GlassPanel
import com.micshare.designsystem.components.GlassStatusCard
import com.micshare.designsystem.components.StatusState
import com.micshare.discovery.PCInfo

@Composable
fun DiscoveryScreen(
    viewModel: DiscoveryViewModel,
    onPair: (PCInfo) -> Unit,
) {
    val pcs by viewModel.pcs.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    var manualIp by remember { mutableStateOf("") }
    var inputError by remember { mutableStateOf<String?>(null) }

    val colors = MaterialTheme.colorScheme

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.surface),
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(vertical = MicshareTheme.Spacing.ScreenVertical),
            verticalArrangement = Arrangement.spacedBy(MicshareTheme.Spacing.Lg),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = MicshareTheme.Spacing.Xl),
        ) {
            // Header - Glass Status Card
            item {
                GlassStatusCard(
                    title = "Micshare",
                    subtitle = "${pcs.size} PC(s) encontrados",
                    statusState = if (refreshing) StatusState.Reconnecting else StatusState.Connected,
                )
            }

            // PC List or Empty State
            item {
                GlassPanel() {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        if (pcs.isEmpty()) {
                            EmptyStateContent(refreshing = refreshing, onRefresh = { viewModel.refresh() })
                        } else {
                            PCListContent(pcs = pcs, onPair = onPair)
                        }
                    }
                }
            }

            // Manual Connect Section
            item {
                GlassPanel() {
                    ManualConnectSection(
                        manualIp = manualIp,
                        inputError = inputError,
                        onManualIpChange = {
                            manualIp = it
                            inputError = null
                        },
                        onConnect = {
                            val cleaned = manualIp.trim()
                            if (cleaned.isBlank()) {
                                inputError = "Digite o IP do PC (ex: 192.168.1.50)"
                                return@ManualConnectSection
                            }
                            val parts = cleaned.split(":")
                            val ip = parts[0].trim()
                            val port = if (parts.size > 1) parts[1].toIntOrNull() ?: 41236 else 41236
                            if (ip.isBlank()) {
                                inputError = "IP inválido"
                            } else {
                                inputError = null
                                val pc = viewModel.manualConnect(ip, port)
                                onPair(pc)
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyStateContent(refreshing: Boolean, onRefresh: () -> Unit) {
    val colors = MaterialTheme.colorScheme

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(MicshareTheme.Spacing.Lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier.size(80.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Default.Computer,
                contentDescription = null,
                tint = colors.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.size(64.dp),
            )
        }

        Spacer(modifier = Modifier.height(MicshareTheme.Spacing.Lg))

        Text(
            text = "Nenhum PC encontrado",
            style = MaterialTheme.typography.headlineSmall,
            color = colors.onSurface,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(MicshareTheme.Spacing.Sm))

        Text(
            text = "1. Verifique se o Micshare está rodando no seu PC.\n2. Confirme que o celular e o PC estão na mesma Wi-Fi.\n3. Puxe para atualizar ou toque no botão acima.",
            style = MaterialTheme.typography.bodyMedium,
            color = colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(MicshareTheme.Spacing.Lg))

        // Refresh button
        androidx.compose.material3.Button(
            onClick = onRefresh,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = MicshareTheme.Spacing.Md),
            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                containerColor = colors.primaryContainer.copy(alpha = 0.8f),
                contentColor = colors.onPrimaryContainer,
            ),
            shape = MicshareTheme.Shapes.Pill,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (refreshing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = colors.onPrimaryContainer,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        tint = colors.onPrimaryContainer,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(
                    text = if (refreshing) "Atualizando..." else "Procurar PCs",
                    style = MaterialTheme.typography.labelLarge,
                    color = colors.onPrimaryContainer,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun PCListContent(pcs: List<PCInfo>, onPair: (PCInfo) -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MicshareTheme.Spacing.ItemGap),
    ) {
        pcs.forEach { pc ->
            GlassPanel(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MicshareTheme.Spacing.ScreenHorizontal)
                    .padding(vertical = MicshareTheme.Spacing.Xs),
                contentPadding = MicshareTheme.Spacing.Md,
            ) {
                PCItemCard(pc = pc, onClick = { onPair(pc) })
            }
        }
    }
}

@Composable
private fun PCItemCard(pc: PCInfo, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme

    androidx.compose.material3.Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = androidx.compose.material3.CardDefaults.cardColors(
            containerColor = colors.surfaceContainerHighest.copy(alpha = 0.5f),
        ),
        shape = MicshareTheme.Shapes.Squircle,
        elevation = androidx.compose.material3.CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(MicshareTheme.Spacing.Md),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = pc.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.onSurface,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${pc.ip}:${pc.ctrlPort}",
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = MaterialTheme.typography.bodySmall.fontFamily
                    ),
                    color = colors.onSurfaceVariant,
                )
            }
            Text(
                text = if (pc.pair) "Parear" else "Conectar",
                style = MaterialTheme.typography.labelMedium,
                color = colors.primary,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun ManualConnectSection(
    manualIp: String,
    inputError: String?,
    onManualIpChange: (String) -> Unit,
    onConnect: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Conexão manual (IP:porta)",
            style = MaterialTheme.typography.labelLarge,
            color = colors.onSurface,
        )

        Spacer(modifier = Modifier.height(MicshareTheme.Spacing.Md))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(MicshareTheme.Spacing.Sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextField(
                value = manualIp,
                onValueChange = onManualIpChange,
                modifier = Modifier.weight(1f),
                singleLine = true,
                enabled = true,
                isError = inputError != null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = colors.surfaceContainerHighest.copy(alpha = 0.8f),
                    unfocusedContainerColor = colors.surfaceContainerHighest.copy(alpha = 0.5f),
                    focusedIndicatorColor = colors.primary,
                    unfocusedIndicatorColor = colors.outlineVariant.copy(alpha = 0.3f),
                    errorIndicatorColor = colors.error,
                    disabledIndicatorColor = colors.outlineVariant.copy(alpha = 0.1f),
                    focusedTextColor = colors.onSurface,
                    unfocusedTextColor = colors.onSurface,
                    focusedPlaceholderColor = colors.onSurfaceVariant.copy(alpha = 0.5f),
                    unfocusedPlaceholderColor = colors.onSurfaceVariant.copy(alpha = 0.5f),
                    focusedLabelColor = colors.onSurfaceVariant,
                    unfocusedLabelColor = colors.onSurfaceVariant,
                ),
                placeholder = {
                    Text(
                        text = "192.168.1.50:41236",
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.onSurfaceVariant.copy(alpha = 0.5f),
                    )
                },
            )

            androidx.compose.material3.Button(
                onClick = onConnect,
                modifier = Modifier.height(56.dp),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = colors.primary,
                    contentColor = colors.onPrimary,
                ),
                shape = MicshareTheme.Shapes.Pill,
            ) {
                Text(
                    text = "Conectar",
                    style = MaterialTheme.typography.labelLarge,
                    color = colors.onPrimary,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        inputError?.let { err ->
            Spacer(modifier = Modifier.height(MicshareTheme.Spacing.Xs))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.errorContainer, MicshareTheme.Shapes.Pill)
                    .padding(MicshareTheme.Spacing.Sm),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = err,
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.onErrorContainer,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}