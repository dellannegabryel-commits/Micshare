package com.micshare

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.micshare.designsystem.MicshareColors
import com.micshare.designsystem.MicshareTheme
import com.micshare.discovery.PCInfo
import com.micshare.ui.audio.AudioScreen
import com.micshare.ui.audio.AudioViewModel
import com.micshare.ui.discovery.DiscoveryScreen
import com.micshare.ui.discovery.DiscoveryViewModel
import kotlinx.coroutines.launch
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf
import androidx.compose.ui.platform.LocalContext

class MainActivity : ComponentActivity() {
    private val requestPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
        // Permissions handled automatically by compose
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { MicshareApp() }
    }

    override fun onStart() {
        super.onStart()
        checkPermissions()
    }

    private fun checkPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.ACCESS_NETWORK_STATE
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            permissions.add(Manifest.permission.FOREGROUND_SERVICE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            permissions.add(Manifest.permission.FOREGROUND_SERVICE_MICROPHONE)
        }

        val toRequest = permissions.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (toRequest.isNotEmpty()) {
            requestPermissions.launch(toRequest.toTypedArray())
        }
    }
}

@Composable
fun MicshareApp() {
    val context = LocalContext.current
    val navController = rememberNavController()
    val discoveryViewModel: DiscoveryViewModel = koinViewModel()
    val scope = rememberCoroutineScope()
    var connectingPc by remember { mutableStateOf<PCInfo?>(null) }
    var connectionError by remember { mutableStateOf<String?>(null) }

    MicshareTheme.Theme(context) {
        Surface(
            color = MicshareColors.BackgroundPrimary,
            modifier = Modifier.fillMaxSize(),
        ) {
            NavHost(navController, startDestination = "discovery", modifier = Modifier.fillMaxSize()) {
                composable("discovery") {
                    DiscoveryScreen(
                        viewModel = discoveryViewModel,
                        onPair = { pc ->
                            connectingPc = pc
                            connectionError = null
                            scope.launch {
                                val pairingClient = com.micshare.control.PairingClient(pc.ip, pc.ctrlPort)
                                val result = pairingClient.connect("")
                                connectingPc = null
                                if (result.success && result.sessionId != null) {
                                    navController.navigate("audio/${pc.ip}/${pc.audioPort}/${pc.ctrlPort}/${result.sessionId}/${pc.name}")
                                } else {
                                    connectionError = result.error ?: "Falha ao conectar com ${pc.name} (${pc.ip}). Verifique se o servidor no PC está rodando."
                                }
                            }
                        },
                    )
                }

                composable(
                    route = "audio/{ip}/{audioPort}/{ctrlPort}/{sessionId}/{pcName}",
                    arguments = listOf(
                        navArgument("ip") { type = NavType.StringType },
                        navArgument("audioPort") { type = NavType.IntType },
                        navArgument("ctrlPort") { type = NavType.IntType },
                        navArgument("sessionId") { type = NavType.StringType },
                        navArgument("pcName") { type = NavType.StringType },
                    ),
                ) { backStackEntry ->
                    val args = backStackEntry.arguments
                    val ip = args?.getString("ip") ?: ""
                    val audioPort = args?.getInt("audioPort") ?: 0
                    val ctrlPort = args?.getInt("ctrlPort") ?: 0
                    val sessionId = args?.getString("sessionId") ?: ""
                    val pcName = args?.getString("pcName") ?: ""

                    val audioViewModel: AudioViewModel = koinViewModel(
                        parameters = { parametersOf(ip, audioPort, ctrlPort, sessionId, pcName) },
                    )

                    AudioScreen(
                        viewModel = audioViewModel,
                        onDisconnect = {
                            audioViewModel.disconnect()
                            navController.popBackStack()
                        },
                    )
                }
            }

            // Connecting dialog overlay
            connectingPc?.let { pc ->
                AlertDialog(
                    onDismissRequest = {},
                    title = { Text("Conectando") },
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(32.dp))
                            Text("Conectando a ${pc.name}\n(${pc.ip}:${pc.ctrlPort})...")
                        }
                    },
                    confirmButton = {},
                )
            }

            // Error dialog overlay
            connectionError?.let { err ->
                AlertDialog(
                    onDismissRequest = { connectionError = null },
                    title = { Text("Erro de Conexão") },
                    text = { Text(err) },
                    confirmButton = {
                        Button(onClick = { connectionError = null }) {
                            Text("OK")
                        }
                    },
                )
            }
        }
    }
}