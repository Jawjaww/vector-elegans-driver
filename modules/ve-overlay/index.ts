import { requireOptionalNativeModule } from 'expo';

/**
 * Native surface of the Android overlay module (`modules/ve-overlay`).
 *
 * Small on purpose: the return to the foreground and the pill's visibility are
 * decided in Kotlin, because they must run when a push arrives with no JS
 * running. There is nothing here to trigger a launch — the FCM service does it.
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
  /**
   * Mirrors the driver's online state. The native side persists it and derives
   * the pill's visibility from it, so this is the only input it needs.
   */
  setDriverOnline(online: boolean): void;
  /**
   * Payload of the offer push that woke the app, read once.
   *
   * A silent wake resumes the launcher activity, which carries no extras and produces no
   * `NotificationResponse`: without this the ride would have to be rediscovered by the
   * dashboard boot. Null on the tray path, where the response object already carries it.
   */
  consumePendingOfferPush(): Record<string, string> | null;
  /** Native decision log since the last read, oldest first, one `timestamp|event|detail` per line. */
  drainDiagnostics(): string;
  /** Live native state: overlay permission, persisted online flag, pill visibility. */
  describeState(): Record<string, boolean>;
};

export default requireOptionalNativeModule<VeOverlayNativeModule>('VeOverlay');
