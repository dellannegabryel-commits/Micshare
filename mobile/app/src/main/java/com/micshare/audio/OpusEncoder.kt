package com.micshare.audio

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.util.Log
import java.nio.ByteBuffer

class OpusEncoder(private val sampleRate: Int = 48000, private val channels: Int = 1, private val bitrate: Int = 24000) {
    private var codec: MediaCodec? = null
    private var inputBuffers: Array<ByteBuffer>? = null
    private var outputBuffers: Array<ByteBuffer>? = null
    private var initialized = false
    private var frameCount = 0L

    fun init(): Boolean {
        try {
            val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, sampleRate, channels)
            format.setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
            format.setInteger(MediaFormat.KEY_CHANNEL_COUNT, channels)
            format.setInteger(MediaFormat.KEY_SAMPLE_RATE, sampleRate)
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 1275)
            format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC) // Not used for Opus but required

            codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS)
            codec?.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec?.start()

            inputBuffers = codec?.getInputBuffers()
            outputBuffers = codec?.getOutputBuffers()

            initialized = true
            Log.d("OpusEncoder", "Opus encoder initialized: ${bitrate} bps")
            return true
        } catch (e: Exception) {
            Log.e("OpusEncoder", "Failed to initialize Opus encoder: ${e.message}")
            return false
        }
    }

    // Returns encoded Opus packet, or null if error
    fun encode(pcm: ShortArray): ByteArray? {
        if (!initialized || codec == null) return null

        try {
            // Dequeue input buffer
            val inputIndex = codec!!.dequeueInputBuffer(0)
            if (inputIndex < 0) return null

            val inputBuffer = inputBuffers!![inputIndex]
            inputBuffer.clear()

            // Convert ShortArray to byte array (little endian)
            val byteArray = ByteArray(pcm.size * 2)
            for (i in pcm.indices) {
                val sample = pcm[i].toInt()
                byteArray[i * 2] = (sample and 0xFF).toByte()
                byteArray[i * 2 + 1] = ((sample shr 8) and 0xFF).toByte()
            }
            inputBuffer.put(byteArray)

            val presentationTimeUs = (frameCount * 20000).toLong() // 20ms frames
            frameCount++
            codec!!.queueInputBuffer(inputIndex, 0, byteArray.size, presentationTimeUs, 0)

            // Dequeue output buffer
            val bufferInfo = MediaCodec.BufferInfo()
            val outputIndex = codec!!.dequeueOutputBuffer(bufferInfo, 0)

            if (outputIndex >= 0) {
                val outputBuffer = outputBuffers!![outputIndex]
                outputBuffer.position(bufferInfo.offset)
                outputBuffer.limit(bufferInfo.offset + bufferInfo.size)

                val packet = ByteArray(bufferInfo.size)
                outputBuffer.get(packet)

                codec!!.releaseOutputBuffer(outputIndex, false)
                return packet
            } else if (outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) {
                outputBuffers = codec!!.getOutputBuffers()
            } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                val newFormat = codec!!.outputFormat
                Log.d("OpusEncoder", "Output format changed: $newFormat")
            }

            return null
        } catch (e: Exception) {
            Log.e("OpusEncoder", "Encode error: ${e.message}")
            return null
        }
    }

    fun flush(): ByteArray? {
        if (!initialized || codec == null) return null
        try {
            // Send EOS
            val inputIndex = codec!!.dequeueInputBuffer(0)
            if (inputIndex >= 0) {
                codec!!.queueInputBuffer(inputIndex, 0, 0, frameCount * 20000, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            }

            // Drain remaining output
            val bufferInfo = MediaCodec.BufferInfo()
            while (true) {
                val outputIndex = codec!!.dequeueOutputBuffer(bufferInfo, 0)
                if (outputIndex >= 0) {
                    val outputBuffer = outputBuffers!![outputIndex]
                    outputBuffer.position(bufferInfo.offset)
                    outputBuffer.limit(bufferInfo.offset + bufferInfo.size)

                    val packet = ByteArray(bufferInfo.size)
                    outputBuffer.get(packet)
                    codec!!.releaseOutputBuffer(outputIndex, false)
                    return packet
                } else if (outputIndex == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) {
                    outputBuffers = codec!!.getOutputBuffers()
                } else {
                    break
                }
            }
        } catch (e: Exception) {
            Log.e("OpusEncoder", "Flush error: ${e.message}")
        }
        return null
    }

    fun reset() {
        codec?.flush()
        frameCount = 0
    }

    fun release() {
        try {
            codec?.stop()
            codec?.release()
        } catch (e: Exception) {
            Log.e("OpusEncoder", "Release error: ${e.message}")
        }
        codec = null
        initialized = false
    }
}