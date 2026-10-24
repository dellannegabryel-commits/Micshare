package com.micshare.ui.audio

import android.app.Application
import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.micshare.audio.AudioCapture
import com.micshare.audio.AudioCodec
import com.micshare.audio.AudioSender
import com.micshare.control.ControlClient
import com.micshare.control.ControlCallbacks
import com.micshare.protocol.ProtocolConstants
import com.micshare.service.AudioCaptureService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.koin.core.component.KoinComponent
import org.koin.core.component.get
import org.koin.core.parameter.parametersOf

class AudioViewModel(
    application: Application,
    private val ip: String,
    private val audioPort: Int,
    private val ctrlPort: Int,
    private val sessionId: String,
    private val pcName: String,
    private val audioCapture: AudioCapture,
    private val audioSender: AudioSender,
    private val controlClient: ControlClient
) : AndroidViewModel(application) {

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

    private val _micSourceIndex = MutableStateFlow(0)
    val micSourceIndex = _micSourceIndex.asStateFlow()

    private val _keepScreenOn = MutableStateFlow(true)
    val keepScreenOn = _keepScreenOn.asStateFlow()

    private val _noiseSuppression = MutableStateFlow(false)
    val noiseSuppression = _noiseSuppression.asStateFlow()

    private val _autoGain = MutableStateFlow(false)
    val autoGain = _autoGain.asStateFlow()

    private val _echoCancellation = MutableStateFlow(false)
    val echoCancellation = _echoCancellation.asStateFlow()

    private val _codec: MutableStateFlow<AudioCodec> = MutableStateFlow(AudioCodec.Pcm)
    val codec = _codec

    init {
        startPipeline()
    }

    fun setKeepScreenOn(enabled: Boolean) {
        _keepScreenOn.value = enabled
    }

    fun setNoiseSuppression(enabled: Boolean) {
        _noiseSuppression.value = enabled
        audioCapture.nsEnabled = enabled
        restartCapture()
    }

    fun setAutoGain(enabled: Boolean) {
        _autoGain.value = enabled
        audioCapture.agcEnabled = enabled
        restartCapture()
    }

    fun setEchoCancellation(enabled: Boolean) {
        _echoCancellation.value = enabled
        audioCapture.aecEnabled = enabled
        restartCapture()
    }

    fun setCodec(codec: AudioCodec) {
        _codec.value = codec
        restartCapture()
    }

    private fun restartCapture() {
        audioCapture.stop()
        audioSender.setCodec(if (_codec.value is AudioCodec.Opus) ProtocolConstants.CODEC_OPUS else ProtocolConstants.CODEC_PCM_S16LE)
        viewModelScope.launch(Dispatchers.IO) {
            val captureStarted = audioCapture.start(_codec.value) { payload ->
                audioSender.sendFrame(payload)
            }
            Log.d("AudioViewModel", "[pipeline] audioCapture started: $captureStarted codec=${_codec.value}")
        }
    }

    private fun startPipeline() {
        val app = getApplication<Application>()
        val serviceIntent = Intent(app, AudioCaptureService::class.java).apply {
            action = AudioCaptureService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            app.startForegroundService(serviceIntent)
        } else {
            app.startService(serviceIntent)
        }

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
            }

            override fun onClose() {
                if (_connected.value) {
                    _reconnecting.value = true
                }
            }
        }

        val senderStarted = audioSender.start()
        Log.d("AudioViewModel", "[pipeline] audioSender started: $senderStarted to port $audioPort")

        audioCapture.nsEnabled = _noiseSuppression.value
        audioCapture.agcEnabled = _autoGain.value
        audioCapture.aecEnabled = _echoCancellation.value

        viewModelScope.launch(Dispatchers.IO) {
            val captureStarted = audioCapture.start(_codec.value) { payload ->
                audioSender.sendFrame(payload)
            }
            Log.d("AudioViewModel", "[pipeline] audioCapture started: $captureStarted")
        }

        val controlConnected = controlClient.connect(callbacks)
        Log.d("AudioViewModel", "[pipeline] controlClient connected: $controlConnected to port $ctrlPort")
    }

    fun setMicSource(index: Int) {
        _micSourceIndex.value = index
        val source = when (index) {
            0 -> MediaRecorder.AudioSource.MIC
            1 -> MediaRecorder.AudioSource.VOICE_RECOGNITION
            else -> MediaRecorder.AudioSource.VOICE_COMMUNICATION
        }
        audioCapture.stop()
        audioCapture.setAudioSource(source)
        viewModelScope.launch(Dispatchers.IO) {
            val captureStarted = audioCapture.start(_codec.value) { payload ->
                audioSender.sendFrame(payload)
            }
            Log.d("AudioViewModel", "[pipeline] audioCapture started: $captureStarted")
        }
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

        try {
            val app = getApplication<Application>()
            val serviceIntent = Intent(app, AudioCaptureService::class.java).apply {
                action = AudioCaptureService.ACTION_STOP
            }
            app.startService(serviceIntent)
        } catch (e: Exception) {
            Log.e("AudioViewModel", "Error stopping foreground service: ${e.message}")
        }
    }

    override fun onCleared() {
        disconnect()
        super.onCleared()
    }

    class Factory(
        private val application: Application,
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
            val controlClient = get<ControlClient> { parametersOf(ip, ctrlPort, sessionId) }
            return AudioViewModel(application, ip, audioPort, ctrlPort, sessionId, pcName, audioCapture, audioSender, controlClient) as T
        }
    }
}