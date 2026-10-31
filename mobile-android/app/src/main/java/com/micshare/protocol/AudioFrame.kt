package com.micshare.protocol

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Header binário do frame de áudio — 16 bytes Big-Endian.
 *
 * | offset | size | campo            | notas                        |
 * |--------|------|------------------|------------------------------|
 * | 0      | 2    | `magic` `0x4D53` | descarta pacote de outra app |
 * | 2      | 1    | `version` `1`    |                              |
 * | 3      | 1    | `flags`          | bit0 = SILENCE, bit1 = MUTED |
 * | 4      | 4    | `seq` u32        | +1 por frame                 |
 * | 8      | 4    | `capture_ts` u32 | ms do relógio do celular     |
 * | 12     | 2    | `payload_len` u16| bytes do payload PCM          |
 * | 14     | 1    | `channels` `1`   |                              |
 * | 15     | 1    | `codec`          | 0 = PCM s16le, 1 = Opus      |
 *
 * O payload PCM é **little-endian**, enquanto o header é big-endian.
 */
object AudioFrame {

    /** Tamanho do header em bytes. */
    const val HEADER_LEN = 16

    /** Magic do protocolo ("MS"). */
    const val MAGIC = 0x4D53

    /** Versão atual do header. */
    const val VERSION = 1

    /** Codec PCM s16le. */
    const val CODEC_PCM16 = 0

    /** Codec Opus. */
    const val CODEC_OPUS = 1

    /** Frame marcado como silêncio (PLC). */
    const val FLAG_SILENCE = 0b0000_0001

    /** Frame enviado com o microfone mutado. */
    const val FLAG_MUTED = 0b0000_0010

    /**
     * Monta o datagrama: header Big-Endian + payload PCM little-endian.
     *
     * @param seq número de sequência monotônico da sessão.
     * @param captureTsMs timestamp de captura em milissegundos.
     * @param flags flags do frame (SILENCE/MUTED).
     * @param pcm amostras PCM s16le.
     */
    fun encode(seq: Int, captureTsMs: Long, flags: Int = 0, pcm: ShortArray): ByteArray {
        val payloadLen = pcm.size * 2

        val header = ByteBuffer.allocate(HEADER_LEN)
            .order(ByteOrder.BIG_ENDIAN)
            .putShort(MAGIC.toShort())
            .put(VERSION.toByte())
            .put(flags.toByte())
            .putInt(seq)
            .putInt(captureTsMs.toInt())
            .putShort(payloadLen.toShort())
            .put(Protocol.CHANNELS.toByte())
            .put(CODEC_PCM16.toByte())
            .array()

        val payload = ByteBuffer.allocate(payloadLen)
            .order(ByteOrder.LITTLE_ENDIAN)
        for (sample in pcm) {
            payload.putShort(sample)
        }

        return header + payload.array()
    }

    /**
     * Decodifica um datagrama recebido — usado nos testes de contrato.
     *
     * @throws IllegalArgumentException se o datagrama não for válido.
     */
    fun decode(datagram: ByteArray): DecodedFrame {
        require(datagram.size >= HEADER_LEN) { "datagrama menor que o header" }

        val buffer = ByteBuffer.wrap(datagram).order(ByteOrder.BIG_ENDIAN)
        val magic = buffer.short.toInt() and 0xFFFF
        require(magic == MAGIC) { "magic inválido" }

        val version = buffer.get().toInt()
        require(version == VERSION) { "versão não suportada" }

        val flags = buffer.get().toInt()
        val seq = buffer.int
        val captureTs = buffer.int.toLong() and 0xFFFFFFFFL
        val payloadLen = buffer.short.toInt() and 0xFFFF
        require(payloadLen in 1..MAX_PAYLOAD_LEN) { "payload_len fora da faixa" }
        require(datagram.size == HEADER_LEN + payloadLen) { "tamanho real difere de payload_len" }

        val channels = buffer.get().toInt()
        val codec = buffer.get().toInt()

        return DecodedFrame(
            flags = flags,
            seq = seq,
            captureTsMs = captureTs,
            payloadLen = payloadLen,
            channels = channels,
            codec = codec,
            payload = datagram.copyOfRange(HEADER_LEN, datagram.size),
        )
    }

    /** Payload máximo aceito (evita estouro de MTU). */
    const val MAX_PAYLOAD_LEN = 1472
}

/** Frame de áudio decodificado. */
data class DecodedFrame(
    val flags: Int,
    val seq: Int,
    val captureTsMs: Long,
    val payloadLen: Int,
    val channels: Int,
    val codec: Int,
    val payload: ByteArray,
) {
    override fun equals(other: Any?): Boolean =
        this === other || (
            other is DecodedFrame &&
                flags == other.flags &&
                seq == other.seq &&
                captureTsMs == other.captureTsMs &&
                payloadLen == other.payloadLen &&
                channels == other.channels &&
                codec == other.codec &&
                payload.contentEquals(other.payload)
            )

    override fun hashCode(): Int {
        var result = flags
        result = 31 * result + seq
        result = 31 * result + captureTsMs.hashCode()
        result = 31 * result + payloadLen
        result = 31 * result + channels
        result = 31 * result + codec
        result = 31 * result + payload.contentHashCode()
        return result
    }
}
