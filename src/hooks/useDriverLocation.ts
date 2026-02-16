import { useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { useDriverStore } from '../lib/stores/driverStore';

const UPDATE_INTERVAL = 10000;
const MAX_RETRY = 3;

export function useDriverLocation(enabled: boolean) {
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastUpdate = useRef<number>(0);
  const retryCount = useRef(0);
  const { setCurrentLocation } = useDriverStore();

  const updateLocation = useCallback(
    async (position: Location.LocationObject) => {
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

      setCurrentLocation(location);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.from('driver_locations').upsert(
          {
            driver_id: user.id,
            lat: location.lat,
            lon: location.lng,
            heading: location.heading,
            speed: location.speed,
            accuracy: location.accuracy,
            is_online: true,
            recorded_at: new Date().toISOString(),
          },
          { onConflict: 'driver_id', ignoreDuplicates: false }
        );

        if (error && retryCount.current < MAX_RETRY) {
          retryCount.current++;
          setTimeout(() => {
            updateLocation(position);
          }, 1000 * retryCount.current);
        } else {
          retryCount.current = 0;
        }
      } catch (err) {
        console.error('[Location] Update failed:', err);
      }
    },
    [setCurrentLocation]
  );

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
          updateLocation(position);
        }
      );
    };

    startTracking();

    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
  }, [enabled, updateLocation]);

  return { isTracking: watchRef.current !== null };
}
