/**
 * Native background location while the driver is online.
 * TaskManager.defineTask must load at app startup (imported from _layout).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { setAuthRefreshKeepAlive, sessionAccessTokenIsExpiring } from '../authRefreshGate';
import { supabase } from '../supabase';
import { pushDriverLocation } from '../services/locationService';

export const DRIVER_LOCATION_TASK = 'VE_DRIVER_LOCATION';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

if (!TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)) {
  TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[Location] background task', error.message);
      return;
    }
    const locations = (data as LocationTaskData | undefined)?.locations;
    const last = locations?.at(-1);
    if (!last) return;
    const authed = await ensureFreshAuthSession();
    if (!authed) {
      console.warn('[Location] background push skipped: no session');
      return;
    }
    const { error: rpcError } = await pushDriverLocation({
      lat: last.coords.latitude,
      lng: last.coords.longitude,
      heading: last.coords.heading,
      speed: last.coords.speed,
      accuracy: last.coords.accuracy,
    });
    if (rpcError) {
      console.warn('[Location] background push failed:', rpcError.message);
    }
  });
}

export async function requestDriverBackgroundLocation(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

/** Refresh JWT in the headless task — autoRefresh is paused while UI is backgrounded. */
export async function ensureFreshAuthSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return false;
  if (!sessionAccessTokenIsExpiring(data.session.expires_at)) return true;
  const { error: refreshError } = await supabase.auth.refreshSession();
  return !refreshError;
}

export async function startDriverBackgroundLocation(opts: {
  highAccuracy: boolean;
  /** Stop and restart when accuracy / interval must change (assigned trip). */
  replaceExisting?: boolean;
}): Promise<boolean> {
  const running = await Location.hasStartedLocationUpdatesAsync(
    DRIVER_LOCATION_TASK,
  );
  if (running && !opts.replaceExisting) {
    setAuthRefreshKeepAlive(true);
    void supabase.auth.startAutoRefresh();
    return true;
  }

  const allowed = await requestDriverBackgroundLocation();
  if (!allowed) {
    console.warn(
      '[Location] Always permission missing — GPS will go stale in background',
    );
    return false;
  }

  if (running) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  }

  await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
    accuracy: opts.highAccuracy
      ? Location.Accuracy.High
      : Location.Accuracy.Balanced,
    timeInterval: opts.highAccuracy ? 10_000 : 45_000,
    distanceInterval: opts.highAccuracy ? 10 : 80,
    deferredUpdatesInterval: opts.highAccuracy ? 10_000 : 45_000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Vector Elegans',
      notificationBody: 'Position partagée pour recevoir des courses',
      notificationColor: '#171717',
    },
  });
  setAuthRefreshKeepAlive(true);
  void supabase.auth.startAutoRefresh();
  return true;
}

export async function stopDriverBackgroundLocation(): Promise<void> {
  setAuthRefreshKeepAlive(false);
  if (AppState.currentState !== 'active') {
    void supabase.auth.stopAutoRefresh();
  }
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  }
}
