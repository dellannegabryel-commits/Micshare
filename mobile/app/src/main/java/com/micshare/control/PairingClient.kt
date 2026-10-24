package com.micshare.control

import com.micshare.protocol.CtrlMessage
import kotlinx.coroutines.*
import okhttp3.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume

data class PairingResult(
    val success: Boolean,
    val sessionId: String? = null,
    val error: String? = null
)

class PairingClient(
    private val ip: String,
    private val ctrlPort: Int
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .pingInterval(10, TimeUnit.SECONDS)
        .build()

    suspend fun connect(token: String): PairingResult = suspendCancellableCoroutine { continuation ->
        val url = "ws://$ip:$ctrlPort"
        println("[PairingClient] Connecting to $url")
        val request = Request.Builder().url(url).build()
        val webSocketRef = AtomicReference<WebSocket?>(null)

        val timeoutJob = CoroutineScope(Dispatchers.IO).launch {
            delay(15000) // 15s timeout
            if (continuation.isActive) {
                println("[PairingClient] Connection timeout (15s) to $url")
                webSocketRef.get()?.close(1000, "timeout")
                continuation.resume(PairingResult(false, error = "Timeout (15s) para $url. Verifique IP e rede."))
            }
        }

        continuation.invokeOnCancellation {
            timeoutJob.cancel()
            webSocketRef.get()?.close(1000, "cancelled")
        }

        val ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                println("[PairingClient] WebSocket opened to $url")
                val hello = CtrlMessage.Hello(
                    v = 1,
                    token = token,
                    sampleRate = 48000,
                    channels = 1,
                    codec = "pcm16",
                    frameMs = 10
                )
                webSocket.send(CtrlMessage.encode(hello))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                println("[PairingClient] Received message: $text")
                val message = CtrlMessage.parse(text)
                message?.let {
                    when (it) {
                        is CtrlMessage.Welcome -> {
                            timeoutJob.cancel()
                            if (continuation.isActive) {
                                continuation.resume(PairingResult(true, it.sessionId))
                            }
                            webSocket.close(1000, "paired")
                        }
                        is CtrlMessage.ErrorMsg -> {
                            timeoutJob.cancel()
                            if (continuation.isActive) {
                                continuation.resume(PairingResult(false, error = it.message))
                            }
                            webSocket.close(1000, "error")
                        }
                        else -> {}
                    }
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                println("[PairingClient] WebSocket failure: ${t.javaClass.simpleName} - ${t.message}")
                timeoutJob.cancel()
                if (continuation.isActive) {
                    val errorDesc = "${t.javaClass.simpleName}: ${t.message ?: "Conexão recusada"}"
                    continuation.resume(PairingResult(false, error = errorDesc))
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                println("[PairingClient] WebSocket closed: $code / $reason")
            }
        })
        webSocketRef.set(ws)
    }
}