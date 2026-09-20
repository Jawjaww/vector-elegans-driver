import { Alert } from 'react-native';

import { rideService } from '../../services/rideService';
import { useDriverStore, type Ride } from '../stores/driverStore';
import { logOfferStage } from '../notifications/offerPipelineDiag';
import { isRideStillOfferable } from './ridePickup';

export type AcceptTrackedRideArgs = {
  rideId: string;
  driverStatus: string | null;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  availableRides: Ride[];
  deferredRides: Ride[];
  availableRide: Ride | null;
  setActiveRide: (ride: Ride | null) => void;
  removeAvailableRide: (rideId: string) => void;
  suppressRide: (rideId: string) => void;
  promoteTrackedRideToFront: (ride: Ride) => void;
  /** Called when the accept cannot even be attempted, so the caller can say why. */
  onUnavailable: () => void;
  acceptingRideIds: Set<string>;
};

/**
 * Accept a ride the driver is tracking, whether it sits in the overlay stack, in the deferred
 * bottomsheet, or nowhere yet.
 *
 * The "nowhere yet" case is the one that matters: a notification tap and the tray's Accept
 * button can both fire before Realtime has delivered the offer row, and the previous
 * `if (!ride) return` turned that race into a dead button — no card, no error, no clue, which
 * is precisely the "I pressed Accept and nothing happened" report. Resolving the offer from
 * the server instead keeps the action honest: it either accepts, or it explains.
 */
export async function acceptTrackedRide(
  args: AcceptTrackedRideArgs,
): Promise<void> {
  let ride =
    args.availableRides.find((r) => r.id === args.rideId) ||
    args.deferredRides.find((r) => r.id === args.rideId) ||
    (args.availableRide?.id === args.rideId ? args.availableRide : null);

  if (!ride) {
    const fetched = await rideService.fetchDriverOfferRide(args.rideId);
    if (
      !fetched.ok ||
      !fetched.offer.alive ||
      !isRideStillOfferable(fetched.ride)
    ) {
      logOfferStage(
        'accept_error',
        {
          phase: 'unresolved',
          ...(fetched.ok
            ? { offer_status: fetched.offer.status, alive: fetched.offer.alive }
            : { fetch_reason: fetched.reason }),
        },
        args.rideId,
      );
      args.onUnavailable();
      return;
    }
    ride = fetched.ride;
    args.promoteTrackedRideToFront(ride);
    logOfferStage('promoted', { source: 'accept_fallback' }, args.rideId);
  }

  if (args.driverStatus !== 'active') {
    logOfferStage(
      'accept_error',
      { phase: 'dossier', driver_status: args.driverStatus ?? 'unknown' },
      args.rideId,
    );
    Alert.alert('Error', 'Only active drivers can accept rides');
    return;
  }
  // An offer can be opened and accepted while offline; accepting is what brings the driver
  // online, so the wave-1 dispatcher sees them from that moment on.
  if (!args.isOnline) args.setIsOnline(true);

  args.acceptingRideIds.add(args.rideId);
  const rpcStartedAt = Date.now();
  try {
    const result = await rideService.acceptRide(args.rideId);
    logOfferStage(
      'accept_rpc_end',
      { duration_ms: Date.now() - rpcStartedAt, success: result.success },
      args.rideId,
    );
    if (!result.success) {
      logOfferStage(
        'accept_error',
        { phase: 'rpc', error: result.error ?? 'unknown' },
        args.rideId,
      );
      Alert.alert('Error', result.error || 'Failed to accept ride');
      args.suppressRide(args.rideId);
      return;
    }

    args.setActiveRide({
      ...ride,
      status: 'scheduled',
      driver_arrived_at: null,
    });
    args.removeAvailableRide(args.rideId);
    useDriverStore.setState((s) => ({
      deferredRides: s.deferredRides.filter((r) => r.id !== args.rideId),
    }));
    logOfferStage('accept_ok', {}, args.rideId);
  } finally {
    args.acceptingRideIds.delete(args.rideId);
  }
}
