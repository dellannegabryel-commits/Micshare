package com.micshare.app.viewmodel

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.SelectBuilder
import kotlinx.coroutines.selects.onReceive
import kotlinx.coroutines.selects.select
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class MainViewModel : ViewModel() {

    // Discovery
    private val discoverySocket: DatagramSocket? = try {
        DatagramSocket(41234).apply {
            setBroadcast(true)
            setSoTimeout(1000)
        }
    } catch (e: Exception) {
        Log.e("Micshare", "Failed to create discovery socket", e)
        null
    }

    // Control (WebSocket) - using OkHttp
    private val httpClient = okhttp3.OkHttpClient.Builder().build()
    private var webSocket: okhttp3.WebSocket? = null

    // Audio streaming
    private val audioSocket: DatagramSocket? = try {
        DatagramSocket()
    } catch (e: Exception) {
        Log.e("Micshare", "Failed to create audio socket", e)
        null
    }

    // State
    val serverState = MutableStateFlow(ServerState.Idle)
    val discoveredServers = MutableStateFlow<List<DiscoveredServer>>(emptyList())
    val selectedServer = MutableStateFlow<DiscoveredServer?>(null)
    val pairingCode = MutableStateFlow("")
    val isStreaming = MutableStateFlow(false)
    val audioLevel = MutableStateFlow(0f)
    val errorMessage = MutableStateFlow("")

    // Audio capture
    private var audioRecord: android.media.AudioRecord? = null
    private var isCapturing = false

    fun startDiscovery() {
        serverState.update { ServerState.Discovering }
        discoveredServers.update { emptyList() }
        viewModelScope.launch {
            while (serverState.value == ServerState.Discovering) {
                listenForBeacons()
            }
        }
    }

    private fun listenForBeacons() {
        val buffer = ByteArray(1024)
        val packet = DatagramPacket(buffer, buffer.size)
        try {
            discoverySocket?.receive(packet)
            val data = packet.data.copyOfRange(0, packet.length)
            val beacon = parseBeacon(data, packet.address.hostAddress)
            if (beacon != null) {
                discoveredServers.update { current ->
                    if (current.none { it.ip == beacon.ip }) {
                        current + beacon
                    } else {
                        current
                    }
                }
                serverState.update { ServerState.Found }
            }
        } catch (e: java.io.InterruptedIOException) {
            // Timeout - continue listening
        } catch (e: Exception) {
            Log.e("Micshare", "Discovery error", e)
        }
    }

    private fun parseBeacon(data: ByteArray, ip: String): DiscoveredServer? {
        // Beacon format: "MICSHARE_BEACON|<name>|<audio_port>|<control_port>|<pairing_code>"
        val str = String(data).trim()
        if (!str.startsWith("MICSHARE_BEACON|")) return null
        val parts = str.split("|")
        if (parts.size < 5) return null
        return DiscoveredServer(
            name = parts[1],
            ip = ip,
            port = parts[2].toIntOrNull() ?: 41235,
            pairingPort = parts[3].toIntOrNull() ?: 41236
        )
    }

    fun selectServer(server: DiscoveredServer) {
        selectedServer.update { server }
        serverState.update { ServerState.Pairing }
    }

    fun updatePairingCode(code: String) {
        pairingCode.update { code.filter { it.isDigit() }.take(6) }
    }

    fun confirmPairing() {
        val server = selectedServer.value ?: return
        val code = pairingCode.value
        if (code.length != 6) return

        connectToServer(server, code)
    }

    private fun connectToServer(server: DiscoveredServer, code: String) {
        viewModelScope.launch {
            val url = "ws://${server.ip}:${server.pairingPort}/ws?code=$code"
            val request = okhttp3.Request.Builder().url(url).build()

            webSocket = httpClient.newWebSocket(request, object : okhttp3.WebSocketListener() {
                override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                    Log.d("Micshare", "WebSocket connected")
                    // Send hello message
                    val hello = """{"t":"hello","version":1,"code":"$code"}"""
                    webSocket.send(hello)
                }

                override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                    handleControlMessage(text)
                }

                override fun onMessage(webSocket: okhttp3.WebSocket, bytes: okio.ByteString) {
                    // Binary messages if needed
                }

                override fun onClosing(webSocket: okhttp3.WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                    serverState.update { ServerState.Error }
                    errorMessage.update { "Conexão fechada: $reason" }
                }

                override fun onFailure(webSocket: okhttp3.WebSocket, t: Throwable, response: okhttp3.Response?) {
                    Log.e("Micshare", "WebSocket failure", t)
                    serverState.update { ServerState.Error }
                    errorMessage.update { "Falha na conexão: ${t.message}" }
                }
            })
        }
    }

    private fun handleControlMessage(text: String) {
        try {
            val json = kotlinx.serialization.json.Json.decodeFromString<ControlMessage>(text)
            when (json.t) {
                "hello" -> {
                    if (json.status == "ok") {
                        serverState.update { ServerState.Connected }
                        startAudioStream()
                    } else {
                        serverState.update { ServerState.Error }
                        errorMessage.update { json.message ?: "Emparelhamento falhou" }
                    }
                }
                "audio_config" -> {
                    // Configure audio based on server response
                }
                "stop" -> {
                    stopAudioStream()
                    serverState.update { ServerState.Connected }
                }
            }
        } catch (e: Exception) {
            Log.e("Micshare", "Failed to parse control message", e)
        }
    }

    private fun startAudioStream() {
        val server = selectedServer.value ?: return
        isStreaming.update { true }
        serverState.update { ServerState.Streaming }

        viewModelScope.launch {
            // Initialize AudioRecord
            val minBufferSize = android.media.AudioRecord.getMinBufferSize(
                48000,
                android.media.AudioFormat.CHANNEL_IN_MONO,
                android.media.AudioFormat.ENCODING_PCM_16BIT
            )
            audioRecord = android.media.AudioRecord(
                android.media.MediaRecorder.AudioSource.MIC,
                48000,
                android.media.AudioFormat.CHANNEL_IN_MONO,
                android.media.AudioFormat.ENCODING_PCM_16BIT,
                minBufferSize * 4
            )

            audioRecord?.startRecording()
            isCapturing = true

            val buffer = ShortArray(480) // 10ms at 48kHz mono
            val seq = java.util.concurrent.atomic.AtomicInteger(0)

            while (isCapturing && isStreaming.value) {
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                if (read > 0) {
                    // Calculate audio level
                    var sum = 0L
                    for (i in 0 until read) {
                        sum += (buffer[i].toLong() * buffer[i].toLong())
                    }
                    val rms = kotlin.math.sqrt(sum.toDouble() / read)
                    audioLevel.update { (rms / 32768.0).toFloat() }

                    // Send audio frame via UDP
                    sendAudioFrame(buffer, read, seq.getAndIncrement(), server.ip, server.port)
                }
            }
        }
    }

    private fun sendAudioFrame(buffer: ShortArray, length: Int, seq: Int, ip: String, port: Int) {
        try {
            val header = ByteBuffer.allocate(16).apply {
                order(ByteOrder.BIG_ENDIAN)
                putInt(0x4D435348) // Magic "MCSH"
                putShort(1) // Version
                putShort(0) // Flags
                putInt(seq) // Sequence
                putInt(System.currentTimeMillis().toInt()) // Capture timestamp
                putShort(length * 2) // Payload length in bytes
                put(1) // Channels
                put(0) // Codec (0 = PCM)
            }.array()

            val payload = ByteBuffer.allocate(length * 2).apply {
                order(ByteOrder.LITTLE_ENDIAN)
                buffer.forEachIndexed { i, s ->
                    if (i < length) putShort(s)
                }
            }.array()

            val packetData = header + payload
            val packet = DatagramPacket(packetData, packetData.size, InetAddress.getByName(ip), port)
            audioSocket?.send(packet)
        } catch (e: Exception) {
            Log.e("Micshare", "Failed to send audio frame", e)
        }
    }

    fun toggleStreaming() {
        if (isStreaming.value) {
            stopAudioStream()
            sendControlMessage("""{"t":"stop"}""")
            serverState.update { ServerState.Connected }
        } else {
            startAudioStream()
            sendControlMessage("""{"t":"start"}""")
        }
    }

    private fun stopAudioStream() {
        isCapturing = false
        isStreaming.update { false }
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
    }

    private fun sendControlMessage(message: String) {
        webSocket?.send(message)
    }

    fun disconnect() {
        stopAudioStream()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        discoveredServers.update { emptyList() }
        selectedServer.update { null }
        pairingCode.update { "" }
        serverState.update { ServerState.Idle }
        errorMessage.update { "" }
    }

    override fun onCleared() {
        super.onCleared()
        disconnect()
        discoverySocket?.close()
        audioSocket?.close()
    }
}

enum class ServerState {
    Idle,
    Discovering,
    Found,
    Pairing,
    Connected,
    Streaming,
    Error
}

data class DiscoveredServer(
    val name: String,
    val ip: String,
    val port: Int,
    val pairingPort: Int
)

@kotlinx.serialization.Serializable
data class ControlMessage(
    val t: String,
    val status: String? = null,
    val message: String? = null,
    val version: Int? = null,
    val code: String? = null
)