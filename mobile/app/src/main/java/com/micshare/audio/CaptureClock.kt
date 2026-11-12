package com.micshare.audio

import android.os.SystemClock

/**
 * Relógio da captura com grade fixa de frames.
 *
 * Em vez de carimbar "agora ao completar" (jitter de leitura/agendamento),
 * ancora no primeiro frame e avança em passos de [frameMs]: `capture_ts`
 * representa o início lógico do bloco, estável mesmo com leituras parciais.
 *
 * `SystemClock.elapsedRealtime()` é monotônico (não anda para trás com NTP).
 * O `capture_ts` vai no wire em u32 (wrap em ~49,7 dias).
 */
class CaptureClock(
    private val frameMs: Long = 10L,
    private val source: () -> Long = { SystemClock.elapsedRealtime() },
) {
    /** Base monotônica (ms) do frame 0. */
    private var baseMs: Long? = null

    /** Índice do próximo frame na grade. */
    private var index: Long = 0

    /** Último valor emitido (guard monotônico). */
    private var last: Long = Long.MIN_VALUE

    /**
     * Timestamp do próximo frame (ms, monotônico). Avança a grade em 1 frame.
     */
    fun nextFrameMs(): Long {
        val now = source()
        if (baseMs == null) baseMs = now
        val ideal = (baseMs ?: now) + index * frameMs
        index += 1
        // Se captura atrasou muito, não deixa ts cair longe do "agora".
        val raw = if (ideal + frameMs < now) now else ideal
        val value = if (raw > last) raw else last + 1
        last = value
        return value
    }

    /** Timestamp do próximo frame no domínio u32 do wire (`capture_ts`). */
    fun captureTs(): Long = nextFrameMs() and 0xFFFFFFFFL
}
