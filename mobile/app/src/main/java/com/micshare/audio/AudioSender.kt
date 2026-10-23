package com.micshare.audio

import com.micshare.protocol.AudioFrame
import com.micshare.protocol.AudioFrameData
import com.micshare.protocol.AudioFrameHeader
import com.micshare.protocol.ProtocolConstants
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class AudioSender(
    private val targetIp: String,
    private val targetPort: Int
) {
    private var socket: DatagramSocket? = null
    private val isRunning = AtomicBoolean(false)
    private val seq = AtomicInteger(0)
    private val captureTsBase = AtomicLong(System.currentTimeMillis())
    private val muted = AtomicBoolean(false)
    private var address: InetAddress? = null

    fun start(): Boolean {
        if (isRunning.getAndSet(true)) return false
        return try {
            address = InetAddress.getByName(targetIp)
            socket = DatagramSocket()
            true
        } catch (e: Exception) {
            println("[sender] socket init error: ${e.message}")
            isRunning.set(false)
            false
        }
    }

    fun sendFrame(pcm: ShortArray) {
        val targetAddr = address ?: return
        val currentSocket = socket ?: return
        if (!isRunning.get() || muted.get()) return

        val payload = ByteArray(pcm.size * 2)
        for (i in pcm.indices) {
            val sample = pcm[i].toInt()
            // S16LE: Little Endian (LSB first, MSB second)
            payload[i * 2] = (sample and 0xFF).toByte()
            payload[i * 2 + 1] = ((sample shr 8) and 0xFF).toByte()
        }

        val currentSeq = seq.getAndIncrement()
        val captureTs = (System.currentTimeMillis() - captureTsBase.get()).toInt()
        val flags = if (muted.get()) ProtocolConstants.FLAG_MUTED else 0

        val header = AudioFrameHeader(
            seq = currentSeq,
            captureTs = captureTs,
            flags = flags,
            payloadLen = payload.size,
            channels = 1,
            codec = ProtocolConstants.CODEC_PCM_S16LE
        )
        val frame = AudioFrameData(header, payload)
        val encoded = AudioFrame.encode(frame)

        // Send directly on the caller thread (already on Dispatchers.IO in AudioCapture)
        try {
            val packet = DatagramPacket(encoded, encoded.size, targetAddr, targetPort)
            currentSocket.send(packet)
        } catch (e: Exception) {
            if (isRunning.get()) {
                println("[sender] send error: ${e.message}")
            }
        }
    }

    fun setMuted(muted: Boolean) {
        this.muted.set(muted)
    }

    fun stop() {
        if (!isRunning.getAndSet(false)) return
        try {
            socket?.close()
        } catch (e: Exception) {
            println("[sender] close error: ${e.message}")
        }
        socket = null
    }

    fun isRunning(): Boolean = isRunning.get()
}