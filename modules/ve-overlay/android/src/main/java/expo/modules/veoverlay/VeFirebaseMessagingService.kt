package expo.modules.veoverlay

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

private const val TAG = "VeOverlay"

/** Enough of a rejected payload to identify its shape, not enough to fill the log. */
private const val MAX_LOGGED_BODY = 300

/**
 * FCM entry point, declared for `com.google.firebase.MESSAGING_EVENT`.
 *
 * The override decides *when* the tray entry appears, not whether it appears: the wake is
 * tried first, and `super` — the untouched Expo delegate — is called as soon as this service
 * knows no launch is coming. So nothing is ever dropped, and the notification stops being the
 * first way an offer reaches the driver.
 *
 * All of it has to be decided here. When a push wakes the app in the background, JS is never
 * consulted: `ExpoHandlingDelegate` only forwards to JS when the process is already in the
 * foreground, so a JS-side handler cannot bring the app forward.
 */
class VeFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val offer = try {
      VeOverlayController.start(this)
      // Unconditional, and before any parsing. This is the only line that can say the message
      // reached *this* service: when several services declare MESSAGING_EVENT only one is
      // started — the first declared, `android:priority` is not a contract — and the losers
      // leave no trace at all. Its absence is what proved the competitors had been winning;
      // its presence is what separates "our service ran and disagreed about the payload" from
      // "our service never ran", which no other observation can tell apart.
      VeOverlayController.recordDiagnostic(
        "fcm_received",
        "keys=${remoteMessage.data.keys.sorted().joinToString(",")}"
      )
      rideOfferData(remoteMessage)
    } catch (e: Exception) {
      Log.w(TAG, "ride offer lookup failed", e)
      null
    }

    if (offer == null) {
      // Received, but not recognised as a ride offer. Presenting it straight away is correct —
      // a message this service does not understand is not ours to hold back — but why it was
      // not recognised has to be readable, and the answer is always the shape of the payload.
      // That silence is exactly what a spent run was spent on.
      VeOverlayController.recordDiagnostic(
        "fcm_rejected",
        "body=${describeBody(remoteMessage)}"
      )
      super.onMessageReceived(remoteMessage)
      return
    }

    val wakeRequested = try {
      VeOverlayController.onRideOfferPush(this, offer, remoteMessage.messageId)
    } catch (e: Exception) {
      // Never let an overlay failure swallow the notification itself.
      Log.w(TAG, "ride offer handling failed", e)
      false
    }

    if (wakeRequested) {
      // Held back, not presented: the wake is in flight and the controller replays this very
      // message through Expo's own delegate if the app does not come forward.
      VeOverlayController.holdOfferPresentation(remoteMessage, offer["ride_id"])
    } else {
      // Nothing was attempted — offline, or the app is already on screen — so this
      // notification is the only thing carrying the offer and it must not wait.
      super.onMessageReceived(remoteMessage)
    }
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
    return if (isRideOffer(data)) data else null
  }

  /**
   * Whether a resolved payload is a ride offer.
   *
   * Deliberately the same rule as `isRideOfferPush` in
   * `src/lib/notifications/rideOfferPushContent.ts`, which accepts `type` **or** a non-empty
   * `ride_id`. Native used to require `type` alone while JS accepted either, so a payload
   * carrying only `ride_id` was opened by a tap and ignored by the wake — the two halves of
   * one pipeline disagreeing about what an offer is, with the notification as the only
   * surviving path and nothing in the log to say why.
   */
  private fun isRideOffer(data: Map<String, String>): Boolean =
    data["type"] == "ride_offer" || !data["ride_id"].isNullOrBlank()

  /**
   * The raw body of a rejected push, truncated.
   *
   * A rejected message used to leave no trace: the notification still appeared, so every
   * observation agreed with "it worked" and the one fact that explains it — the shape of the
   * payload — was the one fact missing. Bounded because this lands in SharedPreferences and
   * from there in `offer_pipeline_events`, where a whole Expo envelope is of no interest.
   */
  private fun describeBody(remoteMessage: RemoteMessage): String {
    val body = remoteMessage.data["body"] ?: return "absent"
    return if (body.length <= MAX_LOGGED_BODY) body else body.take(MAX_LOGGED_BODY) + "…"
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
