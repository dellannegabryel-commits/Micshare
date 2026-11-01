package com.micshare.network

import com.micshare.protocol.ControlMessage
import com.micshare.protocol.ProtocolJson
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/**
 * Cliente do canal de controle (WebSocket JSON) — o espelho Android do
 * `tokio-tungstenite` do servidor Rust.
 *
 * O handshake é: cliente envia `hello`, o PC responde `welcome`.
 */
class ControlClient(
    private val client: HttpClient = defaultClient(),
) {

    /**
     * Abre uma sessão de controle com o PC.
     *
     * @param host endereço IPv4 do PC.
     * @param port porta WebSocket (41236 por padrão).
     */
    suspend fun connect(host: String, port: Int): ControlSession {
        val session = client.webSocketSession(
            host = host,
            port = port,
            path = "/",
        )
        return ControlSession(session)
    }

    /** Fecha o cliente HTTP e as sessões abertas. */
    fun close() {
        client.close()
    }

    companion object {
        /**
         * Cliente HTTP compartilhado, com keepalive de 10 s.
         *
         * O ping evita que o Wi-Fi derrube a conexão ociosa e que o PC
         * descarte a sessão por inatividade.
         */
        fun defaultClient(): HttpClient = HttpClient(CIO) {
            install(WebSockets) {
                // Keepalive de 10 s: evita que o Wi-Fi derrube a conexão ociosa.
                pingInterval = 10_000
            }
        }
    }
}

/**
 * Sessão de controle com o PC.
 *
 * @property messages mensagens recebidas do PC (`welcome`, `stats`, `error`).
 */
class ControlSession internal constructor(
    private val session: DefaultClientWebSocketSession,
) {

    /** Fluxo de mensagens decodificadas recebidas do PC. */
    val messages: Flow<ControlMessage> = session.incoming
        .receiveAsFlow()
        .filterIsInstance<Frame.Text>()
        .map { it.readText() }
        .mapNotNull { text ->
            runCatching { ProtocolJson.decodeFromString<ControlMessage>(text) }.getOrNull()
        }

    /** Envia uma mensagem ao PC. */
    suspend fun send(message: ControlMessage) {
        // O serializer polimórfico é obrigatório: é ele que grava o
        // discriminador "t" no objeto JSON.
        val payload = ProtocolJson.encodeToString(ControlMessage.serializer(), message)
        session.send(Frame.Text(payload))
    }

    /** Encerra a sessão de controle. */
    suspend fun close() {
        session.close()
    }
}
