import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import {
  pushDriverLocation,
  type DriverLocationPayload,
} from '../lib/services/locationService';
import { useDriverStore } from '../lib/stores/driverStore';
import {
  startDriverBackgroundLocation,
  stopDriverBackgroundLocation,
} from '../lib/location/driverLocationTask';

const UPDATE_INTERVAL = 10000;
/** Foreground fallback when Always permission is denied (dispatcher max age is 15 min). */
const HEARTBEAT_INTERVAL = 15000;
const MAX_RETRY = 3;

function payloadFromCoords(
  coords: Location.LocationObjectCoords,
): DriverLocationPayload {
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    heading: coords.heading,
    speed: coords.speed,
    accuracy: coords.accuracy,
  };
}

export function useDriverLocation(enabled: boolean) {
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastUpdate = useRef<number>(0);
  const retryCount = useRef<number>(0);
  const onTrip = useDriverStore((s) => Boolean(s.activeRide));

  const syncPayload = useCallback(
    async (location: DriverLocationPayload, force: boolean) => {
      const now = Date.now();
      if (!force && now - lastUpdate.current < UPDATE_INTERVAL) return;
      lastUpdate.current = now;

      useDriverStore.getState().setCurrentLocation(location);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { error: rpcError } = await pushDriverLocation(location);

        if (rpcError && retryCount.current < MAX_RETRY) {
          retryCount.current++;
          setTimeout(() => {
            void syncPayload(location, true);
          }, 1000 * retryCount.current);
        } else {
          retryCount.current = 0;
          if (rpcError) {
            console.error('[Location] update_driver_location failed:', rpcError);
          }
        }
      } catch (err) {
        console.error('[Location] Update failed:', err);
      }
    },
    [],
  );

  const syncPayloadRef = useRef(syncPayload);
  syncPayloadRef.current = syncPayload;

  useEffect(() => {
    if (!enabled) {
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
      void stopDriverBackgroundLocation();
      return;
    }

    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

    const runHeartbeat = async () => {
      if (cancelled) return;
      try {
        const last = await Location.getLastKnownPositionAsync();
        const position =
          last ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));
        if (cancelled || !position) return;
        await syncPayloadRef.current(payloadFromCoords(position.coords), true);
      } catch (err) {
        const stored = useDriverStore.getState().currentLocation;
        if (stored && !cancelled) {
          await syncPayloadRef.current(stored, true);
          return;
        }
        console.warn('[Location] Heartbeat failed:', err);
      }
    };

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runHeartbeat();
      }
    });

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) {
        if (status !== 'granted') {
          console.warn('[Location] Permission denied');
        }
        return;
      }

      await startDriverBackgroundLocation({ highAccuracy: onTrip });

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: UPDATE_INTERVAL,
          distanceInterval: 0,
        },
        (position) => {
          void syncPayloadRef.current(payloadFromCoords(position.coords), false);
        },
      );

      await runHeartbeat();
      if (cancelled) return;
      heartbeatTimer = setInterval(() => {
        void runHeartbeat();
      }, HEARTBEAT_INTERVAL);
    };

    void startTracking();

    return () => {
      cancelled = true;
      appSub.remove();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
      void stopDriverBackgroundLocation();
    };
  }, [enabled, onTrip]);

  return { isTracking: watchRef.current !== null };
}
