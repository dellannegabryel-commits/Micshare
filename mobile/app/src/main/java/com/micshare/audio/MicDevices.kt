package com.micshare.audio

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager

/**
 * Microfone offered to the user (id + label).
 *
 * @property id id of the `AudioDeviceInfo`.
 * @property name label shown in the picker.
 */
data class MicDevice(
    val id: Int,
    val name: String,
)

/**
 * Microfones disponíveis no aparelho (seletor de entrada).
 *
 * A lista vem de `AudioManager.getDevices(GET_DEVICES_INPUTS)` — inclui o
 * microfone embutido, fones com fio, fones Bluetooth (SCO) e USB.
 */
object MicDevices {

    /** Nenhum microfone escolhido (padrão do sistema). */
    const val NO_DEVICE: Int = -1

    /**
     * Microfones utilizáveis, na ordem: embutido, com fio, USB, Bluetooth.
     *
     * @param context contexto do app.
     */
    fun list(context: Context): List<AudioDeviceInfo> {
        val manager = context.getSystemService(AudioManager::class.java) ?: return emptyList()
        val devices: Array<AudioDeviceInfo> = runCatching {
            manager.getDevices(AudioManager.GET_DEVICES_INPUTS)
        }.getOrDefault(emptyArray())

        return devices
            .filter { it.type in INPUT_TYPES }
            .sortedBy { INPUT_TYPES.indexOf(it.type) }
    }

    /** Microfone com o [id] persistido (ou `null` se não existir mais). */
    fun find(context: Context, id: Int): AudioDeviceInfo? =
        list(context).firstOrNull { it.id == id }

    /** Lista para a UI (id + rótulo). */
    fun options(context: Context): List<MicDevice> =
        list(context).map { MicDevice(it.id, label(it)) }

    /** Rótulo do microfone (nome do produto ou tipo). */
    private fun label(device: AudioDeviceInfo): String {
        val product = device.productName?.toString()?.trim().orEmpty()
        if (product.isNotEmpty()) return product
        return when (device.type) {
            AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Microfone embutido"
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Fone com fio"
            AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET -> "Microfone USB"
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Fone Bluetooth"
            else -> "Microfone"
        }
    }

    /** Tipos de entrada aceitos, na ordem de preferência. */
    private val INPUT_TYPES = listOf(
        AudioDeviceInfo.TYPE_BUILTIN_MIC,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_USB_DEVICE,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    )
}
