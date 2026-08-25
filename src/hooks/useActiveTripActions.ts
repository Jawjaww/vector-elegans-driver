import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useDriverStore, type Ride } from '../lib/stores/driverStore';
import { rideService } from '../services/rideService';
import type { NavDestination } from '../lib/utils/externalNavigation';

export function useActiveTripActions() {
  const { activeRide, setActiveRide, completeRide } = useDriverStore();

  const pickupDest = useCallback((): NavDestination | null => {
    if (!activeRide) return null;
    return {
      lat: activeRide.pickup_lat,
      lng: activeRide.pickup_lon,
      address: activeRide.pickup_address,
      label: 'Prise en charge',
    };
  }, [activeRide]);

  const dropoffDest = useCallback((): NavDestination | null => {
    if (!activeRide) return null;
    return {
      lat: activeRide.dropoff_lat,
      lng: activeRide.dropoff_lon,
      address: activeRide.dropoff_address,
      label: 'Destination',
    };
  }, [activeRide]);

  const markArrived = useCallback(async () => {
    if (!activeRide) return;
    const result = await rideService.markDriverArrived(activeRide.id);
    if (!result.success) {
      Alert.alert('Erreur', result.error || "Impossible de signaler l'arrivée");
      return;
    }
    setActiveRide({
      ...activeRide,
      driver_arrived_at: result.driverArrivedAt ?? new Date().toISOString(),
    });
  }, [activeRide, setActiveRide]);

  const startTrip = useCallback(async () => {
    if (!activeRide) return;
    const result = await rideService.updateRideProgress(
      activeRide.id,
      'in-progress',
    );
    if (!result.success) {
      Alert.alert('Erreur', result.error || 'Impossible de démarrer');
      return;
    }
    setActiveRide({ ...activeRide, status: 'in-progress' });
  }, [activeRide, setActiveRide]);

  const completeTrip = useCallback(async () => {
    if (!activeRide) return;
    const result = await rideService.updateRideProgress(
      activeRide.id,
      'completed',
    );
    if (!result.success) {
      Alert.alert('Erreur', result.error || 'Impossible de terminer');
      return;
    }
    completeRide({ ...activeRide, status: 'completed' } as Ride);
  }, [activeRide, completeRide]);

  const cancelTrip = useCallback(() => {
    if (!activeRide) return;
    Alert.alert(
      'Annuler la course',
      'Cette action est définitive. Confirmer l’annulation ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Annuler la course',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await rideService.updateRideProgress(
                activeRide.id,
                'driver-canceled',
              );
              if (!result.success) {
                Alert.alert('Erreur', result.error || "Échec de l'annulation");
                return;
              }
              setActiveRide(null);
            })();
          },
        },
      ],
    );
  }, [activeRide, setActiveRide]);

  return {
    activeRide,
    pickupDest,
    dropoffDest,
    markArrived,
    startTrip,
    completeTrip,
    cancelTrip,
  };
}
