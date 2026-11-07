package com.micshare.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

/**
 * Mensagens do canal de controle (WebSocket, JSON).
 *
 * O discriminador é `t`, igual ao `serde(tag = "t")` do servidor Rust.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("t")
sealed interface ControlMessage {

    /** Abertura de sessão, enviada logo após o handshake WebSocket. */
    @Serializable
    @SerialName("hello")
    data class Hello(
        val v: Int,
        val token: String,
        val sampleRate: Int,
        val channels: Int,
        val codec: String,
        val frameMs: Int,
    ) : ControlMessage

    /** Resposta do servidor aceitando a sessão. */
    @Serializable
    @SerialName("welcome")
    data class Welcome(
        val sessionId: String,
        val audioPort: Int,
        val targetBufferMs: Int,
        val codec: String,
    ) : ControlMessage

    /** Liga/desliga o mute no servidor. */
    @Serializable
    @SerialName("mute")
    data class Mute(val value: Boolean) : ControlMessage

    /** Define o ganho de volume (o servidor clampa em `[0.0, 4.0]`). */
    @Serializable
    @SerialName("volume")
    data class Volume(val value: Float) : ControlMessage

    /** Encerramento gracioso da sessão. */
    @Serializable
    @SerialName("bye")
    object Bye : ControlMessage

    /** Sondagem de latência (celular → PC). */
    @Serializable
    @SerialName("ping")
    data class Ping(
        /** Identificador do ping (eco). */
        val id: Int,
        /** Timestamp de origem no relógio do celular (ms). */
        val t0Ms: Double,
        /** Offset entre o relógio do celular e o do PC (ms), medido no ping
         *  anterior. `null` no primeiro ping. */
        val offsetMs: Double? = null,
    ) : ControlMessage

    /** Resposta do servidor à sondagem. */
    @Serializable
    @SerialName("pong")
    data class Pong(
        /** Identificador do ping (eco). */
        val id: Int,
        /** Timestamp de origem, ecoado. */
        val t0Ms: Double,
        /** Timestamp do servidor ao receber o ping (ms). */
        val t1Ms: Double,
    ) : ControlMessage

    /** Métricas de diagnóstico, enviadas a 1 Hz. */
    @Serializable
    @SerialName("stats")
    data class Stats(
        val lossPct: Float,
        val bufferMs: Int,
        val seqGaps: Int,
        val reconnects: Int,
        /** Latência de rede mediana (ms), medida pelo PC. */
        val latencyMs: Double = 0.0,
        /** Latência de rede p95 (ms), medida pelo PC. */
        val latencyP95Ms: Double = 0.0,
    ) : ControlMessage

    /** Erro do servidor. */
    @Serializable
    @SerialName("error")
    data class Error(val code: String, val message: String) : ControlMessage
}
