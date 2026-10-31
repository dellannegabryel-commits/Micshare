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

    /** Métricas de diagnóstico, enviadas a 1 Hz. */
    @Serializable
    @SerialName("stats")
    data class Stats(
        val lossPct: Float,
        val bufferMs: Int,
        val seqGaps: Int,
        val reconnects: Int,
    ) : ControlMessage

    /** Erro do servidor. */
    @Serializable
    @SerialName("error")
    data class Error(val code: String, val message: String) : ControlMessage
}
