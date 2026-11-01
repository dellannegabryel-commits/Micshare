package com.micshare

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.micshare.network.DiscoveredServer
import com.micshare.ui.screens.MainScreen
import com.micshare.ui.theme.MicshareTheme
import com.micshare.viewmodel.MainViewModel

/**
 * Activity principal do app cliente.
 *
 * Cuida das permissões de runtime (microfone e notificações) e conecta a UI
 * ao [MainViewModel].
 */
class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    /** PC aguardando a permissão de microfone para conectar. */
    private var pendingServer: DiscoveredServer? = null

    private val audioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val server = pendingServer
        pendingServer = null

        if (granted && server != null) {
            viewModel.connect(server)
        } else if (!granted) {
            Toast.makeText(
                this,
                getString(R.string.permission_microphone_required),
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* A notificação do foreground service funciona mesmo sem o consentimento. */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        requestNotificationPermission()

        setContent {
            MicshareTheme {
                val state by viewModel.state.collectAsStateWithLifecycle()

                MainScreen(
                    state = state,
                    onConnect = ::connectToServer,
                    onDisconnect = viewModel::disconnect,
                    onToggleMute = viewModel::toggleMute,
                    onVolumeChange = viewModel::setVolume,
                    onRefresh = viewModel::startDiscovery,
                )
            }
        }
    }

    /** Conecta ao PC, pedindo a permissão de microfone se necessário. */
    private fun connectToServer(server: DiscoveredServer) {
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

        if (granted) {
            viewModel.connect(server)
        } else {
            pendingServer = server
            audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    /** Pede a permissão de notificações (API 33+). */
    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return

        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED

        if (!granted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
