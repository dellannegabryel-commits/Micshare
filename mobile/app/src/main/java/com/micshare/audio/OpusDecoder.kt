package com.micshare.audio

import android.media.MediaCodec
import android.media.MediaFormat
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder

class OpusDecoder(private val sampleRate: Int = 48000, private val channels: Int = 1) {
    private var codec: MediaCodec? = null
    private var inputBuffers: Array<ByteBuffer>? = null
    private var outputBuffers: Array<ByteBuffer>? = null
    private var initialized = false

    @Suppress("UNUSED_PARAMETER")
    fun init(): Boolean {
        try {
            val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, sampleRate, channels)
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 1275)
            format.setInteger(MediaFormat.KEY_CHANNEL_COUNT, channels)
            format.setInteger(MediaFormat.KEY_SAMPLE_RATE, sampleRate)

            codec = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS)
            codec?.configure(format, null, null, 0)
            codec?.start()

            inputBuffers = codec?.getInputBuffers()
            outputBuffers = codec?.getOutputBuffers()

            initialized = true
            Log.d("OpusDecoder", "Opus decoder initialized")
            return true
        } catch (e: Exception) {
            Log.e("OpusDecoder", "Failed to initialize Opus decoder: ${e.message}")
            return false
        }
    }

    // Returns decoded PCM samples (Int16Array), or null if error
    fun decode(packet: ByteArray?): ShortArray? {
        if (!initialized || codec == null) return null

        try {
            // Dequeue input buffer
            val inputIndex = codec!!.dequeueInputBuffer(0)
            if (inputIndex < 0) return null

            val inputBuffer = inputBuffers!![inputIndex]
            inputBuffer.clear()

            val flags = if (packet == null || packet.isEmpty()) {
                MediaCodec.BUFFER_FLAG_END_OF_STREAM
            } else {
                0
            }

            if (packet != null && packet.isNotEmpty()) {
                inputBuffer.put(packet)
            }

            codec!!.queueInputBuffer(inputIndex, 0, packet?.size ?: 0, System.nanoTime() / 1000, flags)

            // Dequeue output buffer
            val bufferInfo = MediaCodec.BufferInfo()
            val outputIndex = codec!!.dequeueOutputBuffer(bufferInfo, 0)

            if (outputIndex >= 0) {
                val outputBuffer = outputBuffers!![outputIndex]
                outputBuffer.position(bufferInfo.offset)
                outputBuffer.limit(bufferInfo.offset + bufferInfo.size)

                val pcmData = ShortArray(bufferInfo.size / 2)
                outputBuffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(pcmData)

                codec!!.releaseOutputBuffer(outputIndex, false)
                return pcmData
            } else if (outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) {
                outputBuffers = codec!!.getOutputBuffers()
            } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                val newFormat = codec!!.outputFormat
                Log.d("OpusDecoder", "Output format changed: $newFormat")
            }

            return ShortArray(0) // No output available yet
        } catch (e: Exception) {
            Log.e("OpusDecoder", "Decode error: ${e.message}")
            return null
        }
    }

    fun decodeWithPLC(packet: ByteArray?): ShortArray {
        val result = decode(packet)
        if (result == null) {
            // PLC: return silence frame (960 samples for 20ms)
            return ShortArray(960)
        }
        if (result.isEmpty()) {
            // No output yet, return silence
            return ShortArray(960)
        }
        // Ensure we return exactly 960 samples
        if (result.size == 960) return result
        if (result.size > 960) return result.copyOf(960)
        // Pad with zeros if shorter
        val padded = ShortArray(960)
        System.arraycopy(result, 0, padded, 0, result.size)
        return padded
    }

    fun reset() {
        codec?.flush()
    }

    fun release() {
        try {
            codec?.stop()
            codec?.release()
        } catch (e: Exception) {
            Log.e("OpusDecoder", "Release error: ${e.message}")
        }
        codec = null
        initialized = false
    }
}