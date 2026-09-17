/**
 * Pure gates for the Android overlay pill.
 *
 * Kept free of imports so the decision rules can be unit-tested, and so the
 * native module is never touched from a render path.
 */

/** Why the pill exists: Android blocks background activity launches, and a
 *  visible overlay window is one of the documented exemptions. */
export type OverlayBubbleContext = {
  /** `Platform.OS` — the module only ships on Android. */
  platform: string;
  /** False when the native module is absent (iOS, or a build without it). */
  moduleAvailable: boolean;
  /** "Display over other apps" was granted by the user. */
  permissionGranted: boolean;
  /** Driver is online, i.e. able to receive offers. */
  isOnline: boolean;
};

/** Preconditions the platform checks before honouring a background launch. */
export type OverlayLaunchContext = {
  platform: string;
  moduleAvailable: boolean;
  permissionGranted: boolean;
  /** The overlay must be on screen right now — a granted permission is not enough. */
  bubbleVisible: boolean;
};

/**
 * The pill mirrors the driver's online state: online means reachable, so the
 * affordance is on screen; offline means no offers, so it is not.
 */
export function shouldShowOverlayBubble(context: OverlayBubbleContext): boolean {
  if (context.platform !== 'android') return false;
  if (!context.moduleAvailable) return false;
  if (!context.permissionGranted) return false;
  return context.isOnline;
}

/**
 * Android only allows the launch when the app both holds the permission and is
 * currently displaying a visible overlay window. Requesting the launch while
 * the pill is hidden is silently refused by the platform, so we do not try.
 */
export function canLaunchAppFromBackground(context: OverlayLaunchContext): boolean {
  if (context.platform !== 'android') return false;
  if (!context.moduleAvailable) return false;
  if (!context.permissionGranted) return false;
  return context.bubbleVisible;
}
