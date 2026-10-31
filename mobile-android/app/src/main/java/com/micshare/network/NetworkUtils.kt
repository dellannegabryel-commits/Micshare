package com.micshare.network

import android.content.Context
import android.net.wifi.WifiManager
import java.net.Inet4Address
import java.net.InetAddress

/**
 * Utilidades de rede local.
 *
 * Espelha `packages/pc-ui/src-tauri/src/discovery/targets.rs`: o beacon é
 * enviado para o broadcast global e para o broadcast de cada sub-rede IPv4.
 */
object NetworkUtils {

    /** Broadcast global IPv4. */
    val GLOBAL_BROADCAST: InetAddress = InetAddress.getByName("255.255.255.255")

    /**
     * Calcula o endereço de broadcast de uma sub-rede a partir do IP e da máscara.
     *
     * @param ip endereço IPv4 local.
     * @param netmask máscara de sub-rede.
     */
    fun subnetBroadcast(ip: Int, netmask: Int): InetAddress {
        val broadcast = ip or netmask.inv()
        return InetAddress.getByAddress(byteArrayOf(
            (broadcast and 0xFF).toByte(),
            ((broadcast shr 8) and 0xFF).toByte(),
            ((broadcast shr 16) and 0xFF).toByte(),
            ((broadcast shr 24) and 0xFF).toByte(),
        )) as Inet4Address
    }

    /**
     * Endereços de broadcast para onde o probe de descoberta deve ser enviado.
     *
     * Sempre inclui o broadcast global; inclui o broadcast da sub-rede Wi-Fi
     * quando o Android expõe a máscara via `DhcpInfo`.
     */
    @Suppress("DEPRECATION") // `dhcpInfo` não tem substituto para a máscara de sub-rede.
    fun broadcastAddresses(context: Context): List<InetAddress> {
        val targets = mutableListOf(GLOBAL_BROADCAST)

        val dhcp = wifiManager(context)?.dhcpInfo
        if (dhcp != null) {
            val ip = dhcp.ipAddress
            val mask = dhcp.netmask
            if (ip != 0 && mask != 0) {
                val broadcast = runCatching { subnetBroadcast(ip, mask) }.getOrNull()
                if (broadcast != null && broadcast !in targets) {
                    targets += broadcast
                }
            }
        }

        return targets
    }

    private fun wifiManager(context: Context): WifiManager? =
        context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
}
