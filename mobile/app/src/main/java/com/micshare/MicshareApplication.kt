package com.micshare

import android.app.Application
import com.micshare.di.startKoin

class MicshareApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        startKoin(this)
    }
}