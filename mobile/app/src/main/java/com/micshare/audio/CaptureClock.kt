package com.micshare.audio

import android.os.SystemClock

/**
 * Relógio da captura.
 *
 * `SystemClock.elapsedRealtime()` é monotônico desde o boot (ao contrário de
 * `currentTimeMillis()`, que o NTP move para trás). O guard aqui é a rede de
 * segurança: um valor que voltoucia nunca vira `capture_ts` — o PC calcula
 * latência a partir dele.
 *
 * O `capture_ts` vai no wire em u32 (wrap em ~49,7 dias). O wrap é tratado
 * pelo PC (aritmética de wrap), então aqui só truncamos.
 */
class CaptureClock(private val source: () -> Long = { SystemClock.elapsedRealtime() }) {

    /** Último valor emitido (domínio de 64 bits). */
    private var last: Long = Long.MIN_VALUE

    /** Timestamp atual em ms (monotônico, nunca volta). */
    fun nowMs(): Long {
        val raw = source()
        val value = if (raw > last) raw else last + 1
        last = value
        return value
    }

    /** Timestamp atual no domínio u32 do wire (`capture_ts`). */
    fun captureTs(): Long = nowMs() and 0xFFFFFFFFL
}
