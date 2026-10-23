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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.micshare.designsystem.MicshareColors
import com.micshare.designsystem.MicshareShapes
import com.micshare.designsystem.MicshareSpacing
import com.micshare.designsystem.MicshareTypography
import com.micshare.designsystem.components.AccentPrimary
import com.micshare.designsystem.components.MicshareButton
import com.micshare.designsystem.components.MicshareCard
import com.micshare.designsystem.components.MicshareTextField
import com.micshare.designsystem.components.ButtonSize
import com.micshare.designsystem.components.ButtonVariant
import com.micshare.designsystem.components.Computer
import com.micshare.designsystem.components.Refresh
import com.micshare.discovery.PCInfo
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoveryScreen(
    viewModel: DiscoveryViewModel,
    onPair: (PCInfo) -> Unit,
) {
    val pcs by viewModel.pcs.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    var manualIp by remember { mutableStateOf("") }
    var inputError by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Top,
    ) {
        TopAppBar(
            title = {
                Column {
                    Text(
                        text = "Micshare",
                        fontSize = MicshareTypography.DisplaySmall.fontSize,
                        fontWeight = FontWeight.Bold,
                        color = MicshareColors.TextPrimary,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Selecione um PC para conectar",
                        fontSize = MicshareTypography.BodySmall.fontSize,
                        color = MicshareColors.TextTertiary,
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = MicshareColors.BackgroundPrimary,
                titleContentColor = MicshareColors.TextPrimary,
            ),
            actions = {
                IconButton(
                    onClick = { viewModel.refresh() },
                    enabled = !refreshing,
                ) {
                    if (refreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MicshareColors.TextPrimary,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(Refresh, contentDescription = "Atualizar", tint = MicshareColors.TextPrimary)
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )

        if (pcs.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(MicshareSpacing.ScreenHorizontal),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(MicshareSpacing.Lg),
                ) {
                    Icon(
                        imageVector = Computer,
                        contentDescription = null,
                        tint = MicshareColors.TextTertiary,
                        modifier = Modifier.size(64.dp),
                    )
                    Spacer(modifier = Modifier.height(MicshareSpacing.Lg))
                    Text(
                        text = "Nenhum PC encontrado",
                        fontSize = MicshareTypography.TitleSmall.fontSize,
                        fontWeight = FontWeight.Bold,
                        color = MicshareColors.TextPrimary,
                    )
                    Spacer(modifier = Modifier.height(MicshareSpacing.Xs))
                    Text(
                        text = "1. Verifique se o Micshare está rodando no seu PC.\n2. Confirme que o celular e o PC estão na mesma Wi-Fi.\n3. Puxe para atualizar ou toque no botão acima.",
                        fontSize = MicshareTypography.BodyMedium.fontSize,
                        color = MicshareColors.TextSecondary,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = MicshareSpacing.ScreenHorizontal, vertical = MicshareSpacing.Md),
                verticalArrangement = Arrangement.spacedBy(MicshareSpacing.ItemGap),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = MicshareSpacing.Xl),
            ) {
                items(pcs) { pc ->
                    PCItemCard(pc = pc, onClick = { onPair(pc) })
                }
            }
        }

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
            modifier = Modifier
                .padding(horizontal = MicshareSpacing.ScreenHorizontal, vertical = MicshareSpacing.Md)
                .fillMaxWidth(),
        )
    }
}

@Composable
fun PCItemCard(pc: PCInfo, onClick: () -> Unit) {
    MicshareCard(
        variant = com.micshare.designsystem.components.CardVariant.Elevated,
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = pc.name,
                    style = MicshareTypography.BodyLarge,
                    color = MicshareColors.TextPrimary,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${pc.ip}:${pc.ctrlPort}",
                    style = MicshareTypography.BodySmall.copy(fontFamily = MicshareTypography.MonoMedium.fontFamily),
                    color = MicshareColors.TextTertiary,
                )
            }
            Text(
                text = if (pc.pair) "🔒 Parear" else "🔓 Conectar",
                style = MicshareTypography.LabelMedium,
                color = AccentPrimary,
            )
        }
    }
}

@Composable
fun ManualConnectSection(
    manualIp: String,
    inputError: String?,
    onManualIpChange: (String) -> Unit,
    onConnect: () -> Unit,
    modifier: Modifier,
) {
    Column(modifier = modifier) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(MicshareColors.Separator),
        )
        Spacer(modifier = Modifier.height(MicshareSpacing.Lg))
        Text(
            text = "Conexão manual (IP:porta)",
            style = MicshareTypography.LabelLarge,
            color = MicshareColors.TextPrimary,
        )
        Spacer(modifier = Modifier.height(MicshareSpacing.Md))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(MicshareSpacing.Sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MicshareTextField(
                value = manualIp,
                onValueChange = onManualIpChange,
                placeholder = "192.168.1.50:41236",
                singleLine = true,
                modifier = Modifier.weight(1f),
                isError = inputError != null,
                textStyle = MicshareTypography.BodyLarge.copy(fontFamily = MicshareTypography.MonoMedium.fontFamily),
            )
            MicshareButton(
                onClick = onConnect,
                variant = ButtonVariant.Primary,
                size = ButtonSize.Large,
                modifier = Modifier.height(56.dp),
            ) {
                Text(text = "Conectar", style = MicshareTypography.ButtonLarge, color = MicshareColors.BrandOnPrimary)
            }
        }
        inputError?.let { err ->
            Spacer(modifier = Modifier.height(MicshareSpacing.Xs))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MicshareColors.ErrorBackground, MicshareShapes.Input)
                    .padding(MicshareSpacing.Sm),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = err,
                    style = MicshareTypography.LabelSmall,
                    color = MicshareColors.Error,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PairingModal(
    pc: PCInfo,
    onDismiss: () -> Unit,
    onSuccess: (sessionId: String) -> Unit,
) {
    var code by remember { mutableStateOf("") }
    var isConnecting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(
        onDismissRequest = {
            if (!isConnecting) onDismiss()
        },
        sheetState = sheetState,
        containerColor = MicshareColors.BackgroundPrimary,
        shape = MicshareShapes.Sheet,
    ) {
        Column(
            modifier = Modifier
                .padding(MicshareSpacing.Xl)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Drag handle
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .padding(bottom = MicshareSpacing.Md),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(4.dp)
                        .background(MicshareColors.TextTertiary, MicshareShapes.Full),
                )
            }

            Text(
                text = "Parear com ${pc.name}",
                style = MicshareTypography.TitleLarge,
                color = MicshareColors.TextPrimary,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "IP: ${pc.ip}:${pc.ctrlPort}",
                style = MicshareTypography.BodySmall,
                color = MicshareColors.TextTertiary,
            )
            Spacer(modifier = Modifier.height(MicshareSpacing.Sm))
            Text(
                text = "Digite o código de 6 dígitos mostrado no PC:",
                style = MicshareTypography.BodyMedium,
                color = MicshareColors.TextSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(MicshareSpacing.Xl))

            MicshareTextField(
                value = code,
                onValueChange = {
                    errorMessage = null
                    code = it.filter { ch -> ch.isDigit() }.take(6)
                },
                singleLine = true,
                enabled = !isConnecting,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MicshareSpacing.Xl),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                textStyle = MicshareTypography.DisplaySmall.copy(
                    letterSpacing = 16.sp,
                    textAlign = TextAlign.Center,
                    fontFamily = MicshareTypography.MonoLarge.fontFamily,
                ),
                isError = errorMessage != null,
            )

            errorMessage?.let { error ->
                Spacer(modifier = Modifier.height(MicshareSpacing.Md))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MicshareColors.ErrorBackground, MicshareShapes.Card)
                        .padding(MicshareSpacing.Md),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = error,
                        style = MicshareTypography.LabelSmall,
                        color = MicshareColors.Error,
                        textAlign = TextAlign.Center,
                    )
                }
            }

            Spacer(modifier = Modifier.height(MicshareSpacing.Xl))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MicshareSpacing.Md),
            ) {
                MicshareButton(
                    onClick = onDismiss,
                    variant = ButtonVariant.Secondary,
                    size = ButtonSize.Large,
                    modifier = Modifier.weight(1f),
                    enabled = !isConnecting,
                ) {
                    Text(text = "Cancelar", style = MicshareTypography.ButtonLarge, color = MicshareColors.TextSecondary)
                }

                MicshareButton(
                    onClick = {
                        isConnecting = true
                        errorMessage = null
                        scope.launch {
                            val pairingClient = com.micshare.control.PairingClient(pc.ip, pc.ctrlPort)
                            val result = pairingClient.connect(code)
                            isConnecting = false
                            if (result.success && result.sessionId != null) {
                                onSuccess(result.sessionId!!)
                            } else {
                                errorMessage = result.error ?: "Falha ao conectar com o PC. Verifique o código e o IP."
                            }
                        }
                    },
                    variant = ButtonVariant.Primary,
                    size = ButtonSize.Large,
                    modifier = Modifier.weight(1f),
                    enabled = code.length == 6 && !isConnecting,
                ) {
                    if (isConnecting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MicshareColors.BrandOnPrimary,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(text = "Confirmar", style = MicshareTypography.ButtonLarge, color = MicshareColors.BrandOnPrimary)
                    }
                }
            }
            Spacer(modifier = Modifier.height(MicshareSpacing.Lg))
        }
    }
}