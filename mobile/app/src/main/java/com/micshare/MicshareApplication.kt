package com.micshare

import android.app.Application

/**
 * Application do Micshare.
 *
 * Cria o [AppContainer] (injeção manual) e o expõe para a UI.
 */
class MicshareApplication : Application() {

    /** Container de dependências, disponível para o ViewModel. */
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
