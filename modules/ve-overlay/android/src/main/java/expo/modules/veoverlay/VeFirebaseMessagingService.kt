package expo.modules.veoverlay

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

private const val TAG = "VeOverlay"

/**
 * FCM entry point, declared for `com.google.firebase.MESSAGING_EVENT`.
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
      // Logged unconditionally, before any filtering. When several services
      // declare MESSAGING_EVENT only one is started, and Firebase documents that
      // the *first declared* wins — intent-filter priority is not a contract.
      // This line is the only reliable proof of which service is running: the
      // earlier filters never matched, so this service never logged anything.
      Log.i(TAG, "push received, data keys=${remoteMessage.data.keys}")

      val data = rideOfferData(remoteMessage)
      if (data != null) {
        VeOverlayController.onRideOfferPush(this, data, remoteMessage.messageId)
      }
    } catch (e: Exception) {
      // Never let an overlay failure swallow the notification itself.
      Log.w(TAG, "ride offer handling failed", e)
    }
    super.onMessageReceived(remoteMessage)
  }

  /**
   * Custom data of a ride-offer push, or null when the push is something else.
   *
   * Expo does **not** forward custom keys flat. `dispatch-push` goes through the
   * Expo Push API, which turns `title`/`message` into a real notification and
   * packs the custom data into `data["body"]` as a JSON string — the same
   * `dataString` the JS side parses back with `JSON.parse`. Testing
   * `data["type"]` directly therefore always yielded null, `onRideOfferPush` was
   * never called, and no launch was ever attempted: the notification stayed the
   * only path, which is why tapping it was required.
   *
   * The flat shape is kept as a fallback for a direct FCM send (no Expo in the
   * chain). A body that is absent or not a JSON object returns null rather than
   * throwing, so a malformed payload can never stop the notification.
   */
  private fun rideOfferData(remoteMessage: RemoteMessage): Map<String, String>? {
    val raw = remoteMessage.data
    val data = jsonObjectToMap(parseJsonObject(raw["body"])) ?: raw
    return if (data["type"] == "ride_offer") data else null
  }

  private fun parseJsonObject(value: String?): JSONObject? {
    if (value == null) return null
    return try {
      JSONObject(value)
    } catch (_: Exception) {
      null
    }
  }

  private fun jsonObjectToMap(json: JSONObject?): Map<String, String>? {
    if (json == null) return null
    return json.keys().asSequence().associateWith { json.optString(it) }
  }
}
