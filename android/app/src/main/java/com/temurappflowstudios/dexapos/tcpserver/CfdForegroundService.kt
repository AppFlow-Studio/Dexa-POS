// android/app/src/main/java/com/temurappflowstudios/dexapos/tcpserver/CfdForegroundService.kt
package com.temurappflowstudios.dexapos.tcpserver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the CFD TCP server process alive when the
 * POS tablet screen dims or the operator briefly switches apps.
 *
 * Android 8+ (API 26+) aggressively kills background services; a foreground
 * service with foregroundServiceType="connectedDevice" satisfies the Android 12+
 * requirement for local-network device communication.
 */
class CfdForegroundService : Service() {

    companion object {
        const val CHANNEL_ID      = "cfd_server_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START    = "START_CFD_SERVER"
        const val ACTION_STOP     = "STOP_CFD_SERVER"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = buildNotification()
        startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        )
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "CFD Server",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Customer Facing Display server status"
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Dexa POS")
            .setContentText("CFD server active")
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
}
