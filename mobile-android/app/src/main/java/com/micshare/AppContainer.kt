package com.micshare

import android.content.Context
import com.micshare.data.SettingsStore
import com.micshare.network.BeaconListener
import com.micshare.network.ControlClient

/**
 * Container de dependências do app (injeção manual, sem framework).
 *
 * Mantém uma única instância do cliente WebSocket — o `HttpClient` do Ktor
 * possui seu próprio pool de conexões e não deve ser recriado por tela.
 */
class AppContainer(context: Context) {

    private val appContext = context.applicationContext

    /** Preferências persistidas. */
    val settings = SettingsStore(appContext)

    /** Cliente do canal de controle WebSocket. */
    val controlClient = ControlClient()

    /** Escuta do beacon de descoberta. */
    val beaconListener = BeaconListener(appContext)
}
