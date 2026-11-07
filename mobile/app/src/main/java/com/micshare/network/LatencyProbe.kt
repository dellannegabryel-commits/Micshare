package com.micshare.network

import com.micshare.protocol.ControlMessage

/**
 * Sonda de latência: mede o RTT com `ping`/`pong` e publica o **offset**
 * entre o relógio do celular e o do PC.
 *
 * O offset (`t1 - t0 - rtt/2`) traduz o `capture_ts` dos frames — que vem no
 * relógio do celular — para o relógio do PC, que é quem mede a latência de
 * rede. O erro da medida é da ordem de `rtt/2` (1–10 ms em LAN).
 *
 * O relógio usado é o **domínio do `capture_ts`** (u32, ms): o wrap de 49,7
 * dias do relógio do celular acontece junto com o do `capture_ts`, então os
 * dois se cancelam e o PC não precisa contar epochs.
 *
 * Classe pura (sem API do Android) para ser testável na JVM.
 */
class LatencyProbe(
    /** Relógio do celular em ms (mesmo domínio do `capture_ts`). */
    private val nowMs: () -> Double,
) {

    /** Último offset medido (ms). `null` enquanto nenhum `pong` chegou. */
    var offsetMs: Double? = null
        private set

    /** RTT da última medição (ms). */
    var rttMs: Double = 0.0
        private set

    /** Cria o ping a enviar ao PC (carrega o offset da medição anterior). */
    fun ping(id: Int): ControlMessage.Ping = ControlMessage.Ping(
        id = id,
        t0Ms = nowMs(),
        offsetMs = offsetMs,
    )

    /**
     * Processa o `pong` e recalcula o offset.
     *
     * Um RTT negativo (wrap do relógio u32 no meio da ida e volta) invalida a
     * medição: o offset anterior é mantido.
     */
    fun onPong(t0Ms: Double, t1Ms: Double) {
        val rtt = nowMs() - t0Ms
        if (rtt < 0.0) return
        rttMs = rtt
        offsetMs = t1Ms - t0Ms - rtt / 2.0
    }
}
