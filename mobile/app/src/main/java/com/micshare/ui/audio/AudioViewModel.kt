package com.micshare.ui.audio

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.micshare.audio.AudioCapture
import com.micshare.audio.AudioSender
import com.micshare.control.ControlClient
import com.micshare.control.ControlCallbacks
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.koin.core.component.KoinComponent
import org.koin.core.component.get
import org.koin.core.parameter.parametersOf

class AudioViewModel(
    private val ip: String,
    private val audioPort: Int,
    private val ctrlPort: Int,
    private val sessionId: String,
    private val pcName: String,
    private val audioCapture: AudioCapture,
    private val audioSender: AudioSender,
    private val controlClient: ControlClient
) : ViewModel() {

    val sessionIdDisplay = sessionId.take(8)
    val pcNameDisplay = pcName

    private val _connected = MutableStateFlow(true)
    val connected = _connected.asStateFlow()

    private val _muted = MutableStateFlow(false)
    val muted = _muted.asStateFlow()

    private val _volume = MutableStateFlow(1.0)
    val volume = _volume.asStateFlow()

    private val _reconnecting = MutableStateFlow(false)
    val reconnecting = _reconnecting.asStateFlow()

    private val _statsLoss = MutableStateFlow(0.0)
    val statsLoss = _statsLoss.asStateFlow()

    private val _statsBuffer = MutableStateFlow(0)
    val statsBuffer = _statsBuffer.asStateFlow()

    private val _statsGaps = MutableStateFlow(0)
    val statsGaps = _statsGaps.asStateFlow()

    private val _statsReconnects = MutableStateFlow(0)
    val statsReconnects = _statsReconnects.asStateFlow()

    init {
        startPipeline()
    }

    private fun startPipeline() {
        val callbacks = object : ControlCallbacks {
            override fun onStats(lossPct: Double, bufferMs: Int, seqGaps: Int, reconnects: Int) {
                _statsLoss.value = lossPct
                _statsBuffer.value = bufferMs
                _statsGaps.value = seqGaps
                _statsReconnects.value = reconnects
                _reconnecting.value = false
            }

            override fun onError(code: String, message: String) {
                Log.e("AudioViewModel", "[control] error: $code $message")
                if (code == "bad_token") {
                    // TODO: Handle session expired
                }
            }

            override fun onClose() {
                if (_connected.value) {
                    _reconnecting.value = true
                }
            }
        }

        // Start audio capture
        viewModelScope.launch(Dispatchers.IO) {
            audioCapture.start { frame ->
                audioSender.sendFrame(frame)
            }
        }

        // Start UDP sender
        audioSender.start()

        // Connect control WebSocket
        controlClient.connect(callbacks)
    }

    fun toggleMute() {
        val next = !_muted.value
        _muted.value = next
        audioSender.setMuted(next)
        controlClient.sendMute(next)
    }

    fun setVolume(value: Double) {
        _volume.value = value
        controlClient.sendVolume(value)
    }

    fun disconnect() {
        _connected.value = false
        audioCapture.stop()
        audioSender.stop()
        controlClient.sendBye()
        controlClient.disconnect()
    }

    override fun onCleared() {
        disconnect()
        super.onCleared()
    }

    class Factory(
        private val ip: String,
        private val audioPort: Int,
        private val ctrlPort: Int,
        private val sessionId: String,
        private val pcName: String
    ) : androidx.lifecycle.ViewModelProvider.Factory, KoinComponent {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val audioCapture = get<AudioCapture>()
            val audioSender = get<AudioSender> { parametersOf(ip, audioPort) }
            val controlClient = get<ControlClient> { parametersOf(ip, ctrlPort) }
            return AudioViewModel(ip, audioPort, ctrlPort, sessionId, pcName, audioCapture, audioSender, controlClient) as T
        }
    }
}