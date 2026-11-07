package com.micshare.audio

import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor

/**
 * Efeitos de áudio (`android.media.audiofx`) ligados a uma sessão do
 * `AudioRecord`.
 *
 * Os efeitos são criados com o `audioSessionId` do `AudioRecord` **antes** de
 * `startRecording()` e **liberados** (`release()`) no `finally`: sem release a
 * sessão de áudio fica presa e o próximo `AudioRecord` falha.
 *
 * Cada efeito só existe se o aparelho suportar (`isAvailable()`); a
 * disponibilidade real é consultada em [available].
 */
class AudioEffects private constructor(
    private val echoCanceler: AcousticEchoCanceler?,
    private val noiseSuppressor: NoiseSuppressor?,
    private val gainControl: AutomaticGainControl?,
) {

    /** Libera os efeitos (obrigatório — senão a sessão de áudio fica presa). */
    fun release() {
        runCatching { echoCanceler?.release() }
        runCatching { noiseSuppressor?.release() }
        runCatching { gainControl?.release() }
    }

    companion object {

        /**
         * Efeitos suportados pelo aparelho.
         *
         * O AGC fica de fora por padrão: ele briga com o slider de volume do
         * app (o usuário escolhe o ganho, o AGC muda por baixo).
         */
        fun available(includeAgc: Boolean = false): Set<AudioEffect> = buildSet {
            if (AcousticEchoCanceler.isAvailable()) add(AudioEffect.AEC)
            if (NoiseSuppressor.isAvailable()) add(AudioEffect.NS)
            if (includeAgc && AutomaticGainControl.isAvailable()) add(AudioEffect.AGC)
        }

        /**
         * Cria os efeitos do [plan] para a sessão [sessionId].
         *
         * Efeito que o aparelho não suporta é simplesmente ignorado.
         */
        fun create(plan: AudioSourcePlan, sessionId: Int): AudioEffects {
            val aec = if (AudioEffect.AEC in plan.effects) {
                runCatching { AcousticEchoCanceler.create(sessionId)?.apply { enabled = true } }.getOrNull()
            } else {
                null
            }

            val ns = if (AudioEffect.NS in plan.effects) {
                runCatching { NoiseSuppressor.create(sessionId)?.apply { enabled = true } }.getOrNull()
            } else {
                null
            }

            val agc = if (AudioEffect.AGC in plan.effects) {
                runCatching { AutomaticGainControl.create(sessionId)?.apply { enabled = true } }.getOrNull()
            } else {
                null
            }

            return AudioEffects(aec, ns, agc)
        }
    }
}
