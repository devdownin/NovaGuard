package com.novaguard.surveillance

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.novaguard.MainActivity
import com.novaguard.R

/**
 * Keeps NovaGuard alive and allowed to use the camera while it is off screen.
 *
 * Android does not let a backgrounded app hold the camera: without a running
 * foreground service of type `camera`, the capture session is cut as soon as the
 * app stops being visible, and the process becomes a candidate for being killed.
 * VisionCamera drives its own `LifecycleRegistry` from the `isActive` prop rather
 * than from the Activity's lifecycle, so the session itself survives the app
 * going to the background — this service is what makes the platform allow it.
 */
class SurveillanceService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: getString(R.string.app_name)
    val body = intent?.getStringExtra(EXTRA_BODY).orEmpty()

    createChannel()
    startForeground(NOTIFICATION_ID, buildNotification(title, body), foregroundTypes())
    isRunning = true

    // Deliberately not START_STICKY. The camera session lives in the React view
    // tree, so a service the system restarted on its own — with no Activity and
    // no JS context — would show a "surveillance active" notification while
    // recording nothing. Better to stay stopped and let the user restart it.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    isRunning = false
    super.onDestroy()
  }

  /**
   * Microphone is only declared when RECORD_AUDIO is actually granted: since
   * Android 14, starting a foreground service with a type whose permission is
   * missing throws SecurityException. Audio is optional in NovaGuard, so the
   * type set has to be decided at runtime rather than baked in.
   */
  private fun foregroundTypes(): Int {
    var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
    val micGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED
    if (micGranted) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    return types
  }

  private fun createChannel() {
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.surveillance_channel_name),
      // LOW: the notification has to exist for as long as the service runs, so
      // it must never make a sound or peek over what the user is doing.
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = getString(R.string.surveillance_channel_description)
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(title: String, body: String): Notification {
    val open = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pending = PendingIntent.getActivity(
      this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(pending)
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      // Surveillance footage is sensitive: keep the text off the lock screen.
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      .build()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"

    private const val CHANNEL_ID = "novaguard.surveillance"
    private const val NOTIFICATION_ID = 1001

    /**
     * Read from the JS side through the module. A plain flag is enough: the
     * service is a singleton and both writes happen on the main thread.
     */
    @Volatile
    var isRunning: Boolean = false
      private set

    fun start(context: Context, title: String, body: String) {
      val intent = Intent(context, SurveillanceService::class.java).apply {
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_BODY, body)
      }
      context.startForegroundService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, SurveillanceService::class.java))
    }
  }
}
