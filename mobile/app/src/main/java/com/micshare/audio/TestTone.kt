package com.micshare.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.sin

/**
 * Bipe de teste (1 kHz, 100 ms, −6 dBFS).
 *
 * Método A do `docs/latencia.md`: o bipe toca no celular e o PC grava
 * duas trilhas — o microfone do PC apontado para o celular (o bipe
 * chega pelo ar) e a entrada do Micshare (o mesmo bipe captado pelo
 * celular e processado no PC). O script `scripts/onset-diff.py` mede o
 * delta entre os dois onsets.
 */
object TestTone {

    /** Frequência do bipe (Hz). */
    const val TONE_HZ = 1_000.0

    /** Duração do bipe (ms). */
    const val TONE_MS = 100

    /** Taxa de amostragem do bipe (Hz). */
    const val SAMPLE_RATE = 48_000

    /** Amplitude: −6 dBFS (≈ 50% da escala cheia). */
    private const val AMPLITUDE = 0.5 * Short.MAX_VALUE

    /** Fade de entrada e saída (ms) — evita clique no início e no fim. */
    private const val FADE_MS = 3

    /**
     * Toca o bipe e bloqueia até o fim (~100 ms).
     *
     * Chame fora da thread principal: o `AudioTrack` em `MODE_STATIC`
     * espera o buffer inteiro ser tocado.
     */
    fun play() {
        val samples = ShortArray(SAMPLE_RATE * TONE_MS / 1000)
        val step = 2 * PI * TONE_HZ / SAMPLE_RATE
        val fade = SAMPLE_RATE * FADE_MS / 1000

        for (i in samples.indices) {
            var gain = 1.0
            if (i < fade) {
                gain = i.toDouble() / fade
            } else if (i >= samples.size - fade) {
                gain = (samples.size - 1 - i).toDouble() / fade
            }
            samples[i] = (sin(i * step) * AMPLITUDE * gain).toInt().toShort()
        }

        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(samples.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()

        try {
            track.write(samples, 0, samples.size)
            track.play()
            Thread.sleep(TONE_MS.toLong() + 50L)
        } finally {
            runCatching { track.stop() }
            track.release()
        }
    }
}
