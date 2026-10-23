package com.micshare.protocol

object ProtocolConstants {
    const val MAGIC: Int = 0x4D53      // "MS"
    const val VERSION: Int = 1
    const val AUDIO_PORT: Int = 41235
    const val BEACON_PORT: Int = 41234
    const val CTRL_PORT: Int = 41236
    const val HEADER_SIZE: Int = 16
    const val MAX_PAYLOAD_LEN: Int = 1472 - HEADER_SIZE
    const val FLAG_SILENCE: Int = 0x01
    const val FLAG_MUTED: Int = 0x02
    const val CODEC_PCM_S16LE: Int = 0
    const val CODEC_OPUS: Int = 1
    const val SAMPLE_RATE: Int = 48000
    const val FRAME_MS: Int = 10
    const val SAMPLES_PER_FRAME: Int = 480
    const val PCM_BYTES_PER_FRAME: Int = 960
    const val WS_MAX_MESSAGE_BYTES: Int = 1024
}