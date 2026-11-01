package com.micshare.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.micshare.protocol.Protocol
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Captura do microfone via `AudioRecord`.
 *
 * Emite frames de [Protocol.FRAME_SAMPLES] amostras (480 = 10 ms a 48 kHz
 * mono), exatamente o tamanho esperado pelo PC.
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
                val buffer = ShortArray(frameSamples)

                while (isActive) {
                    val read = readFully(record, buffer)
                    if (read == frameSamples) {
                        trySend(buffer.copyOf())
                    }
                }
            } finally {
                runCatching { record.stop() }
                record.release()
            }
        }

        awaitClose { job.cancel() }
    }.flowOn(Dispatchers.IO)

    /** Preenche [buffer] com exatamente [frameSamples] amostras. */
    private fun readFully(record: AudioRecord, buffer: ShortArray): Int {
        var total = 0
        while (total < buffer.size) {
            val read = record.read(buffer, total, buffer.size - total)
            if (read <= 0) return total
            total += read
        }
        return total
    }

    /** Cria e inicializa o `AudioRecord` mono 16-bit. */
    private fun createRecord(): AudioRecord {
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        require(minBuffer > 0) { "AudioRecord.getMinBufferSize retornou $minBuffer" }

        // Margem de 4 frames para absorver jitter do scheduler do Android.
        val bufferSize = maxOf(minBuffer, frameSamples * BYTES_PER_SAMPLE * 4)

        val record = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
        )
        check(record.state == AudioRecord.STATE_INITIALIZED) {
            "falha ao inicializar o AudioRecord (estado=${record.state})"
        }
        return record
    }

    private companion object {
        /** Bytes por amostra PCM 16-bit. */
        const val BYTES_PER_SAMPLE = 2
    }
}
