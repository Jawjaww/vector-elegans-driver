package expo.modules.veoverlay

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * FCM entry point, declared with a higher priority than expo-notifications' own
 * service so it is the one Firebase resolves for MESSAGING_EVENT.
 *
 * The override only *adds* behaviour: `super` still runs the untouched Expo
 * delegate, so the notification is presented exactly as before. What it enables
 * is the background activity launch, which has to be decided here — when a push
 * wakes the app in the background, JS is never consulted.
 *
 * Deliberate ordering: the controller runs first, so the launch and Expo's
 * asynchronous presentation are both in flight when the app resumes, and the
 * notification can then be withdrawn.
 */
class VeFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    try {
      if (isRideOffer(remoteMessage.data)) {
        VeOverlayController.onRideOfferPush(
          this,
          remoteMessage.data,
          remoteMessage.messageId
        )
      }
    } catch (e: Exception) {
      // Never let an overlay failure swallow the notification itself.
      Log.w("VeOverlay", "ride offer handling failed", e)
    }
    super.onMessageReceived(remoteMessage)
  }

  private fun isRideOffer(data: Map<String, String>): Boolean =
    data["type"] == "ride_offer"
}
