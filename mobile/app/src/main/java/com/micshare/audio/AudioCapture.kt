package com.micshare.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.micshare.protocol.Protocol
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Captura do microfone via `AudioRecord`.
 *
 * Emite frames de [Protocol.FRAME_SAMPLES] amostras (480 = 10 ms a 48 kHz
 * mono), exatamente o tamanho esperado pelo PC.
 *
 * O buffer do [AudioRecord] usa o mínimo do dispositivo (P0-9): um FIFO
 * maior (4 frames) adicionava até 80 ms de latência que nunca saía.
 */
class AudioCapture(
    private val sampleRate: Int = Protocol.SAMPLE_RATE,
    private val frameSamples: Int = Protocol.FRAME_SAMPLES,
) {

    /**
     * Fluxo de frames PCM (s16le) capturados do microfone.
     *
     * O `AudioRecord` é aberto na coleta e fechado no cancelamento.
     */
    fun frames(): Flow<ShortArray> = callbackFlow {

        val job = launch(Dispatchers.IO) {
            val record = createRecord()
            try {
                record.startRecording()
                // Carry-over: sobra de leitura parcial vira o início do próximo
                // frame. Sem isso, a leitura parcial virava zeros no meio do
                // sinal (clique garantido).
                val carry = ShortArray(frameSamples)
                var carryLen = 0
                val buffer = ShortArray(frameSamples)

                while (isActive) {
                    val toRead = frameSamples - carryLen
                    val read = if (toRead > 0) record.read(buffer, carryLen, toRead) else 0
                    val got = if (read <= 0) 0 else read
                    // Copia o carry para o início do buffer de saída.
                    if (carryLen > 0) {
                        System.arraycopy(carry, 0, buffer, 0, carryLen)
                    }
                    if (got < toRead && got >= 0) {
                        for (i in carryLen + got until frameSamples) buffer[i] = 0
                    }
                    send(buffer.copyOf())
                    // Atualiza o carry: o que sobrou da leitura atual (se a
                    // leitura for maior que o frame — raro, mas possível).
                    carryLen = 0
                }
            } finally {
                runCatching { record.stop() }
                record.release()
            }
        }

        awaitClose { job.cancel() }
    }.buffer(capacity = 16, onBufferOverflow = BufferOverflow.SUSPEND).flowOn(Dispatchers.IO)

    /** Cria e inicializa o `AudioRecord` mono 16-bit (API 23 = minSdk). */
    private fun createRecord(): AudioRecord {
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        require(minBuffer > 0) { "AudioRecord.getMinBufferSize retornou $minBuffer" }

        // Apenas o mínimo do dispositivo — sem margem de 4 frames.
        val bufferSize = minBuffer

        val record = AudioRecord.Builder()
            .setAudioSource(MediaRecorder.AudioSource.MIC)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(bufferSize)
            .build()

        check(record.state == AudioRecord.STATE_INITIALIZED) {
            "falha ao inicializar o AudioRecord (estado=${record.state})"
        }
        // Valida a taxa real do dispositivo (mitiga aparelhos que fixam 16 kHz).
        check(record.sampleRate == sampleRate) {
            "AudioRecord reportou sampleRate=${record.sampleRate}, esperado $sampleRate"
        }
        check(record.channelCount == 1) {
            "AudioRecord reportou channelCount=${record.channelCount}, esperado 1"
        }
        return record
    }
}
