package com.micshare.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean

class AudioCapture(
    private val sampleRate: Int = 48000,
    private val frameMs: Int = 10
) {
    private val frameSize = (sampleRate * frameMs) / 1000  // 480 samples
    private val frameBytes = frameSize * 2  // 960 bytes (16-bit)
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private val isRunning = AtomicBoolean(false)

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
                MediaRecorder.AudioSource.MIC,
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

            audioRecord?.startRecording()
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
                        onFrame(buffer.copyOf())
                    } else if (read < 0) {
                        println("[capture] read error: $read")
                        delay(10)
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