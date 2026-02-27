import { useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useDriverStore, Ride } from '../lib/stores/driverStore';
import { rideService, type PendingRide } from '../services/rideService';
import { calculateDistance } from '../lib/utils/driverUtils';

const MAX_DISTANCE_KM = 20;

const mapPendingRideToStoreRide = (ride: PendingRide): Ride => ({
  id: ride.id,
  user_id: ride.clientId || '',
  status: ride.status,
  pickup_address: ride.pickupLocation,
  pickup_lat: ride.pickupLat,
  pickup_lon: ride.pickupLng,
  dropoff_address: ride.dropoffLocation,
  dropoff_lat: ride.dropoffLat,
  dropoff_lon: ride.dropoffLng,
  pickup_time: ride.pickupTime || '',
  distance: ride.estimatedDistance,
  duration: ride.estimatedDuration,
  vehicle_type: ride.vehicleType,
  estimated_price: ride.estimatedPrice,
  final_price: ride.finalPrice,
  created_at: ride.createdAt,
  updated_at: new Date().toISOString(),
  options: ride.options
});

export function useRealtimeRides(onNewRide?: (ride: PendingRide) => void) {
  const { isOnline, currentLocation, setAvailableRide, availableRide, hasSeenRide } =
    useDriverStore();

  const handleNewRide = useCallback(
    (ride: PendingRide) => {
      if (availableRide || hasSeenRide) return; // Stop if already showing or has seen one

      if (currentLocation && ride.pickupLat && ride.pickupLng) {
        const dist = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          ride.pickupLat,
          ride.pickupLng
        );
        if (dist > MAX_DISTANCE_KM) return;
      }

      setAvailableRide(mapPendingRideToStoreRide(ride));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onNewRide?.(ride);
    },
    [availableRide, hasSeenRide, currentLocation, setAvailableRide, onNewRide]
  );

  const handleRideUpdated = useCallback(
    (ride: PendingRide) => {
      if (availableRide?.id === ride.id) {
        setAvailableRide(mapPendingRideToStoreRide(ride));
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
