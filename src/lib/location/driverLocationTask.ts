/**
 * Native background location while the driver is online.
 * TaskManager.defineTask must load at app startup (imported from _layout).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
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

export async function startDriverBackgroundLocation(opts: {
  highAccuracy: boolean;
}): Promise<boolean> {
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== 'granted') return false;

  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
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
  return true;
}

export async function stopDriverBackgroundLocation(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  }
}
