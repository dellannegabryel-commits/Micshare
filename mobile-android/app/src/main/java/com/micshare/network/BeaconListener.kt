package com.micshare.network

import android.content.Context
import com.micshare.protocol.Beacon
import com.micshare.protocol.DiscoveryRequest
import com.micshare.protocol.Protocol
import com.micshare.protocol.ProtocolJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress

/**
 * Escuta o beacon UDP de descoberta do PC (porta 41234).
 *
 * Estratégia dupla, igual à do lado Rust:
 * 1. **Broadcast** — o PC anuncia a 1 Hz; o celular apenas escuta.
 * 2. **Probe unicast** — se o broadcast for filtrado pela rede, o celular
 *    envia `{"t":"probe"}` periodicamente e o PC responde em unicast.
 *
 * O socket é aberto quando o fluxo é coletado e fechado no cancelamento.
 */
class BeaconListener(private val context: Context) {

    /**
     * Fluxo de PCs descobertos.
     *
     * Emite um [DiscoveredServer] a cada beacon recebido (1 Hz por servidor).
     */
    fun servers(): Flow<DiscoveredServer> = callbackFlow {
        val socket = DatagramSocket(null).apply {
            reuseAddress = true
            broadcast = true
            bind(InetSocketAddress(Protocol.DISCOVERY_PORT))
        }

        val receiveJob = launch(Dispatchers.IO) {
            val buffer = ByteArray(MAX_BEACON_BYTES)
            while (isActive) {
                val packet = DatagramPacket(buffer, buffer.size)
                try {
                    socket.receive(packet)
                } catch (io: IOException) {
                    // Socket fechado durante o cancelamento: fim normal do fluxo.
                    break
                }

                val server = parse(packet) ?: continue
                trySend(server)
            }
        }

        val probeJob = launch(Dispatchers.IO) {
            val probe = ProtocolJson
                .encodeToString(DiscoveryRequest.serializer(), DiscoveryRequest.Probe)
                .encodeToByteArray()
            val targets = NetworkUtils.broadcastAddresses(context)

            while (isActive) {
                for (target in targets) {
                    val packet = DatagramPacket(probe, probe.size, target, Protocol.DISCOVERY_PORT)
                    runCatching { socket.send(packet) }
                }
                delay(PROBE_INTERVAL_MS)
            }
        }

        awaitClose {
            receiveJob.cancel()
            probeJob.cancel()
            socket.close()
        }
    }.flowOn(Dispatchers.IO)

    /** Converte o datagrama recebido em um [DiscoveredServer], ou `null` se inválido. */
    private suspend fun parse(packet: DatagramPacket): DiscoveredServer? {
        val text = withContext(Dispatchers.IO) {
            String(packet.data, packet.offset, packet.length, Charsets.UTF_8)
        }

        val beacon = runCatching { ProtocolJson.decodeFromString<Beacon>(text) }.getOrNull()
        if (beacon == null || !beacon.isMicshare) return null

        val host = packet.address?.hostAddress ?: return null

        return DiscoveredServer(
            host = host,
            name = beacon.name,
            ctrlPort = beacon.ctrlPort,
            audioPort = beacon.audioPort,
            pair = beacon.pair,
            code = beacon.code,
            lastSeenMillis = System.currentTimeMillis(),
        )
    }

    private companion object {
        /** Intervalo entre probes unicast (ms). */
        const val PROBE_INTERVAL_MS = 2_000L

        /** Tamanho máximo do buffer de recepção (o beacon tem ≤ 200 B). */
        const val MAX_BEACON_BYTES = 512
    }
}
