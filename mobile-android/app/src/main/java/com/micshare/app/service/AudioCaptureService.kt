package com.micshare.app.service

import android.app.Service
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Binder
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicInteger

class AudioCaptureService : Service() {

    private val binder = LocalBinder()
    private var audioRecord: AudioRecord? = null
    private var audioSocket: DatagramSocket? = null
    private var isCapturing = false
    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    private var targetIp: String = ""
    private var targetPort: Int = 41235
    private val seq = AtomicInteger(0)

    inner class LocalBinder : Binder() {
        fun getService(): AudioCaptureService = this@AudioCaptureService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        try {
            audioSocket = DatagramSocket()
        } catch (e: Exception) {
            Log.e("AudioCaptureService", "Failed to create audio socket", e)
        }
    }

    fun startStreaming(ip: String, port: Int) {
        targetIp = ip
        targetPort = port
        isCapturing = true

        val minBufferSize = AudioRecord.getMinBufferSize(
            48000,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )

        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            48000,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            minBufferSize * 4
        )

        audioRecord?.startRecording()

        scope.launch {
            val buffer = ShortArray(480) // 10ms at 48kHz mono
            while (isCapturing) {
                val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                if (read > 0) {
                    sendAudioFrame(buffer, read)
                }
            }
        }
    }

    fun stopStreaming() {
        isCapturing = false
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null
    }

    private fun sendAudioFrame(buffer: ShortArray, length: Int) {
        try {
            val header = ByteBuffer.allocate(16).apply {
                order(ByteOrder.BIG_ENDIAN)
                putInt(0x4D435348) // Magic "MCSH"
                putShort(1) // Version
                putShort(0) // Flags
                putInt(seq.getAndIncrement()) // Sequence
                putInt(System.currentTimeMillis().toInt()) // Capture timestamp
                putShort((length * 2).toShort()) // Payload length in bytes
                put(1) // Channels
                put(0) // Codec (0 = PCM)
            }.array()

            val payload = ByteBuffer.allocate(length * 2).apply {
                order(ByteOrder.LITTLE_ENDIAN)
                buffer.forEachIndexed { i, s ->
                    if (i < length) putShort(s)
                }
            }.array()

            val packetData = header + payload
            val packet = DatagramPacket(packetData, packetData.size, InetAddress.getByName(targetIp), targetPort)
            audioSocket?.send(packet)
        } catch (e: Exception) {
            Log.e("AudioCaptureService", "Failed to send audio frame", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopStreaming()
        audioSocket?.close()
        job.cancel()
    }
}