/**
 * Pure gates for the Android overlay.
 *
 * Kept free of imports so the decision rules can be unit-tested, and so the
 * native module is never touched from a render path.
 *
 * What is *not* here anymore: bubble visibility and the return to the
 * foreground. Both are decided in Kotlin, because they must run when an FCM
 * push arrives with no JS running — a JS gate would never be consulted.
 */

/**
 * The overlay only exists on Android, and only in a binary that carries the
 * native module. `requireOptionalNativeModule` yields null on iOS and on any
 * binary predating the module, which is what makes an OTA without a rebuild
 * inert rather than fatal.
 */
export function isOverlayAvailable(
  platform: string,
  moduleAvailable: boolean,
): boolean {
  return platform === 'android' && moduleAvailable;
}
