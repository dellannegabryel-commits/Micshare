package com.micshare.viewmodel

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.micshare.AppContainer
import com.micshare.MicshareApplication
import com.micshare.audio.AudioCaptureService
import com.micshare.audio.StreamingStatus
import com.micshare.network.ControlSession
import com.micshare.network.DiscoveredServer
import com.micshare.protocol.ControlMessage
import com.micshare.protocol.Protocol
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Fase da sessão com o PC.
 */
enum class Phase {
    /** Nenhuma conexão ativa. */
    Idle,

    /** Handshake WebSocket em andamento. */
    Connecting,

    /** Conectado (`welcome` recebido), áudio ainda não iniciado. */
    Connected,

    /** Transmitindo áudio. */
    Streaming,
}

/**
 * Estado completo da UI.
 *
 * @property servers PCs descobertos na rede local.
 * @property scanning `true` enquanto a descoberta está ativa.
 * @property phase fase atual da sessão.
 * @property server PC selecionado.
 * @property sessionId identificador da sessão (vindo do `welcome`).
 * @property codec codec negociado.
 * @property muted `true` quando o microfone está mutado.
 * @property volume ganho enviado ao PC (`[0.0, 4.0]`).
 * @property stats métricas recebidas do PC (`stats`, 1 Hz).
 * @property audio estado do streaming de áudio.
 * @property error última mensagem de erro.
 */
data class UiState(
    val servers: List<DiscoveredServer> = emptyList(),
    val scanning: Boolean = false,
    val phase: Phase = Phase.Idle,
    val server: DiscoveredServer? = null,
    val sessionId: String? = null,
    val codec: String? = null,
    val muted: Boolean = false,
    val volume: Float = 1f,
    val stats: ControlMessage.Stats? = null,
    val audio: StreamingStatus = StreamingStatus(),
    val error: String? = null,
)

/**
 * ViewModel principal: descoberta, sessão de controle e streaming de áudio.
 */
class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val container: AppContainer = (application as MicshareApplication).container

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var discoveryJob: Job? = null
    private var controlJob: Job? = null
    private var audioJob: Job? = null
    private var controlSession: ControlSession? = null
    private var audioBinder: AudioCaptureService.LocalBinder? = null
    private var serviceConnection: ServiceConnection? = null

    init {
        viewModelScope.launch {
            container.settings.settings.collect { settings ->
                _state.update { it.copy(volume = settings.volume) }
            }
        }
        startDiscovery()
    }

    // ---------------------------------------------------------------- discovery

    /** Inicia a escuta do beacon de descoberta. */
    fun startDiscovery() {
        if (discoveryJob?.isActive == true) return

        discoveryJob = viewModelScope.launch {
            _state.update { it.copy(scanning = true) }
            container.beaconListener.servers()
                .catch { error ->
                    _state.update {
                        it.copy(scanning = false, error = "falha na descoberta: ${error.message}")
                    }
                }
                .collect(::onServerFound)
        }
    }

    /** Para a escuta do beacon. */
    fun stopDiscovery() {
        discoveryJob?.cancel()
        discoveryJob = null
        _state.update { it.copy(scanning = false) }
    }

    /** Atualiza a lista de servidores com o beacon recebido. */
    private fun onServerFound(server: DiscoveredServer) {
        _state.update { current ->
            val now = System.currentTimeMillis()
            val updated = current.servers
                .filterNot { it.host == server.host }
                .plus(server)
                .filter { now - it.lastSeenMillis <= SERVER_TTL_MS }
                .sortedBy { it.name.lowercase() }

            current.copy(servers = updated)
        }
    }

    // ---------------------------------------------------------------- controle

    /** Conecta ao PC e inicia o handshake (`hello` → `welcome`). */
    fun connect(server: DiscoveredServer) {
        if (_state.value.phase != Phase.Idle) return

        viewModelScope.launch {
            _state.update {
                it.copy(phase = Phase.Connecting, server = server, error = null, stats = null)
            }

            val session = runCatching {
                container.controlClient.connect(server.host, server.ctrlPort).also {
                    it.send(
                        ControlMessage.Hello(
                            v = Protocol.VERSION,
                            token = server.code,
                            sampleRate = Protocol.SAMPLE_RATE,
                            channels = Protocol.CHANNELS,
                            codec = Protocol.CODEC_PCM16,
                            frameMs = Protocol.FRAME_MS,
                        )
                    )
                }
            }.getOrElse { error ->
                _state.update {
                    it.copy(
                        phase = Phase.Idle,
                        error = "falha ao conectar em ${server.host}: ${error.message}",
                    )
                }
                return@launch
            }

            controlSession = session
            container.settings.rememberServer(server.host, server.name)
            controlJob = viewModelScope.launch { consumeControlMessages(session) }
        }
    }

    /** Encerra a sessão de controle e o streaming. */
    fun disconnect() {
        viewModelScope.launch {
            runCatching { controlSession?.send(ControlMessage.Bye) }
            runCatching { controlSession?.close() }
            controlSession = null
            controlJob?.cancel()
            controlJob = null

            stopAudioService()

            _state.update {
                it.copy(
                    phase = Phase.Idle,
                    server = null,
                    sessionId = null,
                    codec = null,
                    stats = null,
                    audio = StreamingStatus(),
                    error = null,
                )
            }
        }
    }

    /** Processa as mensagens recebidas do PC. */
    private suspend fun consumeControlMessages(session: ControlSession) {
        session.messages.collect { message ->
            when (message) {
                is ControlMessage.Welcome -> {
                    _state.update {
                        it.copy(
                            phase = Phase.Connected,
                            sessionId = message.sessionId,
                            codec = message.codec,
                            error = null,
                        )
                    }
                    startAudioService(message.audioPort)
                }

                is ControlMessage.Stats -> _state.update { it.copy(stats = message) }

                is ControlMessage.Error -> _state.update {
                    it.copy(error = "${message.code}: ${message.message}")
                }

                else -> Unit
            }
        }

        // O fluxo terminou: o PC encerrou a conexão.
        stopAudioService()
        _state.update {
            it.copy(phase = Phase.Idle, error = "conexão encerrada pelo PC")
        }
    }

    /** Liga/desliga o mute (no PC e nos frames enviados). */
    fun toggleMute() {
        val muted = !_state.value.muted
        _state.update { it.copy(muted = muted) }
        audioBinder?.setMuted(muted)
        viewModelScope.launch {
            runCatching { controlSession?.send(ControlMessage.Mute(muted)) }
        }
    }

    /** Define o ganho de volume enviado ao PC (`[0.0, 4.0]`). */
    fun setVolume(volume: Float) {
        val clamped = volume.coerceIn(0f, 4f)
        _state.update { it.copy(volume = clamped) }
        viewModelScope.launch {
            runCatching { controlSession?.send(ControlMessage.Volume(clamped)) }
            container.settings.setVolume(clamped)
        }
    }

    /** Limpa a mensagem de erro exibida. */
    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    // ------------------------------------------------------------------ áudio

    /** Sobe o serviço de foreground e liga o streaming de áudio. */
    private fun startAudioService(audioPort: Int) {
        val context = getApplication<Application>()
        val server = _state.value.server ?: return

        val intent = Intent(context, AudioCaptureService::class.java).apply {
            putExtra(AudioCaptureService.EXTRA_HOST, server.host)
            putExtra(AudioCaptureService.EXTRA_AUDIO_PORT, audioPort)
        }

        ContextCompat.startForegroundService(context, intent)

        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                val binder = service as? AudioCaptureService.LocalBinder ?: return
                audioBinder = binder
                binder.setMuted(_state.value.muted)

                audioJob = viewModelScope.launch {
                    binder.status.collect { status ->
                        _state.update { current ->
                            current.copy(
                                audio = status,
                                phase = if (status.active) Phase.Streaming else current.phase,
                            )
                        }
                    }
                }
            }

            override fun onServiceDisconnected(name: ComponentName?) {
                audioBinder = null
                audioJob?.cancel()
                audioJob = null
            }
        }

        serviceConnection = connection
        context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    /** Desliga o serviço de foreground e o streaming de áudio. */
    private fun stopAudioService() {
        val context = getApplication<Application>()

        audioJob?.cancel()
        audioJob = null
        audioBinder = null

        serviceConnection?.let { connection ->
            runCatching { context.unbindService(connection) }
        }
        serviceConnection = null

        val intent = Intent(context, AudioCaptureService::class.java)
            .setAction(AudioCaptureService.ACTION_STOP)
        runCatching { context.startService(intent) }
    }

    override fun onCleared() {
        stopDiscovery()
        controlJob?.cancel()
        runCatching { container.controlClient.close() }
        super.onCleared()
    }

    private companion object {
        /** Tempo de vida de um servidor sem beacon (ms). */
        const val SERVER_TTL_MS = 5_000L
    }
}
