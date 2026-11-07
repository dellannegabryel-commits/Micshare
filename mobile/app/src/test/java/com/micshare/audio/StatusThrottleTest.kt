package com.micshare.audio

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes do throttle de publicação do status.
 */
class StatusThrottleTest {

    @Test
    fun status_publicado_no_maximo_a_cada_500ms() {
        val throttle = StatusThrottle()

        // A primeira chamada só abre a janela.
        assertFalse(throttle.shouldPublish(0))
        assertFalse(throttle.shouldPublish(499))
        assertTrue(throttle.shouldPublish(500))
        assertFalse(throttle.shouldPublish(999))
        assertTrue(throttle.shouldPublish(1_000))
    }
}
