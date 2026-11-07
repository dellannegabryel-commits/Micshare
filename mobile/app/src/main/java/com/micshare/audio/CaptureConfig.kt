package com.micshare.audio

import com.micshare.protocol.Protocol

/**
 * Parâmetros de captura do `AudioRecord` (cálculos puros, sem Android).
 *
 * O tamanho do buffer do `AudioRecord` é o **mínimo do dispositivo**: um
 * FIFO maior (4 frames) só adiciona latência que nunca sai. O piso de um
 * frame existe para que uma leitura parcial ainda tenha onde caber.
 */
object CaptureConfig {

    /** Bytes por amostra (PCM s16le). */
    const val BYTES_PER_SAMPLE = 2

    /**
     * Tamanho do buffer do `AudioRecord` em bytes.
     *
     * @param deviceMinBufferBytes `AudioRecord.getMinBufferSize(...)`.
     * @param frameSamples amostras por frame (480 = 10 ms a 48 kHz mono).
     */
    fun bufferSizeInBytes(deviceMinBufferBytes: Int, frameSamples: Int = Protocol.FRAME_SAMPLES): Int =
        maxOf(deviceMinBufferBytes, frameSamples * BYTES_PER_SAMPLE)
}
