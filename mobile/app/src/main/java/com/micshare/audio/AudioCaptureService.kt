package com.micshare.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.micshare.R
import com.micshare.network.AudioSender
import com.micshare.protocol.AudioFrame
import com.micshare.protocol.Protocol
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException

/**
 * Serviço de foreground que captura o microfone e envia os frames ao PC.
 *
 * Fica em foreground para que o streaming continue com o app em segundo
 * plano (é o que exige `FOREGROUND_SERVICE_MICROPHONE`).
 *
 * O estado é exposto via [LocalBinder] — a UI observa o [StateFlow] sem
 * recorrer a estado global.
 */
class AudioCaptureService : Service() {

    private val _status = MutableStateFlow(StreamingStatus())
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var captureJob: Job? = null
    private var targetHost: String? = null
    private var targetPort: Int = Protocol.AUDIO_PORT
    private var sequence: Int = 0

    /** Binder que expõe o estado e o controle de mute do serviço. */
    inner class LocalBinder : Binder() {
        /** Estado atual do streaming. */
        val status: StateFlow<StreamingStatus> = _status.asStateFlow()

        /** Liga ou desliga o mute (os frames continuam sendo enviados com a flag). */
        fun setMuted(muted: Boolean) {
            _status.update { it.copy(muted = muted) }
        }
    }

    private val binder = LocalBinder()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onBind(intent: Intent): IBinder = binder

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopStreaming()
            stopSelf()
            return START_NOT_STICKY
        }

        startForegroundNotification()

        val host = intent?.getStringExtra(EXTRA_HOST) ?: targetHost
        val port = intent?.getIntExtra(EXTRA_AUDIO_PORT, targetPort) ?: targetPort
        if (host.isNullOrBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }

        startStreaming(host, port)
        return START_STICKY
    }

    override fun onDestroy() {
        stopStreaming()
        serviceScope.cancel()
        super.onDestroy()
    }

    /** Inicia a captura e o envio de frames. */
    private fun startStreaming(host: String, port: Int) {
        if (captureJob?.isActive == true) return

        targetHost = host
        targetPort = port
        sequence = 0

        captureJob = serviceScope.launch {
            val sender = AudioSender(host, port)
            _status.update { it.copy(active = true, error = null, framesSent = 0, bytesSent = 0) }

            try {
                AudioCapture().frames().collect { pcm ->
                    val flags = if (_status.value.muted) AudioFrame.FLAG_MUTED else 0
                    val datagram = AudioFrame.encode(
                        seq = sequence++,
                        captureTsMs = System.currentTimeMillis(),
                        flags = flags,
                        pcm = pcm,
                    )
                    sender.send(datagram)
                    _status.update {
                        it.copy(
                            framesSent = it.framesSent + 1,
                            bytesSent = it.bytesSent + datagram.size,
                        )
                    }
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                _status.update { it.copy(error = error.message ?: error::class.simpleName) }
            } finally {
                sender.close()
                _status.update { it.copy(active = false) }
            }
        }
    }

    /** Encerra a captura e o envio de frames. */
    private fun stopStreaming() {
        captureJob?.cancel()
        captureJob = null
        _status.update { it.copy(active = false) }
    }

    /** Sobe a notificação de foreground com o tipo `microphone`. */
    private fun startForegroundNotification() {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
    }

    /** Constrói a notificação de foreground (com ação de parar). */
    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, AudioCaptureService::class.java).setAction(ACTION_STOP)
        val pendingIntent = PendingIntent.getService(
            this,
            0,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_streaming_title))
            .setContentText(getString(R.string.notification_streaming_text))
            .setSmallIcon(R.drawable.ic_mic)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()
    }

    /** Cria o canal de notificações (API 26+). */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }

    companion object {
        /** Canal de notificações do streaming. */
        const val CHANNEL_ID = "micshare_streaming"

        /** ID da notificação de foreground. */
        const val NOTIFICATION_ID = 0x4D53

        /** Ação de parada do streaming. */
        const val ACTION_STOP = "com.micshare.audio.STOP"

        /** Extra com o endereço IPv4 do PC. */
        const val EXTRA_HOST = "com.micshare.audio.HOST"

        /** Extra com a porta UDP de áudio. */
        const val EXTRA_AUDIO_PORT = "com.micshare.audio.PORT"
    }
}
