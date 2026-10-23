package com.micshare.protocol

import kotlinx.serialization.Serializable
import java.nio.ByteBuffer
import java.nio.ByteOrder

@Serializable
data class AudioFrameHeader(
    val seq: Int,           // u32, monotonic per session
    val captureTs: Int,     // u32 ms, mobile monotonic clock
    val flags: Int,         // bit0 SILENCE, bit1 MUTED
    val payloadLen: Int,    // u16
    val channels: Int,      // 1
    val codec: Int          // 0 PCM s16le, 1 Opus
)

@Serializable
data class AudioFrameData(
    val header: AudioFrameHeader,
    val payload: ByteArray
)

@Serializable
data class DecodedFrame(
    val header: AudioFrameHeader,
    val payload: ByteArray,
    val offset: Int
)

object AudioFrame {
    private const val MAGIC = 0x4D53
    private const val VERSION = 1
    private const val HEADER_SIZE = 16
    private const val MAX_PAYLOAD_LEN = 1472 - HEADER_SIZE
    private const val FLAG_SILENCE = 0x01
    private const val FLAG_MUTED = 0x02

    fun encode(frame: AudioFrameData): ByteArray {
        val header = frame.header
        val payload = frame.payload

        require(payload.size == header.payloadLen) { "payload.length ${payload.size} !== declared payloadLen ${header.payloadLen}" }
        require(header.payloadLen <= MAX_PAYLOAD_LEN) { "payloadLen ${header.payloadLen} exceeds max $MAX_PAYLOAD_LEN" }
        require(header.channels == 1) { "only mono supported, got ${header.channels} channels" }
        require(header.codec == 0 || header.codec == 1) { "codec ${header.codec} não suportado" }

        val buf = ByteBuffer.allocate(HEADER_SIZE + header.payloadLen).order(ByteOrder.BIG_ENDIAN)
        buf.putShort(MAGIC.toShort())
        buf.put(VERSION.toByte())
        buf.put(header.flags.toByte())
        buf.putInt(header.seq)
        buf.putInt(header.captureTs)
        buf.putShort(header.payloadLen.toShort())
        buf.put(header.channels.toByte())
        buf.put(header.codec.toByte())
        buf.put(payload)
        return buf.array()
    }

    fun decode(buf: ByteArray): DecodedFrame? {
        if (buf.size < HEADER_SIZE) return null
        val bb = ByteBuffer.wrap(buf).order(ByteOrder.BIG_ENDIAN)
        if (bb.getShort() != MAGIC.toShort()) return null
        if (bb.get() != VERSION.toByte()) return null

        val flags = bb.get().toInt()
        val seq = bb.getInt()
        val captureTs = bb.getInt()
        val payloadLen = bb.getShort().toInt()
        val channels = bb.get().toInt()
        val codec = bb.get().toInt()

        if (payloadLen > MAX_PAYLOAD_LEN) return null
        if (channels != 1) return null
        if (codec != 0 && codec != 1) return null
        if (buf.size < HEADER_SIZE + payloadLen) return null

        val payload = ByteArray(payloadLen)
        bb.get(payload)
        val header = AudioFrameHeader(seq, captureTs, flags, payloadLen, channels, codec)
        return DecodedFrame(header, payload, HEADER_SIZE + payloadLen)
    }

    fun isMuteFlag(flags: Int): Boolean = (flags and FLAG_MUTED) != 0
    fun isSilenceFlag(flags: Int): Boolean = (flags and FLAG_SILENCE) != 0
}