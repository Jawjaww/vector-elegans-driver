import { useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { pushDriverLocation } from '../lib/services/locationService';
import { useDriverStore } from '../lib/stores/driverStore';

const UPDATE_INTERVAL = 10000;
const MAX_RETRY = 3;

export function useDriverLocation(enabled: boolean) {
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastUpdate = useRef<number>(0);
  const retryCount = useRef<number>(0);

  const updateLocation = useCallback(async (position: Location.LocationObject) => {
    const now = Date.now();
    if (now - lastUpdate.current < UPDATE_INTERVAL) return;
    lastUpdate.current = now;

    const { coords } = position;
    const location = {
      lat: coords.latitude,
      lng: coords.longitude,
      heading: coords.heading,
      speed: coords.speed,
      accuracy: coords.accuracy,
    };

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
          void updateLocation(position);
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
  }, []);

  const updateLocationRef = useRef(updateLocation);
  updateLocationRef.current = updateLocation;

  useEffect(() => {
    if (!enabled) {
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
      return;
    }

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[Location] Permission denied');
        return;
      }

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: UPDATE_INTERVAL,
          distanceInterval: 10,
        },
        (position) => {
          void updateLocationRef.current(position);
        },
      );
    };

    void startTracking();

    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
  }, [enabled]);

  return { isTracking: watchRef.current !== null };
}
