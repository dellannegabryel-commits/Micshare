package com.micshare.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Testes da sonda de latência.
 *
 * A sonda é pura (relógio injetado) para poder ser testada na JVM.
 */
class LatencyProbeTest {

    @Test
    fun primeiro_ping_nao_publica_offset() {
        val probe = LatencyProbe { 1_000.0 }

        val ping = probe.ping(1)

        assertEquals(1, ping.id)
        assertEquals(1_000.0, ping.t0Ms, 0.001)
        assertNull(ping.offsetMs)
    }

    @Test
    fun offset_cancela_o_deslocamento_entre_os_relogios() {
        var now = 1_000.0
        val probe = LatencyProbe { now }
        val ping = probe.ping(1)

        // O PC está 520 ms "à frente" e a resposta levou 20 ms.
        now = 1_020.0
        probe.onPong(ping.t0Ms, t1Ms = 1_520.0)

        assertEquals(20.0, probe.rttMs, 0.001)
        // offset = t1 - t0 - rtt/2 = 1520 - 1000 - 10
        assertEquals(510.0, probe.offsetMs ?: 0.0, 0.001)

        // O ping seguinte carrega o offset medido.
        assertEquals(510.0, probe.ping(2).offsetMs ?: 0.0, 0.001)
    }

    @Test
    fun rtt_negativo_nao_invalida_o_offset_anterior() {
        var now = 1_000.0
        val probe = LatencyProbe { now }
        val ping = probe.ping(1)

        now = 1_020.0
        probe.onPong(ping.t0Ms, t1Ms = 1_520.0)
        val offset = probe.offsetMs

        // Wrap do relógio u32 no meio da ida e volta: RTT negativo.
        now = 500.0
        probe.onPong(t0Ms = 900.0, t1Ms = 1_000.0)

        assertEquals(offset, probe.offsetMs)
    }
}
