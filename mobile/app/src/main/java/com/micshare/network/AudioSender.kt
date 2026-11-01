package com.micshare.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

/**
 * Envia frames de áudio ao PC via UDP (porta 41235).
 *
 * Espelha o lado servidor do Rust: um datagrama por frame, com o header
 * binário de 16 bytes descrito em `docs/arquitetura.md` §3.2.
 */
class AudioSender(
    private val host: String,
    private val port: Int,
) : AutoCloseable {

    private val address: InetAddress = InetAddress.getByName(host)
    private val socket: DatagramSocket = DatagramSocket()

    /**
     * Envia um datagrama de áudio.
     *
     * @throws java.io.IOException se o envio falhar.
     */
    suspend fun send(datagram: ByteArray) = withContext(Dispatchers.IO) {
        socket.send(DatagramPacket(datagram, datagram.size, address, port))
    }

    /** Fecha o socket UDP. */
    override fun close() {
        socket.close()
    }
}
