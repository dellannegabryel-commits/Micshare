package com.micshare.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.micshare.audio.AudioSourcePlanner
import com.micshare.audio.MicDevices
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** DataStore de preferências do app. */
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "micshare_settings")

/**
 * Preferências persistidas do app.
 *
 * Só a entrada de áudio é persistida. O ganho e o mute **não**: quem manda é
 * o PC (é o mixer), e o `welcome` devolve os valores em vigor — o celular
 * ressincroniza o slider depois de reconectar.
 *
 * @property audioSource fonte de áudio (`MediaRecorder.AudioSource.*`).
 * @property micDeviceId microfone escolhido (`NO_DEVICE` = padrão do sistema).
 * @property agcEnabled ganho automático ligado pelo usuário.
 */
data class AppSettings(
    val audioSource: Int = AudioSourcePlanner.SOURCE_MIC,
    val micDeviceId: Int = MicDevices.NO_DEVICE,
    val agcEnabled: Boolean = false,
)

/**
 * Persistência das preferências do app via `DataStore`.
 */
class SettingsStore(private val context: Context) {

    /** Preferências atuais, observáveis. */
    val settings: Flow<AppSettings> = context.dataStore.data.map { preferences ->
        AppSettings(
            audioSource = preferences[KEY_AUDIO_SOURCE] ?: AudioSourcePlanner.SOURCE_MIC,
            micDeviceId = preferences[KEY_MIC_DEVICE_ID] ?: MicDevices.NO_DEVICE,
            agcEnabled = preferences[KEY_AGC_ENABLED] ?: false,
        )
    }

    /** Guarda a fonte de áudio, o microfone e o AGC escolhidos. */
    suspend fun setAudioInput(source: Int, deviceId: Int, agc: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[KEY_AUDIO_SOURCE] = source
            preferences[KEY_MIC_DEVICE_ID] = deviceId
            preferences[KEY_AGC_ENABLED] = agc
        }
    }

    private companion object {
        val KEY_AUDIO_SOURCE = intPreferencesKey("audio_source")
        val KEY_MIC_DEVICE_ID = intPreferencesKey("mic_device_id")
        val KEY_AGC_ENABLED = booleanPreferencesKey("agc_enabled")
    }
}
