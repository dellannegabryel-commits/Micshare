package com.micshare.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.OnConflictStrategy

@Entity(tableName = "server_settings")
data class ServerSetting(
    @PrimaryKey val id: Int = 0,
    val serverIp: String = "",
    val serverPort: Int = 41235,
    val pairingCode: String = "",
    val lastConnected: Long = 0
)

@Entity(tableName = "audio_settings")
data class AudioSetting(
    @PrimaryKey val id: Int = 0,
    val sampleRate: Int = 48000,
    val channels: Int = 1,
    val bitDepth: Int = 16,
    val frameSizeMs: Int = 10,
    val useOpus: Boolean = false,
    val opusBitrate: Int = 64000
)

@Dao
interface ServerSettingDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(setting: ServerSetting)

    @Query("SELECT * FROM server_settings WHERE id = 0")
    suspend fun getSetting(): ServerSetting?

    @Query("DELETE FROM server_settings")
    suspend fun clear()
}

@Dao
interface AudioSettingDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(setting: AudioSetting)

    @Query("SELECT * FROM audio_settings WHERE id = 0")
    suspend fun getSetting(): AudioSetting?
}

@Database(
    entities = [ServerSetting::class, AudioSetting::class],
    version = 1,
    exportSchema = false
)
abstract class MicshareDatabase : RoomDatabase() {
    abstract fun serverSettingDao(): ServerSettingDao
    abstract fun audioSettingDao(): AudioSettingDao

    companion object {
        @Volatile
        private var INSTANCE: MicshareDatabase? = null

        fun getDatabase(context: Context): MicshareDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    MicshareDatabase::class.java,
                    "micshare-db"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}