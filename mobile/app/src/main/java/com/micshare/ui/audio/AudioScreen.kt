package com.micshare.ui.audio

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.micshare.designsystem.MicshareColors
import com.micshare.designsystem.MicshareShapes
import com.micshare.designsystem.MicshareSpacing
import com.micshare.designsystem.MicshareTypography
import com.micshare.designsystem.components.ButtonSize
import com.micshare.designsystem.components.ButtonVariant
import com.micshare.designsystem.components.CardVariant
import com.micshare.designsystem.components.Logout
import com.micshare.designsystem.components.Memory
import com.micshare.designsystem.components.MicshareCard
import com.micshare.designsystem.components.MicshareButton
import com.micshare.designsystem.components.MicshareSlider
import com.micshare.designsystem.components.MicshareStatCard
import com.micshare.designsystem.components.MicshareStatusIndicator
import com.micshare.designsystem.components.Refresh
import com.micshare.designsystem.components.SignalWifiStatusbar4Bar
import com.micshare.designsystem.components.StatCardVariant
import com.micshare.designsystem.components.StatusSize
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

    if (keepScreenOn) {
        val view = LocalView.current
        DisposableEffect(Unit) {
            view.keepScreenOn = true
            onDispose {
                view.keepScreenOn = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MicshareColors.BackgroundPrimary)
            .padding(vertical = MicshareSpacing.ScreenVertical),
        verticalArrangement = Arrangement.SpaceBetween,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Header
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MicshareSpacing.ScreenHorizontal),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = viewModel.pcNameDisplay,
                        style = MicshareTypography.HeadlineLarge,
                        color = MicshareColors.TextPrimary,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Sessão: ${viewModel.sessionIdDisplay}",
                        style = MicshareTypography.BodySmall.copy(fontFamily = MicshareTypography.MonoSmall.fontFamily),
                        color = MicshareColors.TextTertiary,
                    )
                }
                MicshareStatusIndicator(
                    state = if (reconnecting) StatusState.Reconnecting else StatusState.Connected,
                    text = if (reconnecting) "Reconectando..." else "Conectado",
                    size = StatusSize.Medium,
                )
            }
        }

        // Mute button (Primary action)
        MicshareButton(
            onClick = { viewModel.toggleMute() },
            variant = if (muted) ButtonVariant.Danger else ButtonVariant.Primary,
            size = ButtonSize.Large,
            modifier = Modifier
                .padding(vertical = MicshareSpacing.Sm)
                .width(260.dp)
                .height(90.dp),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = if (muted) "🔇 MUDO" else "🎙 ATIVO",
                    style = MicshareTypography.TitleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        // Volume section
        MicshareCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MicshareSpacing.ScreenHorizontal),
            variant = CardVariant.Primary,
        ) {
            Column(modifier = Modifier.padding(MicshareSpacing.Md)) {
                Text(
                    text = "Volume: ${(volume * 100).toInt()}%",
                    style = MicshareTypography.LabelLarge,
                    color = MicshareColors.TextPrimary,
                )
                Spacer(modifier = Modifier.height(MicshareSpacing.Sm))
                MicshareSlider(
                    value = volume.toFloat(),
                    onValueChange = { viewModel.setVolume(it.toDouble()) },
                    valueRange = 0.0f..4.0f,
                    steps = 40,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        // Keep Screen On Switch section
        MicshareCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MicshareSpacing.ScreenHorizontal),
            variant = CardVariant.Primary,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(MicshareSpacing.Md),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Manter tela acesa",
                        style = MicshareTypography.LabelLarge,
                        color = MicshareColors.TextPrimary,
                    )
                    Text(
                        text = "Evita que a tela apague ao transmitir",
                        style = MicshareTypography.BodySmall,
                        color = MicshareColors.TextTertiary,
                    )
                }
                Switch(
                    checked = keepScreenOn,
                    onCheckedChange = { viewModel.setKeepScreenOn(it) },
                )
            }
        }

        // Mic Source section
        MicshareCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MicshareSpacing.ScreenHorizontal),
            variant = CardVariant.Primary,
        ) {
            Column(modifier = Modifier.padding(MicshareSpacing.Md)) {
                Text(
                    text = "Processamento do Microfone",
                    style = MicshareTypography.LabelLarge,
                    color = MicshareColors.TextPrimary,
                )
                Spacer(modifier = Modifier.height(MicshareSpacing.Sm))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val sources = listOf("VoIP (AEC)", "Reconhecimento", "Padrão")
                    sources.forEachIndexed { index, label ->
                        Button(
                            onClick = { viewModel.setMicSource(index) },
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (currentMicSource == index) MicshareColors.BrandPrimary else MicshareColors.BackgroundTertiary,
                                contentColor = Color.White,
                            ),
                            shape = RoundedCornerShape(8.dp),
                        ) {
                            Text(label, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }

        // Stats grid
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MicshareSpacing.ScreenHorizontal),
            horizontalArrangement = Arrangement.spacedBy(MicshareSpacing.ItemGap),
        ) {
            MicshareStatCard(
                title = "Loss",
                value = "${String.format("%.1f", loss)}%",
                icon = Refresh,
                variant = if (loss > 5) StatCardVariant.Danger else StatCardVariant.Success,
                modifier = Modifier.weight(1f),
            )
            MicshareStatCard(
                title = "Buffer",
                value = "${buffer}ms",
                icon = Memory,
                variant = if (buffer > 80) StatCardVariant.Danger else StatCardVariant.Success,
                modifier = Modifier.weight(1f),
            )
            MicshareStatCard(
                title = "Seq Gaps",
                value = gaps.toString(),
                icon = SignalWifiStatusbar4Bar,
                variant = StatCardVariant.Default,
                modifier = Modifier.weight(1f),
            )
            MicshareStatCard(
                title = "Reconns",
                value = reconns.toString(),
                icon = Refresh,
                variant = StatCardVariant.Default,
                modifier = Modifier.weight(1f),
            )
        }

        // Disconnect button
        MicshareButton(
            onClick = onDisconnect,
            variant = ButtonVariant.Outlined,
            size = ButtonSize.Large,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = MicshareSpacing.ScreenHorizontal, end = MicshareSpacing.ScreenHorizontal, bottom = MicshareSpacing.Xl),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Logout,
                    contentDescription = null,
                    tint = MicshareColors.Error,
                    modifier = Modifier.size(MicshareSpacing.IconMd),
                )
                Text(
                    text = "Desconectar",
                    style = MicshareTypography.ButtonLarge,
                    color = MicshareColors.Error,
                )
            }
        }
    }
}