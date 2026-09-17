import { AppState, Platform, type AppStateStatus } from 'react-native';
import VeOverlay, { type VeOverlayNativeModule } from '../../../modules/ve-overlay';
import { useDriverStore } from '../stores/driverStore';
import { canLaunchAppFromBackground, shouldShowOverlayBubble } from './overlayPolicy';

const nativeModule = VeOverlay;

/** The native module only ships on Android; everywhere else every call is inert. */
function overlayModule(): VeOverlayNativeModule | null {
  return Platform.OS === 'android' ? nativeModule : null;
}

export function isOverlaySupported(): boolean {
  return overlayModule() != null;
}

export function hasOverlayPermission(): boolean {
  const module = overlayModule();
  if (!module) return false;
  return module.hasPermission();
}

/** Sends the driver to Settings > Special app access. Always preceded by an
 *  in-app rationale — Google Play requires the explanation before the redirect. */
export function requestOverlayPermission(): void {
  overlayModule()?.requestPermission();
}

export type OverlayState = {
  supported: boolean;
  permissionGranted: boolean;
  bubbleVisible: boolean;
};

export function readOverlayState(): OverlayState {
  const module = overlayModule();
  if (!module) {
    return { supported: false, permissionGranted: false, bubbleVisible: false };
  }
  return {
    supported: true,
    permissionGranted: module.hasPermission(),
    bubbleVisible: module.isBubbleVisible(),
  };
}

/**
 * Reconciles the pill with the driver's online state. Idempotent, and safe to
 * call from anywhere — each call re-reads the permission, so a revocation made
 * in Settings heals on the next pass.
 */
export function syncOverlayBubble(): void {
  const module = overlayModule();
  if (!module) return;

  const shouldShow = shouldShowOverlayBubble({
    platform: Platform.OS,
    moduleAvailable: true,
    permissionGranted: module.hasPermission(),
    isOnline: useDriverStore.getState().isOnline,
  });

  if (shouldShow) {
    if (!module.isBubbleVisible()) module.showBubble();
    return;
  }
  // Unconditional: hideBubble is a no-op when nothing is attached, and this also
  // clears the native state when the system dropped the window on revocation.
  module.hideBubble();
}

/**
 * Asks the OS to bring the app forward when an offer arrives while the driver is
 * elsewhere. Returns false when the platform declined — the caller keeps the
 * notification as the fallback path.
 */
export function bringAppToForeground(): boolean {
  const module = overlayModule();
  if (!module) return false;

  const allowed = canLaunchAppFromBackground({
    platform: Platform.OS,
    moduleAvailable: true,
    permissionGranted: module.hasPermission(),
    bubbleVisible: module.isBubbleVisible(),
  });
  if (!allowed) return false;

  return module.bringToForeground();
}

let lifecycleStarted = false;

/**
 * Started once from the root layout, so the pill follows the online state even
 * when the dashboard is not mounted.
 */
export function startOverlayLifecycle(): void {
  if (lifecycleStarted || !isOverlaySupported()) return;
  lifecycleStarted = true;

  syncOverlayBubble();

  useDriverStore.subscribe((state, previous) => {
    if (state.isOnline !== previous.isOnline) syncOverlayBubble();
  });

  AppState.addEventListener('change', (next: AppStateStatus) => {
    // Coming back from the Settings screen is the moment the permission may
    // have changed.
    if (next === 'active') syncOverlayBubble();
  });
}
