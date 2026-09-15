import type { AppStateStatus } from 'react-native';

export type IncomingPushPresentation = {
  shouldShowAlert: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
  shouldShowBanner: boolean;
  shouldShowList: boolean;
};

const SHOW: IncomingPushPresentation = {
  shouldShowAlert: true,
  shouldPlaySound: true,
  shouldSetBadge: true,
  shouldShowBanner: true,
  shouldShowList: true,
};

export const SUPPRESS_INCOMING_PUSH: IncomingPushPresentation = {
  shouldShowAlert: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
};

/**
 * Ride-offer heads-up must show even when JS is still running.
 * Android location foreground service keeps the process alive, and AppState
 * can stay `active` while the driver is on the Home screen — suppressing
 * the tray then swallows FCM.
 */
export function presentationForIncomingPush(
  appState: AppStateStatus,
  data: Record<string, unknown>,
): IncomingPushPresentation {
  const type = typeof data.type === 'string' ? data.type : null;
  if (type === 'ride_offer') return SHOW;
  if (appState === 'active') return SUPPRESS_INCOMING_PUSH;
  return SHOW;
}
