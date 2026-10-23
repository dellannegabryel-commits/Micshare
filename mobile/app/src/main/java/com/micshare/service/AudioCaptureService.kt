package com.micshare.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.micshare.R
import com.micshare.audio.AudioCapture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicReference

class AudioCaptureService : Service() {
    private val capture = AudioCapture()
    private var notificationManager: NotificationManager? = null
    private val frameCallbackRef = AtomicReference<((ShortArray) -> Unit)?>(null)

    companion object {
        const val CHANNEL_ID = "micshare_capture"
        const val NOTIFICATION_ID = 1
        const val ACTION_START = "com.micshare.ACTION_START_CAPTURE"
        const val ACTION_STOP = "com.micshare.ACTION_STOP_CAPTURE"
    }

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        when (action) {
            ACTION_START -> startCapture()
            ACTION_STOP -> stopCapture()
        }
        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Micshare Audio Capture",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Transmissão de áudio do celular para o PC"
                setShowBadge(false)
            }
            notificationManager?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Micshare")
            .setContentText("Transmitindo áudio para o PC")
            .setSmallIcon(R.drawable.ic_launcher)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun startCapture() {
        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        val callback: (ShortArray) -> Unit = { frame ->
            frameCallbackRef.get()?.invoke(frame)
        }
        frameCallbackRef.set(callback)

        CoroutineScope(Dispatchers.IO).launch {
            capture.start { frame ->
                frameCallbackRef.get()?.invoke(frame)
            }
        }
    }

    private fun stopCapture() {
        capture.stop()
        frameCallbackRef.set(null)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    fun setFrameCallback(callback: ((ShortArray) -> Unit)?) {
        frameCallbackRef.set(callback)
    }

    fun isCapturing(): Boolean = capture.isRunning()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }
}