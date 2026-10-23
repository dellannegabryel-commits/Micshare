package com.micshare.discovery

import android.content.Context
import android.net.wifi.WifiManager
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class BeaconListener(
    private val context: Context,
    private val port: Int = 41234,
    private val ttlMs: Long = 3000
) {
    private var socket: DatagramSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private val pcs = ConcurrentHashMap<String, PCInfo>()
    private val listeners = mutableListOf<(List<PCInfo>) -> Unit>()
    private var scope: CoroutineScope? = null
    private val json = Json { ignoreUnknownKeys = true }
    private val isRunning = AtomicBoolean(false)

    private fun createSocket(): DatagramSocket? {
        return try {
            DatagramSocket(null).apply {
                reuseAddress = true
                broadcast = true
                soTimeout = 1000
                bind(InetSocketAddress(port))
            }
        } catch (e: Exception) {
            try {
                DatagramSocket(port).apply {
                    broadcast = true
                    soTimeout = 1000
                }
            } catch (e2: Exception) {
                println("[beacon] error creating socket on port $port: ${e2.message}")
                null
            }
        }
    }

    fun start(): Boolean {
        if (isRunning.getAndSet(true)) return false

        // Acquire MulticastLock to allow UDP broadcast reception on Wi-Fi
        try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifiManager?.createMulticastLock("micshare_beacon")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (e: Exception) {
            println("[beacon] multicast lock error: ${e.message}")
        }

        socket = createSocket()
        if (socket == null) {
            println("[beacon] failed to bind socket on port $port, using fallback socket")
            try {
                socket = DatagramSocket(null).apply {
                    reuseAddress = true
                    broadcast = true
                    soTimeout = 1000
                }
            } catch (e: Exception) {
                println("[beacon] fallback socket error: ${e.message}")
            }
        }

        val currentScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        scope = currentScope

        if (socket != null) {
            currentScope.launch { receiveLoop() }
            currentScope.launch { cleanupLoop() }
            pingBroadcast()
        }
        return socket != null
    }

    fun pingBroadcast() {
        val currentSocket = socket ?: return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val pingBytes = json.encodeToString(
                    BeaconMessage(
                        app = "micshare",
                        v = 1,
                        name = "discover_ping",
                        audioPort = 41235,
                        ctrlPort = 41236,
                        pair = true,
                        code = ""
                    )
                ).toByteArray()

                // Send to global 255.255.255.255
                val packet255 = DatagramPacket(pingBytes, pingBytes.size, InetAddress.getByName("255.255.255.255"), port)
                currentSocket.send(packet255)

                // Send to local Wi-Fi subnet broadcast address if available
                getWifiBroadcastAddress(context)?.let { subnetBcast ->
                    val packetSubnet = DatagramPacket(pingBytes, pingBytes.size, subnetBcast, port)
                    currentSocket.send(packetSubnet)
                }
            } catch (e: Exception) {
                println("[beacon] ping broadcast error: ${e.message}")
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun getWifiBroadcastAddress(context: Context): InetAddress? {
        return try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return null
            val dhcp = wifiManager.dhcpInfo ?: return null
            val broadcast = (dhcp.ipAddress and dhcp.netmask) or dhcp.netmask.inv()
            val quads = ByteArray(4)
            for (k in 0..3) {
                quads[k] = ((broadcast ushr (k * 8)) and 0xFF).toByte()
            }
            InetAddress.getByAddress(quads)
        } catch (e: Exception) {
            null
        }
    }

    fun stop() {
        if (!isRunning.getAndSet(false)) return
        scope?.cancel()
        scope = null
        try {
            socket?.close()
        } catch (e: Exception) {
            println("[beacon] socket close error: ${e.message}")
        }
        socket = null

        try {
            multicastLock?.let {
                if (it.isHeld) it.release()
            }
        } catch (e: Exception) {
            println("[beacon] release multicast lock error: ${e.message}")
        }
        multicastLock = null

        pcs.clear()
    }

    fun getPCs(): List<PCInfo> = pcs.values.toList().sortedByDescending { it.lastSeen }

    fun subscribe(listener: (List<PCInfo>) -> Unit): () -> Unit {
        synchronized(listeners) {
            listeners.add(listener)
        }
        listener(getPCs())
        return {
            synchronized(listeners) {
                listeners.remove(listener)
            }
        }
    }

    private suspend fun receiveLoop() {
        val buffer = ByteArray(2048)
        val packet = DatagramPacket(buffer, buffer.size)
        while (isRunning.get()) {
            try {
                val currentSocket = socket ?: break
                currentSocket.receive(packet)
                val data = buffer.copyOf(packet.length)
                val text = String(data)
                val beacon = json.decodeFromString<BeaconMessage>(text)
                if (beacon.app == "micshare" && beacon.v == 1 && beacon.name != "discover_ping") {
                    val key = "${beacon.name}@${packet.address.hostAddress}"
                    pcs[key] = PCInfo(
                        name = beacon.name,
                        ip = packet.address.hostAddress ?: "",
                        audioPort = beacon.audioPort,
                        ctrlPort = beacon.ctrlPort,
                        pair = beacon.pair,
                        code = beacon.code,
                        lastSeen = System.currentTimeMillis()
                    )
                    notifyListeners()
                }
            } catch (e: java.net.SocketTimeoutException) {
                // Expected timeout, continue loop
            } catch (e: SocketException) {
                if (isRunning.get()) {
                    println("[beacon] socket exception: ${e.message}")
                }
                break
            } catch (e: Exception) {
                if (isRunning.get()) {
                    println("[beacon] error: ${e.message}")
                }
            }
        }
    }

    private suspend fun cleanupLoop() {
        while (isRunning.get()) {
            delay(1000)
            val now = System.currentTimeMillis()
            var changed = false
            pcs.entries.removeIf { (_, pc) ->
                if (now - pc.lastSeen > ttlMs) {
                    changed = true
                    true
                } else false
            }
            if (changed) notifyListeners()
        }
    }

    private fun notifyListeners() {
        val list = getPCs()
        val currentListeners = synchronized(listeners) { listeners.toList() }
        for (l in currentListeners) {
            try {
                l(list)
            } catch (e: Exception) {
                println("[beacon] listener error: ${e.message}")
            }
        }
    }
}