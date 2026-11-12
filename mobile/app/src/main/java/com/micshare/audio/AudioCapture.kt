package com.micshare.audio

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import com.micshare.protocol.Protocol
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Frame capturado: PCM (s16le) + instante da captura.
 *
 * @property pcm amostras do frame (480 = 10 ms a 48 kHz mono).
 * @property captureTsMs relógio do celular no instante da leitura (ms).
 */
data class CapturedFrame(
    val pcm: ShortArray,
    val captureTsMs: Long,
)

/**
 * Captura do microfone via `AudioRecord`.
 *
 * Emite frames de [Protocol.FRAME_SAMPLES] amostras (480 = 10 ms a 48 kHz
 * mono), exatamente o tamanho esperado pelo PC.
 *
 * O buffer do [AudioRecord] usa o mínimo do dispositivo (P0-9): um FIFO
 * maior (4 frames) adicionava até 80 ms de latência que nunca saía.
 *
 * A fonte de áudio decide se o app aplica efeitos: em `MIC` o HAL entrega
 * o sinal cru e o app liga AEC/NS; em `VOICE_COMMUNICATION` o HAL já
 * processa e o app não aplica nada (evita processamento duplo).
 */
class AudioCapture(
    private val context: Context,
    private val source: Int = AudioSourcePlanner.SOURCE_MIC,
    private val deviceId: Int? = null,
    private val includeAgc: Boolean = false,
    private val sampleRate: Int = Protocol.SAMPLE_RATE,
    private val frameSamples: Int = Protocol.FRAME_SAMPLES,
) {

    /**
     * Fluxo de frames capturados do microfone.
     *
     * O `AudioRecord` é aberto na coleta e fechado no cancelamento; os
     * efeitos são liberados junto (sem release a sessão de áudio fica presa).
     */
    fun frames(): Flow<CapturedFrame> = callbackFlow {

        val job = launch(Dispatchers.IO) {
            val plan = AudioSourcePlanner.planFor(source, AudioEffects.available(includeAgc))
            val record = createRecord(plan.source)
            val effects = AudioEffects.create(plan, record.audioSessionId)
            try {
                record.startRecording()
                // Carry-over: sobra de leitura parcial vira o início do
                // próximo frame. Sem isso, a leitura parcial virava zeros no
                // meio do sinal (clique garantido).
                val assembler = FrameAssembler(frameSamples)
                val buffer = ShortArray(frameSamples)
                val frameMs = 1000L * frameSamples / sampleRate
                val clock = CaptureClock(frameMs = frameMs)

                while (isActive) {
                    val read = record.read(buffer, 0, assembler.space)
                    if (read < 0) break
                    if (read == 0) continue
                    val pcm = assembler.write(buffer, read) ?: continue
                    send(CapturedFrame(pcm, clock.captureTs()))
                }
            } finally {
                effects.release()
                runCatching { record.stop() }
                record.release()
            }
        }

        awaitClose { job.cancel() }
    }.buffer(capacity = 2, onBufferOverflow = BufferOverflow.DROP_OLDEST).flowOn(Dispatchers.IO)

    /** Cria e inicializa o `AudioRecord` mono 16-bit (API 23 = minSdk). */
    private fun createRecord(source: Int): AudioRecord {
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        require(minBuffer > 0) { "AudioRecord.getMinBufferSize retornou $minBuffer" }

        val bufferSize = CaptureConfig.bufferSizeInBytes(minBuffer, frameSamples)

        val record = AudioRecord.Builder()
            .setAudioSource(source)
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

        // Microfone escolhido pelo usuário (nenhum = padrão do sistema).
        deviceId?.let { id ->
            MicDevices.find(context, id)?.let { device ->
                record.setPreferredDevice(device)
            }
        }

        return record
    }
}
