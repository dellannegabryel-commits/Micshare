package com.micshare.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.SerialName

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("t")
sealed class CtrlMessage {
    abstract val type: String

    @Serializable
    data class Hello(
        @SerialName("t") override val type: String = "hello",
        val v: Int,
        val token: String,
        val sampleRate: Int,
        val channels: Int,
        val codec: String,
        val frameMs: Int
    ) : CtrlMessage()

    @Serializable
    data class Welcome(
        @SerialName("t") override val type: String = "welcome",
        val sessionId: String,
        val audioPort: Int,
        val targetBufferMs: Int
    ) : CtrlMessage()

    @Serializable
    data class Mute(
        @SerialName("t") override val type: String = "mute",
        val value: Boolean
    ) : CtrlMessage()

    @Serializable
    data class Volume(
        @SerialName("t") override val type: String = "volume",
        val value: Double
    ) : CtrlMessage()

    @Serializable
    data class Bye(
        @SerialName("t") override val type: String = "bye"
    ) : CtrlMessage()

    @Serializable
    data class Stats(
        @SerialName("t") override val type: String = "stats",
        val lossPct: Double,
        val bufferMs: Int,
        val seqGaps: Int,
        val reconnects: Int
    ) : CtrlMessage()

    @Serializable
    data class ErrorMsg(
        @SerialName("t") override val type: String = "error",
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
            println("[ControlMessage] parse error: ${e.message}")
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