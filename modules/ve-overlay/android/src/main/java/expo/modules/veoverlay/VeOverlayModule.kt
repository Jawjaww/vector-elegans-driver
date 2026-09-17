package expo.modules.veoverlay

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Thin bridge over [VeOverlayController].
 *
 * The logic deliberately lives outside the React module: the interesting work
 * (return to the foreground, pill visibility) is driven by the FCM service and
 * the process lifecycle, both of which run when no React context exists.
 */
class VeOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VeOverlay")

    Function("hasPermission") {
      appContext.reactContext?.let { VeOverlayController.hasPermission(it) } ?: false
    }

    /** Opens Settings > Special app access. The in-app rationale is shown by JS first. */
    Function("requestPermission") {
      appContext.reactContext?.let { VeOverlayController.requestPermission(it) }
      Unit
    }

    /**
     * Mirrors the driver's online state. The controller persists it so the pill
     * and the launch decision survive a process restart by an FCM push.
     */
    Function("setDriverOnline") { online: Boolean ->
      appContext.reactContext?.let { VeOverlayController.setDriverOnline(it, online) }
      Unit
    }
  }
}
