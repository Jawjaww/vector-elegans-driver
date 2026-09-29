package expo.modules.veoverlay

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Parcel
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.notifications.model.Notification as ExpoNotification
import expo.modules.notifications.notifications.model.NotificationAction
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.model.NotificationResponse
import expo.modules.notifications.notifications.model.RemoteNotificationContent
import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger
import expo.modules.notifications.notifications.presentation.builders.ExpoNotificationBuilder
import expo.modules.notifications.service.NotificationsService
import org.json.JSONObject
import java.util.Date
import java.util.UUID

private const val TAG = "VeOverlay"

/** Same id as `RIDES_PUSH_CHANNEL_ID` in `pushRegistration.ts` (importance MAX / heads-up). */
private const val RIDES_PUSH_CHANNEL_ID = "rides"
private const val RIDES_PUSH_CHANNEL_NAME = "Offres de course"

/**
 * Offline pipeline: heads-up on the rides channel, no activity launch.
 *
 * Kept out of [VeOverlayController] so a failure to resolve these notification types
 * cannot take the silent online wake down with it. Expo's `receive`/`present` path is
 * a broadcast plus an IO coroutine. When FCM starts the process from a killed app,
 * `onMessageReceived` returning stops the service and Android kills the process — the
 * banner never posts. `NotificationManager.notify` on this thread is the tray entry;
 * the Expo PendingIntent is how a tap still opens the offer card.
 */
object OfflineOfferNotifier {
  fun present(
    context: Context,
    remoteMessage: RemoteMessage,
    offer: Map<String, String>,
  ) {
    ensureRidesChannel(context)
    val headsUp = remoteMessageWithHeadsUpData(remoteMessage, offer)
    val rideId = offer["ride_id"]
    val identifier = headsUp.data["tag"]
      ?: rideId?.takeIf { it.isNotBlank() }?.let { "ride-offer-$it" }
      ?: UUID.randomUUID().toString()
    val content = RemoteNotificationContent(headsUp)
    val request = NotificationRequest(
      identifier,
      content,
      FirebaseNotificationTrigger(headsUp),
    )
    val expoNotification = ExpoNotification(request, Date())
    val title = content.title?.takeIf { it.isNotBlank() } ?: "Nouvelle course"
    val text = content.text?.takeIf { it.isNotBlank() } ?: "Appuyez pour accepter"
    val builder = NotificationCompat.Builder(context, RIDES_PUSH_CHANNEL_ID)
      .setSmallIcon(notificationSmallIcon(context))
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    content.body?.let { json ->
      val extras = builder.extras
      extras.putString(ExpoNotificationBuilder.EXTRAS_BODY_KEY, json.toString())
      builder.setExtras(extras)
    }
    marshallNotificationRequest(request)?.let { bytes ->
      builder.addExtras(
        Bundle().apply {
          putByteArray(
            ExpoNotificationBuilder.EXTRAS_MARSHALLED_NOTIFICATION_REQUEST_KEY,
            bytes,
          )
        },
      )
    }
    val defaultAction = NotificationAction(
      NotificationResponse.DEFAULT_ACTION_IDENTIFIER,
      null,
      true,
    )
    builder.setContentIntent(
      NotificationsService.createNotificationResponseIntent(
        context,
        expoNotification,
        defaultAction,
      ),
    )
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(identifier, 0, builder.build())
    VeOverlayController.recordDiagnostic("offline_heads_up", "ride_id=$rideId")
  }

  /**
   * Copy of [remoteMessage] with tray fields on the flat data map and inside `body` JSON.
   */
  private fun remoteMessageWithHeadsUpData(
    remoteMessage: RemoteMessage,
    offer: Map<String, String>,
  ): RemoteMessage {
    val builder = RemoteMessage.Builder(remoteMessage.from ?: "ve-overlay")
    for ((key, value) in remoteMessage.data) {
      builder.addData(key, value)
    }
    val title = offer["title"]?.takeIf { it.isNotBlank() } ?: "Nouvelle course"
    val message = offer["message"]?.takeIf { it.isNotBlank() }
      ?: offer["body"]?.takeIf { it.isNotBlank() }
      ?: "Appuyez pour accepter"
    val channelId = offer["channelId"]?.takeIf { it.isNotBlank() } ?: RIDES_PUSH_CHANNEL_ID
    val rideId = offer["ride_id"]
    val bodyJson = try {
      remoteMessage.data["body"]?.let { JSONObject(it) } ?: JSONObject()
    } catch (_: Exception) {
      JSONObject()
    }
    for ((key, value) in offer) {
      if (value.isNotBlank()) bodyJson.put(key, value)
    }
    bodyJson.put("title", title)
    bodyJson.put("message", message)
    bodyJson.put("channelId", channelId)
    if (!rideId.isNullOrBlank()) {
      bodyJson.put("ride_id", rideId)
      bodyJson.put("type", offer["type"]?.takeIf { it.isNotBlank() } ?: "ride_offer")
    }
    builder.addData("title", title)
    builder.addData("message", message)
    builder.addData("channelId", channelId)
    builder.addData("body", bodyJson.toString())
    if (!rideId.isNullOrBlank() && remoteMessage.data["tag"].isNullOrBlank()) {
      builder.addData("tag", "ride-offer-$rideId")
    }
    return builder.build()
  }

  private fun marshallNotificationRequest(request: NotificationRequest): ByteArray? {
    return try {
      val parcel = Parcel.obtain()
      request.writeToParcel(parcel, 0)
      val bytes = parcel.marshall()
      parcel.recycle()
      bytes
    } catch (e: Exception) {
      Log.w(TAG, "could not marshall offer notification request", e)
      null
    }
  }

  private fun notificationSmallIcon(context: Context): Int {
    return try {
      val info = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA,
      )
      val fromMeta = info.metaData?.getInt(
        ExpoNotificationBuilder.META_DATA_DEFAULT_ICON_KEY,
        0,
      ) ?: 0
      if (fromMeta != 0) fromMeta else context.applicationInfo.icon
    } catch (_: Exception) {
      context.applicationInfo.icon
    }
  }

  /**
   * Create the rides channel only when JS has never done it (fresh process, killed app).
   * Do not recreate: deleting a channel resets the driver's per-channel sound and
   * importance, which is how a heads-up silently became a shade entry.
   */
  private fun ensureRidesChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      ?: return
    if (manager.getNotificationChannel(RIDES_PUSH_CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      RIDES_PUSH_CHANNEL_ID,
      RIDES_PUSH_CHANNEL_NAME,
      NotificationManager.IMPORTANCE_HIGH,
    )
    channel.description = "Nouvelles courses à accepter sur Vector Elegans"
    channel.enableVibration(true)
    manager.createNotificationChannel(channel)
  }
}
