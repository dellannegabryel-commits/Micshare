package com.micshare.app

import android.app.Application
import androidx.room.Room
import com.micshare.app.data.MicshareDatabase

class MicshareApplication : Application() {

    private var database: MicshareDatabase? = null

    override fun onCreate() {
        super.onCreate()
        database = Room.databaseBuilder(
            this,
            MicshareDatabase::class.java,
            "micshare-db"
        ).fallbackToDestructiveMigration().build()
    }

    fun getDatabase(): MicshareDatabase = database!!
}