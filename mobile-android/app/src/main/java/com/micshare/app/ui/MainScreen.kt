package com.micshare.app.ui

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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Check
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardActionScope
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.micshare.app.viewmodel.DiscoveredServer
import com.micshare.app.ui.theme.MicshareBackground
import com.micshare.app.ui.theme.MicshareGreen
import com.micshare.app.ui.theme.MicshareSurface
import com.micshare.app.ui.theme.MicshareSurfaceVariant
import com.micshare.app.ui.theme.MicshareOnSurface
import com.micshare.app.ui.theme.MicshareOnBackground
import com.micshare.app.ui.theme.MicshareError
import com.micshare.app.viewmodel.MainViewModel
import com.micshare.app.viewmodel.ServerState

@Composable
fun MainScreen(viewModel: MainViewModel) {
    val serverState by viewModel.serverState.collectAsStateWithLifecycle()
    val discoveredServers by viewModel.discoveredServers.collectAsStateWithLifecycle()
    val selectedServer by viewModel.selectedServer.collectAsStateWithLifecycle()
    val pairingCode by viewModel.pairingCode.collectAsStateWithLifecycle()
    val isStreaming by viewModel.isStreaming.collectAsStateWithLifecycle()
    val audioLevel by viewModel.audioLevel.collectAsStateWithLifecycle()
    val errorMessage by viewModel.errorMessage.collectAsStateWithLifecycle()

    LaunchedEffect(key1 = true) {
        viewModel.startDiscovery()
    }

    Box(modifier = Modifier.fillMaxSize()) {
        androidx.compose.material3.Surface(
            modifier = Modifier.fillMaxSize(),
            color = com.micshare.app.ui.theme.MicshareBackground
        ) {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Micshare",
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = MicshareGreen
                    )
                    IconButton(onClick = { viewModel.startDiscovery() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = MicshareGreen
                        )
                    }
                }

                // Status Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = when (serverState) {
                                ServerState.Idle -> "Pronto para conectar"
                                ServerState.Discovering -> "Procurando servidores..."
                                ServerState.Found -> "Servidor encontrado"
                                ServerState.Pairing -> "Emparelhando..."
                                ServerState.Connected -> "Conectado"
                                ServerState.Streaming -> "Transmitindo áudio"
                                ServerState.Error -> "Erro: $errorMessage"
                            },
                            fontSize = 18.sp,
                            textAlign = TextAlign.Center,
                            fontWeight = FontWeight.Medium
                        )
                        if (serverState == ServerState.Discovering) {
                            Spacer(modifier = Modifier.padding(top = 12.dp))
                            CircularProgressIndicator(color = MicshareGreen)
                        }
                    }
                }

                // Discovered Servers List
                if (discoveredServers.isNotEmpty()) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "Servidores encontrados:",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = MicshareOnSurface
                        )
                        discoveredServers.forEach { server ->
                            ServerCard(
                                server = server,
                                isSelected = selectedServer?.ip == server.ip,
                                onClick = { viewModel.selectServer(server) }
                            )
                        }
                    }
                }

                // Pairing Code Input
                if (serverState == ServerState.Pairing || serverState == ServerState.Found) {
                    PairingCodeInput(
                        pairingCode = pairingCode,
                        onCodeChange = { viewModel.updatePairingCode(it) },
                        onConfirm = { viewModel.confirmPairing() },
                        enabled = pairingCode.length == 6
                    )
                }

                // Streaming Controls
                if (serverState == ServerState.Connected || serverState == ServerState.Streaming) {
                    StreamingControls(
                        isStreaming = isStreaming,
                        audioLevel = audioLevel,
                        onToggleStream = { viewModel.toggleStreaming() },
                        onDisconnect = { viewModel.disconnect() }
                    )
                }

                // Error Message
                if (serverState == ServerState.Error && errorMessage.isNotBlank()) {
                    Text(
                        text = errorMessage,
                        fontSize = 14.sp,
                        color = com.micshare.app.ui.theme.MicshareError,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
fun ServerCard(
    server: DiscoveredServer,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .fillMaxWidth(),
        colors = androidx.compose.material3.CardDefaults.cardColors(
            containerColor = if (isSelected) MicshareGreen.copy(alpha = 0.2f) else MicshareSurface,
            contentColor = com.micshare.app.ui.theme.MicshareOnSurface
        ),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = server.name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${server.ip}:${server.port}",
                    fontSize = 12.sp,
                    color = com.micshare.app.ui.theme.MicshareOnSurface.copy(alpha = 0.7f)
                )
            }
            if (isSelected) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = "Selected",
                    tint = MicshareGreen
                )
            }
        }
    }
}

@Composable
fun PairingCodeInput(
    pairingCode: String,
    onCodeChange: (String) -> Unit,
    onConfirm: () -> Unit,
    enabled: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Código de emparelhamento (6 dígitos)",
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.padding(top = 16.dp))
            Row(
                modifier = Modifier,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top
            ) {
                pairingCode.forEachIndexed { index, char ->
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .background(
                                color = if (index < pairingCode.length) MicshareGreen else MicshareSurfaceVariant,
                                shape = RoundedCornerShape(8.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = char.toString(),
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (index < pairingCode.length) Color.White else com.micshare.app.ui.theme.MicshareOnSurface.copy(alpha = 0.5f)
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.padding(top = 16.dp))
            androidx.compose.material3.OutlinedTextField(
                value = pairingCode,
                onValueChange = onCodeChange,
                modifier = Modifier.width(200.dp),
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Done
                ),
                // keyboardActions removed to avoid IR lowering issue
                visualTransformation = PasswordVisualTransformation(),
                label = { Text("Código") },
                trailingIcon = {
                    if (enabled) {
                        IconButton(onClick = onConfirm) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = "Confirmar"
                            )
                        }
                    }
                }
            )
        }
    }
}

@Composable
fun StreamingControls(
    isStreaming: Boolean,
    audioLevel: Float,
    onToggleStream: () -> Unit,
    onDisconnect: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Audio Level Visualizer
        Card(
            modifier = Modifier.width(200.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Nível de áudio",
                    fontSize = 14.sp,
                    color = com.micshare.app.ui.theme.MicshareOnSurface.copy(alpha = 0.7f)
                )
                Spacer(modifier = Modifier.padding(top = 8.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    (1..10).forEach { i ->
                        Box(
                            modifier = Modifier
                                .width(12.dp)
                                .height((audioLevel * 100 + (i * 5)).coerceIn(10f, 100f).dp)
                                .background(
                                    color = if (i <= (audioLevel * 10).toInt()) MicshareGreen else MicshareSurfaceVariant,
                                    shape = RoundedCornerShape(4.dp)
                                )
                        )
                    }
                }
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Button(
                onClick = onToggleStream,
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = if (isStreaming) com.micshare.app.ui.theme.MicshareError else MicshareGreen
                ),
                modifier = Modifier.width(140.dp)
            ) {
                Text(
                    text = if (isStreaming) "PARAR" else "INICIAR",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
            Button(
                onClick = onDisconnect,
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = MicshareSurfaceVariant
                ),
                modifier = Modifier.width(140.dp)
            ) {
                Text(
                    text = "DESCONECTAR",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}