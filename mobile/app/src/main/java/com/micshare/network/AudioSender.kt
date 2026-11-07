package com.micshare.network

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
    // Packet reutilizado para evitar alocar 976 B/frame.
    private val packet = DatagramPacket(ByteArray(0), 0, address, port)

    /**
     * Envia um datagrama de áudio.
     *
     * Não é `suspend`: o fluxo já roda em `Dispatchers.IO`, então não há
     * motivo para trocar de contexto a cada frame.
     *
     * @throws java.io.IOException se o envio falhar.
     */
    fun send(datagram: ByteArray) {
        packet.setData(datagram, 0, datagram.size)
        socket.send(packet)
    }

    /** Fecha o socket UDP. */
    override fun close() {
        socket.close()
    }
}
