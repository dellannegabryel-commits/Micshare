package com.micshare.audio

/**
 * Efeitos de áudio que o app pode aplicar via `android.media.audiofx`.
 *
 * Cada efeito é um objeto ligado à sessão de áudio do `AudioRecord`:
 * AEC (cancelamento de eco), NS (supressão de ruído) e AGC (ganho automático).
 */
enum class AudioEffect {
    /** Cancelamento de eco acústico. */
    AEC,

    /** Supressão de ruído. */
    NS,

    /** Controle automático de ganho. */
    AGC,
}

/**
 * Plano de captura: fonte de áudio + efeitos que o app aplica.
 *
 * A fonte importa porque o **HAL** (hardware) já faz AEC/NS/AGC em algumas
 * delas: aplicar os efeitos do app por cima seria processamento duplo (e
 * artefatos). Regras:
 *
 * | Fonte                 | AEC/NS/AGC do HAL | efeitos do app        |
 * |-----------------------|-------------------|-----------------------|
 * | `MIC`                 | não               | os que existirem      |
 * | `VOICE_COMMUNICATION` | sim               | **nenhum**            |
 * | `UNPROCESSED`         | não               | **nenhum** (raw)      |
 *
 * Qualquer outra fonte (inclusive `VOICE_RECOGNITION`) cai para `MIC`.
 */
data class AudioSourcePlan(
    /** Fonte efetiva do `AudioRecord` (`MediaRecorder.AudioSource`). */
    val source: Int,
    /** Efeitos que o app deve aplicar. */
    val effects: Set<AudioEffect>,
)

/**
 * Decide fonte + efeitos (função pura, testável em JVM).
 */
object AudioSourcePlanner {

    /** `MediaRecorder.AudioSource.MIC`. */
    const val SOURCE_MIC = 1

    /** `MediaRecorder.AudioSource.VOICE_COMMUNICATION`. */
    const val SOURCE_VOICE_COMMUNICATION = 7

    /** `MediaRecorder.AudioSource.VOICE_RECOGNITION` (rejeitada → `MIC`). */
    const val SOURCE_VOICE_RECOGNITION = 8

    /** `MediaRecorder.AudioSource.UNPROCESSED` (API 24+). */
    const val SOURCE_UNPROCESSED = 9

    /** Primeira API que aceita `UNPROCESSED`. */
    const val API_UNPROCESSED = 24

    /**
     * Plano para a fonte pedida.
     *
     * @param source fonte pedida (`MediaRecorder.AudioSource.*`).
     * @param available efeitos que o aparelho suporta **e** que o usuário
     *   habilitou (o AGC fica de fora por padrão: briga com o slider de
     *   volume).
     */
    fun planFor(source: Int, available: Set<AudioEffect>): AudioSourcePlan = when (source) {
        // O HAL já faz AEC/NS/AGC: aplicar o app em cima = duplo processamento.
        SOURCE_VOICE_COMMUNICATION -> AudioSourcePlan(source, emptySet())

        // Raw: nenhum efeito, nem do app.
        SOURCE_UNPROCESSED -> AudioSourcePlan(source, emptySet())

        // `MIC` e qualquer fonte desconhecida (ex.: VOICE_RECOGNITION).
        else -> AudioSourcePlan(SOURCE_MIC, available)
    }

    /**
     * Fontes que o aparelho suporta.
     *
     * `UNPROCESSED` só existe a partir da API 24 — antes disso o
     * `AudioRecord` rejeita a fonte.
     *
     * @param sdkInt `Build.VERSION.SDK_INT` do aparelho.
     */
    fun availableSources(sdkInt: Int): List<Int> = buildList {
        add(SOURCE_MIC)
        add(SOURCE_VOICE_COMMUNICATION)
        if (sdkInt >= API_UNPROCESSED) add(SOURCE_UNPROCESSED)
    }

    /** Rótulo da fonte (UI). */
    fun label(source: Int): String = when (source) {
        SOURCE_MIC -> "Padrão (com AEC/NS)"
        SOURCE_VOICE_COMMUNICATION -> "Modo voz (tratado pelo aparelho)"
        SOURCE_UNPROCESSED -> "Sem processamento (raw)"
        else -> "Padrão (com AEC/NS)"
    }
}
