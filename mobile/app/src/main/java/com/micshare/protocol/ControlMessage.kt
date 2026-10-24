package com.micshare.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonClassDiscriminator

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("t")
sealed class CtrlMessage {

    @Serializable
    @SerialName("hello")
    data class Hello(
        val v: Int,
        val token: String,
        val sampleRate: Int,
        val channels: Int,
        val codec: String,
        val frameMs: Int
    ) : CtrlMessage()

    @Serializable
    @SerialName("welcome")
    data class Welcome(
        val sessionId: String,
        val audioPort: Int,
        val targetBufferMs: Int
    ) : CtrlMessage()

    @Serializable
    @SerialName("mute")
    data class Mute(
        val value: Boolean
    ) : CtrlMessage()

    @Serializable
    @SerialName("volume")
    data class Volume(
        val value: Double
    ) : CtrlMessage()

    @Serializable
    @SerialName("bye")
    class Bye : CtrlMessage()

    @Serializable
    @SerialName("stats")
    data class Stats(
        val lossPct: Double,
        val bufferMs: Int,
        val seqGaps: Int,
        val reconnects: Int
    ) : CtrlMessage()

    @Serializable
    @SerialName("error")
    data class ErrorMsg(
        val code: String,
        val message: String
    ) : CtrlMessage()

    companion object {
        @OptIn(ExperimentalSerializationApi::class)
        private val json = Json {
            ignoreUnknownKeys = true
            classDiscriminator = "t"
            isLenient = true
        }

        fun parse(text: String): CtrlMessage? = try {
            json.decodeFromString<CtrlMessage>(text)
        } catch (e: Exception) {
            println("[ControlMessage] parse error: ${e.message} for input: $text")
            null
        }

        fun encode(message: CtrlMessage): String = try {
            json.encodeToString(message)
        } catch (e: Exception) {
            println("[ControlMessage] encode error: ${e.message}")
            ""
        }
    }
}