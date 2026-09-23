package expo.modules.veoverlay

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Request code for the system ringtone picker.
 *
 * Ours to choose: `OnActivityResult` receives every result the host Activity reports, so the
 * code is the only thing that says which launch a result belongs to. Arbitrary but fixed, and
 * distinct from the codes Expo's own contracts use.
 */
private const val RINGTONE_PICK_REQUEST = 0x5E01

/**
 * Thin bridge over [VeOverlayController].
 *
 * The logic deliberately lives outside the React module: the interesting work
 * (return to the foreground, pill visibility) is driven by the FCM service and
 * the process lifecycle, both of which run when no React context exists.
 *
 * Every function swallows native failures on purpose. A throwing module Function
 * becomes a rejected JS promise, and an unhandled one is turned into a process
 * kill by expo-updates' ErrorRecovery — an overlay problem must never be able to
 * take the whole app down.
 */
class VeOverlayModule : Module() {
  /**
   * The ringtone pick the driver is waiting on, if any.
   *
   * `pickOfferSound` cannot answer synchronously: the picker is another Activity, and the
   * result arrives through `OnActivityResult`. Holding the promise is what turns that second
   * callback back into one JS answer. A single slot rather than a list, because a second launch
   * while one is open is refused rather than queued.
   */
  private var pendingSoundPick: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("VeOverlay")

    Function("hasPermission") {
      runCatching { appContext.reactContext?.let { VeOverlayController.hasPermission(it) } }
        .getOrNull() ?: false
    }

    /** Opens Settings > Special app access. The in-app rationale is shown by JS first. */
    Function("requestPermission") {
      runCatching { appContext.reactContext?.let { VeOverlayController.requestPermission(it) } }
      Unit
    }

    /**
     * Mirrors the driver's online state. The controller persists it so the pill
     * and the launch decision survive a process restart by an FCM push.
     */
    Function("setDriverOnline") { online: Boolean ->
      runCatching {
        appContext.reactContext?.let { VeOverlayController.setDriverOnline(it, online) }
      }.onFailure { Log.w("VeOverlay", "setDriverOnline failed", it) }
      Unit
    }

    /**
     * Payload of the offer push that woke the app, read once.
     *
     * Null on the tray path: a tapped notification brings its own response object, and a
     * second copy here would only risk surfacing the same offer twice.
     */
    Function("consumePendingOfferPush") {
      runCatching { VeOverlayController.consumePendingOfferPush() }.getOrNull()
    }

    /** Native decision log, oldest event first, cleared by the read. Never throws. */
    Function("drainDiagnostics") {
      runCatching { VeOverlayController.drainDiagnostics() }.getOrNull() ?: ""
    }

    /** Live native state: overlay permission, persisted online flag, pill visibility. */
    Function("describeState") {
      runCatching { VeOverlayController.describeState() }.getOrNull()
        ?: emptyMap<String, Boolean>()
    }

    /**
     * Play the offer ring, because a live offer is on screen and nothing else has sounded.
     *
     * The decision is JS's — see `src/lib/notifications/offerRing.ts`. It used to be taken in
     * Kotlin at the moment a launch was confirmed, which proves a wake but says nothing about
     * whether an offer is still there to answer.
     */
    Function("startOfferRing") {
      runCatching { VeOverlayController.startOfferRing() }
        .onFailure { Log.w("VeOverlay", "startOfferRing failed", it) }
      Unit
    }

    /**
     * Silence the offer ring, because the driver has answered it.
     *
     * The ring is bounded natively, so this is not what stops it from outliving the offer —
     * it is what makes the answer feel immediate instead of leaving the driver with a sound
     * they have already replied to.
     */
    Function("stopOfferRing") { reason: String ->
      runCatching { VeOverlayController.stopOfferRing(reason) }
        .onFailure { Log.w("VeOverlay", "stopOfferRing failed", it) }
      Unit
    }

    /**
     * The stored ringtone choice, as three distinguishable states.
     *
     * `configured` is carried alongside `uri` because "never chosen" and "chose None" both have
     * no URI, and the difference decides whether the system default is played or silence is
     * kept.
     */
    Function("getOfferSound") {
      val preference = runCatching { VeOverlayController.offerSoundPreference() }.getOrNull()
      mapOf(
        "configured" to (preference != null),
        "silent" to (preference != null && preference.isEmpty()),
        "uri" to (preference?.takeIf { it.isNotEmpty() })
      )
    }

    /**
     * Open the system ringtone picker and store the answer.
     *
     * The three outcomes are kept apart on purpose. A ROM without `ACTION_RINGTONE_PICKER`
     * raises `ActivityNotFoundException`, and a driver told nothing would conclude the row is
     * broken; a cancelled pick must leave the previous choice alone rather than being read as
     * "silent".
     */
    AsyncFunction("pickOfferSound") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || pendingSoundPick != null) {
        promise.resolve(mapOf("picked" to false, "reason" to "unavailable"))
        return@AsyncFunction
      }
      val intent = pickerIntent()
      pendingSoundPick = promise
      try {
        activity.startActivityForResult(intent, RINGTONE_PICK_REQUEST)
      } catch (e: ActivityNotFoundException) {
        // Some ROMs ship no ringtone picker at all. Reported so the driver is told, rather
        // than left with a row that does nothing.
        pendingSoundPick = null
        VeOverlayController.recordDiagnostic("sound_pick_unavailable", e.message ?: "no_picker")
        promise.resolve(mapOf("picked" to false, "reason" to "unavailable"))
      } catch (e: Exception) {
        pendingSoundPick = null
        VeOverlayController.recordDiagnostic("sound_pick_failed", e.message ?: "unknown")
        promise.resolve(mapOf("picked" to false, "reason" to "failed"))
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != RINGTONE_PICK_REQUEST) return@OnActivityResult
      val promise = pendingSoundPick ?: return@OnActivityResult
      pendingSoundPick = null
      if (payload.resultCode != Activity.RESULT_OK) {
        // Cancelled: the previous choice stands.
        promise.resolve(mapOf("picked" to false))
        return@OnActivityResult
      }
      val uri = pickedUri(payload.data)
      runCatching {
        // Choosing "None" comes back as a null URI, and it is stored as an empty value so it
        // reads back as `silent` and never as "no preference".
        VeOverlayController.setOfferSoundPreference(uri?.toString() ?: "")
      }.onFailure { Log.w("VeOverlay", "could not store the offer sound", it) }
      promise.resolve(mapOf("picked" to true, "uri" to uri?.toString()))
    }

    /** Go back to the system notification sound. */
    Function("resetOfferSound") {
      runCatching { VeOverlayController.clearOfferSoundPreference() }
        .onFailure { Log.w("VeOverlay", "resetOfferSound failed", it) }
      Unit
    }
  }

  /**
   * `ACTION_RINGTONE_PICKER`, restricted to the notification sound.
   *
   * Seeded with the current choice so the picker opens on it, and with `SHOW_DEFAULT` so the
   * system sound stays reachable — which is also the state a reset restores.
   */
  private fun pickerIntent(): Intent {
    val current = runCatching { VeOverlayController.offerSoundPreference() }.getOrNull()
    return Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
      putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION)
      putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Sonnerie d'offre")
      putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, true)
      putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
      current?.takeIf { it.isNotEmpty() }?.let {
        putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(it))
      }
    }
  }

  /**
   * The URI the picker returned, or null for "None".
   *
   * `EXTRA_RINGTONE_PICKED_URI` is read through the typed accessor on Android 13+, where the
   * untyped one is deprecated — and deprecated accessors are exactly the sort of thing that
   * starts returning null on a future target.
   */
  private fun pickedUri(intent: Intent?): Uri? {
    val key = RingtoneManager.EXTRA_RINGTONE_PICKED_URI
    if (intent == null) return null
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(key, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(key)
    }
  }
}
