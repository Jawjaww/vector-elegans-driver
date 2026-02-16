import { useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useDriverStore } from '../lib/stores/driverStore';
import { rideService, type PendingRide } from '../services/rideService';
import { calculateDistance } from '../lib/utils/driverUtils';

const MAX_DISTANCE_KM = 20;

export function useRealtimeRides(onNewRide?: (ride: PendingRide) => void) {
  const { isOnline, currentLocation, setAvailableRide, availableRide } =
    useDriverStore();

  const handleNewRide = useCallback(
    (ride: PendingRide) => {
      if (availableRide) return;

      if (currentLocation && ride.pickupLat && ride.pickupLng) {
        const dist = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          ride.pickupLat,
          ride.pickupLng
        );
        if (dist > MAX_DISTANCE_KM) return;
      }

      setAvailableRide(ride);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onNewRide?.(ride);
    },
    [availableRide, currentLocation, setAvailableRide, onNewRide]
  );

  const handleRideUpdated = useCallback(
    (ride: PendingRide) => {
      if (availableRide?.id === ride.id) {
        setAvailableRide(ride);
      }
    },
    [availableRide, setAvailableRide]
  );

  const handleRideRemoved = useCallback(
    (rideId: string) => {
      if (availableRide?.id === rideId) {
        setAvailableRide(null);
      }
    },
    [availableRide, setAvailableRide]
  );

  useEffect(() => {
    if (!isOnline) {
      rideService.unsubscribe();
      return;
    }

    rideService.subscribeToPendingRides(
      handleNewRide,
      handleRideUpdated,
      handleRideRemoved
    );

    return () => {
      rideService.unsubscribe();
    };
  }, [isOnline, handleNewRide, handleRideUpdated, handleRideRemoved]);

  const acceptRide = useCallback(
    async (rideId: string) => {
      const result = await rideService.acceptRide(rideId);
      if (result.success) {
        const { availableRide } = useDriverStore.getState();
        useDriverStore.setState({
          activeRide: availableRide,
          availableRide: null,
        });
      }
      return result;
    },
    []
  );

  const declineRide = useCallback(() => {
    setAvailableRide(null);
  }, [setAvailableRide]);

  return {
    acceptRide,
    declineRide,
    hasPendingRide: !!availableRide,
  };
}
