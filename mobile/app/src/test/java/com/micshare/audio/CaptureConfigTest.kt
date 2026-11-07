package com.micshare.audio

import com.micshare.protocol.Protocol
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Testes do dimensionamento do buffer do `AudioRecord`.
 */
class CaptureConfigTest {

    @Test
    fun buffer_size_usa_o_minimo_do_dispositivo() {
        // Dispositivo pede menos que um frame → o frame vence (480 amostras).
        assertEquals(
            Protocol.FRAME_SAMPLES * 2,
            CaptureConfig.bufferSizeInBytes(480, frameSamples = Protocol.FRAME_SAMPLES),
        )

        // Dispositivo pede mais que um frame → o mínimo do dispositivo vence
        // (buffer maior só adicionaria latência que nunca sai).
        assertEquals(
            4_096,
            CaptureConfig.bufferSizeInBytes(4_096, frameSamples = Protocol.FRAME_SAMPLES),
        )
    }
}
