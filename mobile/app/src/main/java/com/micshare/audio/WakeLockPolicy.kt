package com.micshare.audio

/**
 * Política do WakeLock do streaming.
 *
 * O `PARTIAL_WAKE_LOCK` expira por timeout: sem renovação, o Android entra
 * em Doze no meio da sessão e o `AudioRecord` pode ser suspenso (o áudio
 * morre sem erro visível). A renovação precisa acontecer **antes** do
 * timeout — daí a invariante `RENEWAL_INTERVAL_MS < LOCK_TIMEOUT_MS`.
 */
object WakeLockPolicy {

    /** Timeout do WakeLock (10 min). */
    const val LOCK_TIMEOUT_MS: Long = 10 * 60 * 1000L

    /** Intervalo de renovação (4 min) — menor que o timeout. */
    const val RENEWAL_INTERVAL_MS: Long = 4 * 60 * 1000L
}
