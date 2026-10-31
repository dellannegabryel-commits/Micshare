package com.micshare.protocol

/**
 * Constantes do protocolo — espelham `packages/pc-ui/src-tauri/src/protocol/`.
 *
 * O PC é o servidor; o celular é o cliente:
 * - Descoberta: UDP 41234 (beacon JSON do PC, escutado pelo celular)
 * - Controle:   WebSocket 41236 (JSON, handshake `hello` → `welcome`)
 * - Áudio:      UDP 41235 (header binário Big-Endian de 16 bytes + PCM s16le)
 */
object Protocol {
    /** Porta do beacon UDP de descoberta. */
    const val DISCOVERY_PORT = 41234

    /** Porta do servidor UDP de áudio. */
    const val AUDIO_PORT = 41235

    /** Porta do servidor WebSocket de controle. */
    const val CONTROL_PORT = 41236

    /** Taxa de amostragem do pipeline de áudio. */
    const val SAMPLE_RATE = 48000

    /** Canais do áudio (mono). */
    const val CHANNELS = 1

    /** Duração do frame de áudio em ms. */
    const val FRAME_MS = 10

    /** Amostras por frame (480 = 10 ms a 48 kHz mono). */
    const val FRAME_SAMPLES = 480

    /** Codec PCM 16-bit little-endian. */
    const val CODEC_PCM16 = "pcm16"

    /** Codec Opus (Fase 2). */
    const val CODEC_OPUS = "opus"

    /** Versão do protocolo. */
    const val VERSION = 1
}
