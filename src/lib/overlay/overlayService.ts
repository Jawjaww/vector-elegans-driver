import { Platform } from 'react-native';
import VeOverlay, { type VeOverlayNativeModule } from '../../../modules/ve-overlay';
import { useDriverStore } from '../stores/driverStore';
import { isOverlayAvailable } from './overlayPolicy';
import {
  classifyOfferSoundPick,
  offerSoundStateFromNative,
  type OfferSoundPickResult,
  type OfferSoundState,
} from '../notifications/offerSound';

const nativeModule = VeOverlay;

/**
 * How long to wait for the ringtone picker before giving up.
 *
 * The result arrives through a second native callback, and expo-modules-core documents that a
 * callback is lost when the host Activity is destroyed mid-pick. Without a bound, the promise
 * would simply never settle and every caller awaiting it would be stuck for the life of the
 * runtime. Long enough that a driver deliberating in the picker is never cut off.
 */
const OFFER_SOUND_PICK_TIMEOUT_MS = 120_000;

/** The native module only ships on Android; everywhere else every call is inert. */
function overlayModule(): VeOverlayNativeModule | null {
  return isOverlayAvailable(Platform.OS, nativeModule != null) ? nativeModule : null;
}

export function isOverlaySupported(): boolean {
  return overlayModule() != null;
}

export function hasOverlayPermission(): boolean {
  const module = overlayModule();
  if (!module) return false;
  try {
    return module.hasPermission();
  } catch {
    return false;
  }
}

/** Sends the driver to Settings > Special app access. Always preceded by an
 *  in-app rationale — Google Play requires the explanation before the redirect. */
export function requestOverlayPermission(): void {
  try {
    overlayModule()?.requestPermission();
  } catch {
    // Inert: the notification path still delivers offers.
  }
}

/**
 * Publishes the driver's online state to the native side, which owns everything
 * downstream: the pill appears when the app goes away while online, and an
 * incoming offer brings the app back instead of staying a notification.
 *
 * The native side persists the value, so it keeps working after a process
 * restart by an FCM push — when this function never ran.
 *
 * Never throws. A native rejection here rejects the JS call, and expo-updates'
 * ErrorRecovery turns an unhandled rejection into a process kill — which is how
 * an overlay bug once became a force close on every launch.
 */
export function setDriverOnline(online: boolean): void {
  try {
    overlayModule()?.setDriverOnline(online);
  } catch {
    // Overlay inactive; offers keep arriving through notifications.
  }
}

/**
 * Payload of the offer push that woke the app, read once, or null on the tray path.
 *
 * A silent wake resumes the launcher activity without producing a `NotificationResponse`, so
 * this is the only thing that carries the ride. Read on mount and on every return to the
 * foreground; null is the normal answer when the app was opened any other way.
 */
export function consumeNativeOfferPush(): Record<string, string> | null {
  const module = overlayModule();
  if (!module) return null;
  try {
    return module.consumePendingOfferPush();
  } catch {
    return null;
  }
}

/** Native decision log since the last read. Empty when the overlay is unsupported. */
export function drainOverlayDiagnostics(): string {
  const module = overlayModule();
  if (!module) return '';
  try {
    return module.drainDiagnostics();
  } catch {
    return '';
  }
}

/** Live native state, or null when the overlay is unsupported. */
export function getOverlayState(): Record<string, boolean> | null {
  const module = overlayModule();
  if (!module) return null;
  try {
    return module.describeState();
  } catch {
    return null;
  }
}

/**
 * Silence the offer ring, because the driver has answered it.
 *
 * Only meaningful on the wake path: an offer that arrived as a notification carries its own
 * sound, and there is nothing here to stop. The native side bounds the ring to the front
 * card's countdown anyway, so a call that never happens costs at most a few seconds of sound —
 * which is why it stays best-effort and never throws.
 */
export function stopOfferRing(reason: string): void {
  try {
    overlayModule()?.stopOfferRing(reason);
  } catch {
    // Overlay inactive; the ring is not playing either.
  }
}

/**
 * Play the offer ring.
 *
 * Called once a live offer is painted and the arrival is known to be a silent wake; the gate
 * that decides is `resolveOfferRingAction` in `src/lib/notifications/offerRing.ts`. Keeping the
 * decision in JS is what stops the ring from sounding for an offer that is dead, for a tray tap,
 * or for a driver who opened the app themselves.
 */
export function ringOffer(): void {
  try {
    overlayModule()?.startOfferRing();
  } catch {
    // Overlay inactive; the notification path still carries its own sound.
  }
}

/** The driver's stored ringtone choice, or the system default when nothing was chosen. */
export function getOfferSound(): OfferSoundState {
  const module = overlayModule();
  if (!module) return { kind: 'default' };
  try {
    return offerSoundStateFromNative(module.getOfferSound());
  } catch {
    return { kind: 'default' };
  }
}

/** Go back to the system notification sound. Inert without the native module. */
export function resetOfferSound(): void {
  try {
    overlayModule()?.resetOfferSound();
  } catch {
    // Overlay inactive; there is no stored preference to clear.
  }
}

/**
 * Open the system ringtone picker and store whatever the driver chose.
 *
 * Never rejects and always settles: `unavailable` is a legitimate answer for the ROMs that ship
 * no picker, and a picker whose result never arrives is cut off by the timeout rather than
 * leaving the caller waiting forever.
 */
export async function pickOfferSound(): Promise<OfferSoundPickResult> {
  const module = overlayModule();
  if (!module) return { outcome: 'unavailable' };
  try {
    const raw = await Promise.race([
      module.pickOfferSound(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), OFFER_SOUND_PICK_TIMEOUT_MS),
      ),
    ]);
    if (raw === null) return { outcome: 'cancelled' };
    return classifyOfferSoundPick(raw);
  } catch {
    return { outcome: 'unavailable' };
  }
}

let lifecycleStarted = false;

/** Started once from the root layout so the online state is mirrored even when
 *  the dashboard is not mounted. */
export function startOverlayLifecycle(): void {
  if (lifecycleStarted || !isOverlaySupported()) return;
  lifecycleStarted = true;

  setDriverOnline(useDriverStore.getState().isOnline);

  useDriverStore.subscribe((state, previous) => {
    if (state.isOnline !== previous.isOnline) setDriverOnline(state.isOnline);
  });
}
