package com.micshare.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** DataStore de preferências do app. */
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "micshare_settings")

/**
 * Preferências persistidas do app.
 *
 * @property lastHost endereço do último PC conectado.
 * @property lastName nome do último PC conectado.
 * @property volume ganho enviado ao PC (`[0.0, 4.0]`).
 */
data class AppSettings(
    val lastHost: String = "",
    val lastName: String = "",
    val volume: Float = 1f,
)

/**
 * Persistência das preferências do app via `DataStore`.
 */
class SettingsStore(private val context: Context) {

    /** Preferências atuais, observáveis. */
    val settings: Flow<AppSettings> = context.dataStore.data.map { preferences ->
        AppSettings(
            lastHost = preferences[KEY_LAST_HOST].orEmpty(),
            lastName = preferences[KEY_LAST_NAME].orEmpty(),
            volume = preferences[KEY_VOLUME] ?: 1f,
        )
    }

    /** Guarda o último PC conectado. */
    suspend fun rememberServer(host: String, name: String) {
        context.dataStore.edit { preferences ->
            preferences[KEY_LAST_HOST] = host
            preferences[KEY_LAST_NAME] = name
        }
    }

    /** Guarda o ganho de volume. */
    suspend fun setVolume(volume: Float) {
        context.dataStore.edit { preferences ->
            preferences[KEY_VOLUME] = volume.coerceIn(0f, 4f)
        }
    }

    private companion object {
        val KEY_LAST_HOST = stringPreferencesKey("last_host")
        val KEY_LAST_NAME = stringPreferencesKey("last_name")
        val KEY_VOLUME = floatPreferencesKey("volume")
    }
}
