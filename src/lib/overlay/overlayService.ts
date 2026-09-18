import { Platform } from 'react-native';
import VeOverlay, { type VeOverlayNativeModule } from '../../../modules/ve-overlay';
import { useDriverStore } from '../stores/driverStore';
import { isOverlayAvailable } from './overlayPolicy';

const nativeModule = VeOverlay;

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
