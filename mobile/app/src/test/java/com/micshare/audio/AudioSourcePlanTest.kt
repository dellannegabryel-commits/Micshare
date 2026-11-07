package com.micshare.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes da matriz fonte × efeitos.
 *
 * A regra que importa: nunca aplicar efeito do app sobre uma fonte cujo HAL
 * já processa (duplo processamento = artefato) e nunca aplicar efeito em
 * raw.
 */
class AudioSourcePlanTest {

    @Test
    fun fonte_voice_communication_nao_ativa_efeitos() {
        val plan = AudioSourcePlanner.planFor(
            AudioSourcePlanner.SOURCE_VOICE_COMMUNICATION,
            setOf(AudioEffect.AEC, AudioEffect.NS, AudioEffect.AGC),
        )

        assertEquals(AudioSourcePlanner.SOURCE_VOICE_COMMUNICATION, plan.source)
        assertTrue(plan.effects.isEmpty())
    }

    @Test
    fun fonte_mic_ativa_somente_os_efeitos_disponiveis() {
        val plan = AudioSourcePlanner.planFor(
            AudioSourcePlanner.SOURCE_MIC,
            setOf(AudioEffect.AEC, AudioEffect.NS),
        )

        assertEquals(AudioSourcePlanner.SOURCE_MIC, plan.source)
        assertEquals(setOf(AudioEffect.AEC, AudioEffect.NS), plan.effects)
    }

    @Test
    fun fonte_raw_nunca_ativa_efeitos() {
        val plan = AudioSourcePlanner.planFor(
            AudioSourcePlanner.SOURCE_UNPROCESSED,
            setOf(AudioEffect.AEC, AudioEffect.NS, AudioEffect.AGC),
        )

        assertEquals(AudioSourcePlanner.SOURCE_UNPROCESSED, plan.source)
        assertTrue(plan.effects.isEmpty())
    }

    @Test
    fun fonte_desconhecida_cai_para_mic() {
        val plan = AudioSourcePlanner.planFor(
            AudioSourcePlanner.SOURCE_VOICE_RECOGNITION,
            setOf(AudioEffect.NS),
        )

        assertEquals(AudioSourcePlanner.SOURCE_MIC, plan.source)
        assertEquals(setOf(AudioEffect.NS), plan.effects)
    }
}
