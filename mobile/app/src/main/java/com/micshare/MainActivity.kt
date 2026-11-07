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

    private val bluetoothPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* Sem Bluetooth o app ainda usa o microfone embutido. */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        requestNotificationPermission()
        requestBluetoothPermission()

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
                    onAudioSourceChange = viewModel::setAudioSource,
                    onMicChange = viewModel::setMicDevice,
                    onAgcChange = viewModel::setAgcEnabled,
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

    /**
     * Pede a permissão de Bluetooth (API 31+).
     *
     * Sem ela os microfones Bluetooth (SCO) não aparecem na lista de
     * entradas. O microfone embutido funciona sem a permissão.
     */
    private fun requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return

        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.BLUETOOTH_CONNECT,
        ) == PackageManager.PERMISSION_GRANTED

        if (!granted) {
            bluetoothPermissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT)
        }
    }
}
