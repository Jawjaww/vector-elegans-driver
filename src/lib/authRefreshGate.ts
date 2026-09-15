import type { AppStateStatus } from 'react-native';

let keepAlive = false;

/** Location FGS needs a live JWT while the UI is backgrounded. */
export function setAuthRefreshKeepAlive(enabled: boolean): void {
  keepAlive = enabled;
}

export function getAuthRefreshKeepAlive(): boolean {
  return keepAlive;
}

export function shouldKeepAuthRefresh(
  appState: AppStateStatus,
  keepAliveFlag: boolean = keepAlive,
): boolean {
  return keepAliveFlag || appState === 'active';
}

/** True when the access token is missing or expires within `skewMs`. */
export function sessionAccessTokenIsExpiring(
  expiresAtUnixSec: number | undefined,
  nowMs: number = Date.now(),
  skewMs: number = 60_000,
): boolean {
  if (expiresAtUnixSec == null) return true;
  return expiresAtUnixSec * 1000 <= nowMs + skewMs;
}
