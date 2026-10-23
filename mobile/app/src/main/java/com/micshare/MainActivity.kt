package com.micshare

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.micshare.designsystem.MicshareColors
import com.micshare.designsystem.MicshareTheme
import com.micshare.ui.audio.AudioScreen
import com.micshare.ui.audio.AudioViewModel
import com.micshare.ui.discovery.DiscoveryScreen
import com.micshare.ui.discovery.DiscoveryViewModel
import com.micshare.ui.discovery.PairingModal
import org.koin.androidx.compose.koinViewModel
import org.koin.core.parameter.parametersOf

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
    val navController = rememberNavController()
    val discoveryViewModel: DiscoveryViewModel = koinViewModel()
    var pairingPc by remember { mutableStateOf<com.micshare.discovery.PCInfo?>(null) }

    MicshareTheme.Theme {
        Surface(
            color = MicshareColors.BackgroundPrimary,
        ) {
            NavHost(navController, startDestination = "discovery") {
                composable("discovery") {
                    DiscoveryScreen(
                        viewModel = discoveryViewModel,
                        onPair = { pc ->
                            pairingPc = pc
                        },
                    )
                    pairingPc?.let { pc ->
                        PairingModal(
                            pc = pc,
                            onDismiss = { pairingPc = null },
                            onSuccess = { sessionId ->
                                pairingPc = null
                                navController.navigate("audio/${pc.ip}/${pc.audioPort}/${pc.ctrlPort}/${sessionId}/${pc.name}")
                            },
                        )
                    }
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
        }
    }
}