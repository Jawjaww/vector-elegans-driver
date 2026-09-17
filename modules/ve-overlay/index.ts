import { requireOptionalNativeModule } from 'expo';

/**
 * Native surface of the Android overlay module (`modules/ve-overlay`).
 *
 * All methods are no-ops on iOS: the module declares `"platforms": ["android"]`,
 * so `requireOptionalNativeModule` returns null there and every caller must
 * treat a null module as "overlay unsupported".
 */
export type VeOverlayNativeModule = {
  /** True when the user granted "Display over other apps". */
  hasPermission(): boolean;
  /** Opens the system Special app access screen for this app. */
  requestPermission(): void;
  /** Shows the pill. No-op when the permission is missing. */
  showBubble(): void;
  /** Removes the pill. */
  hideBubble(): void;
  /** True while the pill is attached to the window manager. */
  isBubbleVisible(): boolean;
  /** Requests a background activity launch. False when the OS refused it. */
  bringToForeground(): boolean;
};

export default requireOptionalNativeModule<VeOverlayNativeModule>('VeOverlay');
