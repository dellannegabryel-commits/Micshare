package com.micshare.ui.screens

import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.micshare.network.DiscoveredServer
import com.micshare.ui.components.ErrorCard
import com.micshare.ui.components.StatusPill
import com.micshare.ui.theme.Sky500
import com.micshare.viewmodel.Phase
import com.micshare.viewmodel.UiState

/**
 * Tela principal do app cliente.
 *
 * Reproduz a estrutura do app PC: cabeçalho fixo, cards translúcidos e rodapé
 * com a versão e a latência alvo.
 */
@Composable
fun MainScreen(
    state: UiState,
    onConnect: (DiscoveredServer) -> Unit,
    onDisconnect: () -> Unit,
    onToggleMute: () -> Unit,
    onVolumeChange: (Float) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { AppHeader(phase = state.phase) },
        bottomBar = { AppFooter() },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            state.error?.let { message ->
                ErrorCard(message = message)
            }

            if (state.phase == Phase.Idle) {
                DiscoverySection(
                    servers = state.servers,
                    scanning = state.scanning,
                    onConnect = onConnect,
                    onRefresh = onRefresh,
                )
            } else {
                SessionSection(
                    state = state,
                    onDisconnect = onDisconnect,
                    onToggleMute = onToggleMute,
                    onVolumeChange = onVolumeChange,
                )
            }
        }
    }
}

/** Cabeçalho com a identidade do app e o status da sessão. */
@Composable
private fun AppHeader(phase: Phase) {
    Surface(color = MaterialTheme.colorScheme.background.copy(alpha = 0.85f)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppIcon()

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Micshare",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    text = "Cliente · microfone do PC",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            StatusPill(text = phase.label(), tone = phase.tone())
        }
    }
}

/** Ícone do app: quadrado arredondado na cor primária com o microfone. */
@Composable
private fun AppIcon() {
    Surface(
        modifier = Modifier.size(40.dp),
        shape = RoundedCornerShape(12.dp),
        color = Sky500,
    ) {
        Icon(
            imageVector = Icons.Filled.Mic,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
        )
    }
}

/** Rodapé com a versão e a latência alvo. */
@Composable
private fun AppFooter() {
    Surface(color = MaterialTheme.colorScheme.background.copy(alpha = 0.85f)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "Micshare v0.1.0",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "Latência alvo: < 150ms",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
