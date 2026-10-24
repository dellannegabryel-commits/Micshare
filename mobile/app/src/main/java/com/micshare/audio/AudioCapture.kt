package com.micshare.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean

class AudioCapture(
    private val sampleRate: Int = 48000,
    private val frameMs: Int = 10,
    private var audioSource: Int = MediaRecorder.AudioSource.VOICE_COMMUNICATION
) {
    private val frameSize = (sampleRate * frameMs) / 1000  // 480 samples
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private val isRunning = AtomicBoolean(false)

    private var aec: AcousticEchoCanceler? = null
    private var agc: AutomaticGainControl? = null
    private var ns: NoiseSuppressor? = null

    fun setAudioSource(source: Int) {
        audioSource = source
    }

    @SuppressLint("MissingPermission")
    suspend fun start(onFrame: (ShortArray) -> Unit): Boolean {
        if (isRunning.getAndSet(true)) return false

        try {
            val minBufferSize = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )
            if (minBufferSize <= 0) {
                println("[capture] minBufferSize invalid: $minBufferSize")
                isRunning.set(false)
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
                return false
            }

            // Apply Hardware Audio Effects (AEC, AGC, Noise Suppression)
            val sessionId = audioRecord?.audioSessionId ?: 0
            if (sessionId != 0) {
                try {
                    if (AcousticEchoCanceler.isAvailable()) {
                        aec = AcousticEchoCanceler.create(sessionId)?.apply { enabled = true }
                        println("[capture] AcousticEchoCanceler enabled")
                    }
                    if (AutomaticGainControl.isAvailable()) {
                        agc = AutomaticGainControl.create(sessionId)?.apply { enabled = true }
                        println("[capture] AutomaticGainControl enabled")
                    }
                    if (NoiseSuppressor.isAvailable()) {
                        ns = NoiseSuppressor.create(sessionId)?.apply { enabled = true }
                        println("[capture] NoiseSuppressor enabled")
                    }
                } catch (e: Exception) {
                    println("[capture] audio effects error: ${e.message}")
                }
            }

            audioRecord?.startRecording()
            println("[capture] AudioRecord started with source $audioSource")
        } catch (e: Exception) {
            println("[capture] AudioRecord init exception: ${e.message}")
            audioRecord?.release()
            audioRecord = null
            isRunning.set(false)
            return false
        }

        captureJob = CoroutineScope(Dispatchers.IO).launch {
            val buffer = ShortArray(frameSize)
            while (isRunning.get()) {
                try {
                    val rec = audioRecord ?: break
                    val read = rec.read(buffer, 0, frameSize, AudioRecord.READ_BLOCKING)
                    if (read == frameSize && isRunning.get()) {
                        onFrame(buffer)
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
        }
        return true
    }

    fun stop() {
        if (!isRunning.getAndSet(false)) return
        captureJob?.cancel()

        try {
            aec?.release()
        } catch (_: Exception) {}
        aec = null

        try {
            agc?.release()
        } catch (_: Exception) {}
        agc = null

        try {
            ns?.release()
        } catch (_: Exception) {}
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