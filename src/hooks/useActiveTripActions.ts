import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useDriverStore, type Ride } from '../lib/stores/driverStore';
import { rideService } from '../services/rideService';
import type { NavDestination } from '../lib/utils/externalNavigation';

function confirmDestructive(
  title: string,
  message: string,
  actionLabel: string,
  onConfirm: () => void,
) {
  Alert.alert(title, message, [
    { text: 'Non', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

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

  const applyProgress = useCallback(
    async (status: 'driver-canceled' | 'no-show') => {
      if (!activeRide) return;
      const result = await rideService.updateRideProgress(
        activeRide.id,
        status,
      );
      if (!result.success) {
        Alert.alert('Erreur', result.error || "Échec de l'action");
        return;
      }
      setActiveRide(null);
    },
    [activeRide, setActiveRide],
  );

  const cancelInProgress = useCallback(() => {
    if (!activeRide) return;
    confirmDestructive(
      'Annuler la course',
      'Cette action est définitive. Confirmer l’annulation ?',
      'Annuler la course',
      () => {
        void applyProgress('driver-canceled');
      },
    );
  }, [activeRide, applyProgress]);

  const cancelScheduled = useCallback(async () => {
    if (!activeRide) return;
    const quote = await rideService.previewCancelQuote(activeRide.id);
    if (!quote.success) {
      Alert.alert('Erreur', quote.error || 'Devis impossible');
      return;
    }
    if (quote.driver_may_noshow) {
      confirmDestructive(
        'Client absent',
        `Frais affichés : ${quote.amount} €. Marquer no-show ?`,
        'No-show',
        () => {
          void applyProgress('no-show');
        },
      );
      return;
    }
    if (quote.driver_may_release) {
      confirmDestructive(
        'Se libérer',
        'Aucun frais client. Confirmer ?',
        'Se libérer',
        () => {
          void applyProgress('driver-canceled');
        },
      );
      return;
    }
    Alert.alert(
      'Action indisponible',
      "Vous ne pouvez pas encore libérer cette course (grâce d'attente ou pickup non dépassé).",
    );
  }, [activeRide, applyProgress]);

  const cancelTrip = useCallback(() => {
    if (!activeRide) return;
    if (activeRide.status === 'in-progress') {
      cancelInProgress();
      return;
    }
    void cancelScheduled();
  }, [activeRide, cancelInProgress, cancelScheduled]);

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
