package com.micshare.audio

/**
 * Throttle de publicação do status do streaming.
 *
 * O `StateFlow` do serviço é observado pelo Compose: cada emissão vira uma
 * recomposição. Publicar a 100 Hz (1 frame = 10 ms) é desperdício — 2 Hz
 * basta para o painel.
 */
class StatusThrottle(private val minIntervalMs: Long = DEFAULT_INTERVAL_MS) {

    /** Momento (ms) da última publicação; `null` = nunca publicou. */
    private var lastPublishMs: Long? = null

    /**
     * `true` se pode publicar agora.
     *
     * A primeira chamada só marca a janela de origem (não publica): publicar
     * no instante zero daria uma taxa de quadros calculada sobre ~0 ms.
     *
     * @param nowMs relógio monotônico atual (ms).
     */
    fun shouldPublish(nowMs: Long): Boolean {
        val last = lastPublishMs
        if (last == null) {
            lastPublishMs = nowMs
            return false
        }
        if (nowMs - last < minIntervalMs) return false
        lastPublishMs = nowMs
        return true
    }

    companion object {
        /** Intervalo mínimo entre publicações (2 Hz). */
        const val DEFAULT_INTERVAL_MS: Long = 500L
    }
}
