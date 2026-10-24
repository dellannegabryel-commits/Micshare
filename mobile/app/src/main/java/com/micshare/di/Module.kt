package com.micshare.di

import android.content.Context
import com.micshare.audio.AudioCapture
import com.micshare.audio.AudioSender
import com.micshare.control.ControlClient
import com.micshare.control.PairingClient
import com.micshare.discovery.BeaconListener
import com.micshare.ui.audio.AudioViewModel
import com.micshare.ui.discovery.DiscoveryViewModel
import org.koin.android.ext.koin.androidContext
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.core.context.GlobalContext
import org.koin.core.context.startKoin as startKoinCore
import org.koin.core.module.Module
import org.koin.core.parameter.parametersOf
import org.koin.dsl.module

val appModule: Module = module {
    single { BeaconListener(androidContext()) }
    single { AudioCapture() }
    factory { (ip: String, port: Int) -> AudioSender(ip, port) }
    factory { (ip: String, port: Int) -> PairingClient(ip, port) }
    factory { (ip: String, port: Int) -> ControlClient(ip, port, null) }
    factory { (ip: String, port: Int, sessionId: String) -> ControlClient(ip, port, sessionId) }
    viewModel { DiscoveryViewModel(get()) }
    viewModel { (ip: String, audioPort: Int, ctrlPort: Int, sessionId: String, pcName: String) ->
        AudioViewModel(
            application = get(),
            ip = ip,
            audioPort = audioPort,
            ctrlPort = ctrlPort,
            sessionId = sessionId,
            pcName = pcName,
            audioCapture = get(),
            audioSender = get { parametersOf(ip, audioPort) },
            controlClient = get { parametersOf(ip, ctrlPort, sessionId) }
        )
    }
}

fun startKoin(context: Context) {
    if (GlobalContext.getOrNull() != null) {
        return
    }
    startKoinCore {
        androidContext(context)
        modules(appModule)
    }
}