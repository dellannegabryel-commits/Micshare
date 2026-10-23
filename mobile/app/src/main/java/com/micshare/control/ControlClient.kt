package com.micshare.control

import com.micshare.protocol.CtrlMessage
import kotlinx.coroutines.*
import okhttp3.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.min

interface ControlCallbacks {
    fun onStats(lossPct: Double, bufferMs: Int, seqGaps: Int, reconnects: Int)
    fun onError(code: String, message: String)
    fun onClose()
}

class ControlClient(
    private val ip: String,
    private val ctrlPort: Int,
    private val sessionId: String? = null
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(10, TimeUnit.SECONDS)
        .build()
    private var ws: WebSocket? = null
    private var callbacks: ControlCallbacks? = null
    private var scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var reconnectJob: Job? = null
    private val shouldReconnect = AtomicBoolean(false)
    private val reconnectDelay = AtomicLong(250L)
    private val maxReconnectDelay = 5000L
    private val reconnects = AtomicInteger(0)

    fun connect(callbacks: ControlCallbacks): Boolean {
        this.callbacks = callbacks
        shouldReconnect.set(true)
        return doConnect()
    }

    private fun doConnect(): Boolean {
        if (!shouldReconnect.get()) return false
        
        // Close previous socket if still active
        ws?.close(1000, "reconnecting")
        ws = null

        val url = "ws://$ip:$ctrlPort"
        val request = Request.Builder().url(url).build()
        
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                println("[control] connected to $url")
                reconnectDelay.set(250)

                // Send Hello handshake with sessionId if available
                sessionId?.let { sid ->
                    if (sid.isNotBlank()) {
                        val hello = CtrlMessage.Hello(
                            v = 1,
                            token = sid,
                            sampleRate = 48000,
                            channels = 1,
                            codec = "pcm16",
                            frameMs = 10
                        )
                        webSocket.send(CtrlMessage.encode(hello))
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val message = CtrlMessage.parse(text)
                message?.let { handleMessage(it) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                println("[control] error: ${t.message}")
                if (shouldReconnect.get()) {
                    scheduleReconnect()
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                println("[control] closed")
                callbacks?.onClose()
                if (shouldReconnect.get()) {
                    scheduleReconnect()
                }
            }
        })
        return true
    }

    private fun handleMessage(message: CtrlMessage) {
        when (message) {
            is CtrlMessage.Stats -> {
                callbacks?.onStats(message.lossPct, message.bufferMs, message.seqGaps, reconnects.get())
            }
            is CtrlMessage.ErrorMsg -> {
                callbacks?.onError(message.code, message.message)
            }
            else -> {}
        }
    }

    private fun scheduleReconnect() {
        if (!shouldReconnect.get()) return
        reconnectJob?.cancel()
        reconnects.incrementAndGet()
        reconnectJob = scope.launch {
            delay(reconnectDelay.get())
            if (shouldReconnect.get()) {
                println("[control] reconnecting...")
                doConnect()
                reconnectDelay.updateAndGet { min(it * 2, maxReconnectDelay) }
            }
        }
    }

    fun sendMute(value: Boolean) {
        ws?.send(CtrlMessage.encode(CtrlMessage.Mute(value = value)))
    }

    fun sendVolume(value: Double) {
        val clamped = kotlin.math.max(0.0, kotlin.math.min(4.0, value))
        ws?.send(CtrlMessage.encode(CtrlMessage.Volume(value = clamped)))
    }

    fun sendBye() {
        ws?.send(CtrlMessage.encode(CtrlMessage.Bye()))
    }

    fun disconnect() {
        shouldReconnect.set(false)
        reconnectJob?.cancel()
        try {
            ws?.close(1000, "client disconnect")
        } catch (e: Exception) {
            println("[control] disconnect error: ${e.message}")
        }
        ws = null
        callbacks = null
    }

    fun isConnected(): Boolean = ws != null
}