package com.micshare.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Process
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean

sealed interface AudioCodec {
    object Pcm : AudioCodec
    data class Opus(val bitrate: Int = 24000) : AudioCodec
}

class AudioCapture(
    private val sampleRate: Int = 48000,
    private val frameMs: Int = 10,
    private var audioSource: Int = MediaRecorder.AudioSource.MIC
) {
    private val frameSize = (sampleRate * frameMs) / 1000  // 480 samples
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private val isRunning = AtomicBoolean(false)

    private var aec: AcousticEchoCanceler? = null
    private var agc: AutomaticGainControl? = null
    private var ns: NoiseSuppressor? = null

    var nsEnabled = false
    var agcEnabled = false  // Disable by default - AGC can cause pumping/cutting artifacts
    var aecEnabled = false  // Disable by default - AEC causes metallic artifacts without reference signal

    fun setAudioSource(source: Int) {
        audioSource = source
    }

    @SuppressLint("MissingPermission")
    suspend fun start(codec: AudioCodec, onFrame: (ByteArray) -> Unit): Boolean {
        if (isRunning.getAndSet(true)) return false

        val encoder = when (codec) {
            is AudioCodec.Opus -> OpusEncoder(sampleRate, 1, codec.bitrate).apply { init() }
            else -> null
        }

        try {
            val minBufferSize = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            if (minBufferSize <= 0) {
                println("[capture] minBufferSize invalid: $minBufferSize")
                isRunning.set(false)
                encoder?.release()
                return false
            }
            val bufferSize = minBufferSize * 4

            audioRecord = AudioRecord(
                audioSource,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            )

            val state = audioRecord?.state ?: AudioRecord.STATE_UNINITIALIZED
            if (state != AudioRecord.STATE_INITIALIZED) {
                println("[capture] AudioRecord state not initialized: $state")
                audioRecord?.release()
                audioRecord = null
                isRunning.set(false)
                encoder?.release()
                return false
            }

            val sessionId = audioRecord?.audioSessionId ?: 0
            if (sessionId != 0) {
                try {
                    if (aecEnabled && AcousticEchoCanceler.isAvailable()) {
                        aec = AcousticEchoCanceler.create(sessionId)?.apply { enabled = true }
                    }
                    if (agcEnabled && AutomaticGainControl.isAvailable()) {
                        agc = AutomaticGainControl.create(sessionId)?.apply { enabled = true }
                    }
                    if (nsEnabled && NoiseSuppressor.isAvailable()) {
                        ns = NoiseSuppressor.create(sessionId)?.apply { enabled = true }
                    }
                } catch (e: Exception) {
                    println("[capture] audio effects error: ${e.message}")
                }
            }

            audioRecord?.startRecording()
            println("[capture] AudioRecord started with source $audioSource (NS=$nsEnabled, AGC=$agcEnabled, AEC=$aecEnabled) codec=${codec.javaClass.simpleName}")
        } catch (e: Exception) {
            println("[capture] AudioRecord init exception: ${e.message}")
            audioRecord?.release()
            audioRecord = null
            isRunning.set(false)
            encoder?.release()
            return false
        }

        captureJob = CoroutineScope(Dispatchers.IO).launch {
            try {
                Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
            } catch (_: Exception) {}

            val buffer = ShortArray(frameSize)
            while (isRunning.get()) {
                try {
                    val rec = audioRecord ?: break
                    val read = rec.read(buffer, 0, frameSize, AudioRecord.READ_BLOCKING)
                    if (read == frameSize && isRunning.get()) {
                        val output = when (codec) {
                            is AudioCodec.Opus -> {
                                val packet = encoder!!.encode(buffer)
                                if (packet != null) packet else ByteArray(0)
                            }
                            else -> {
                                // PCM: convert ShortArray to ByteArray (little endian)
                                val bytes = ByteArray(buffer.size * 2)
                                for (i in buffer.indices) {
                                    val s = buffer[i].toInt()
                                    bytes[i * 2] = (s and 0xFF).toByte()
                                    bytes[i * 2 + 1] = ((s shr 8) and 0xFF).toByte()
                                }
                                bytes
                            }
                        }
                        if (output.isNotEmpty()) onFrame(output)
                    } else if (read < 0) {
                        println("[capture] read error: $read")
                    }
                } catch (e: Exception) {
                    if (isRunning.get()) {
                        println("[capture] read exception: ${e.message}")
                    }
                    break
                }
            }
            encoder?.release()
        }
        return true
    }

    fun stop() {
        if (!isRunning.getAndSet(false)) return
        captureJob?.cancel()

        try { aec?.release() } catch (_: Exception) {}
        aec = null
        try { agc?.release() } catch (_: Exception) {}
        agc = null
        try { ns?.release() } catch (_: Exception) {}
        ns = null

        try {
            audioRecord?.stop()
        } catch (e: Exception) {
            println("[capture] stop error: ${e.message}")
        }
        try {
            audioRecord?.release()
        } catch (e: Exception) {
            println("[capture] release error: ${e.message}")
        }
        audioRecord = null
    }

    fun isRunning(): Boolean = isRunning.get()
}
