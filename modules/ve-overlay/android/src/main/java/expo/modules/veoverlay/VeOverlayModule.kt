package expo.modules.veoverlay

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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
  }
}
