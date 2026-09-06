import { isRideStillOfferable } from './ridePickup';
import type { Ride } from '../stores/driverStore';

export type PendingRideRealtimeDecision =
  | { action: 'ignore' }
  | { action: 'present' }
  | { action: 'patch' }
  | { action: 'drop'; notifyUnavailable: boolean };

export type PendingRideRealtimeContext = {
  availableRide: Ride | null;
  availableRides: Ride[];
  deferredRides: Ride[];
  activeRide: Ride | null;
  myDriverId: string | null;
  acceptingRideIds: ReadonlySet<string>;
};

/** True when this UPDATE is our accept (in-flight, already active, or assigned to us). */
export function isRideClaimedByMe(
  ride: Pick<Ride, 'id' | 'driver_id'>,
  ctx: Pick<
    PendingRideRealtimeContext,
    'myDriverId' | 'activeRide' | 'acceptingRideIds'
  >,
): boolean {
  if (ctx.acceptingRideIds.has(ride.id)) return true;
  if (ctx.activeRide?.id === ride.id) return true;
  if (ride.driver_id && ctx.myDriverId && ride.driver_id === ctx.myDriverId) {
    return true;
  }
  return false;
}

/**
 * Realtime rides UPDATE while the driver is on the offer channel.
 * Our own accept must not surface "no longer available".
 */
export function resolvePendingRideRealtimeUpdate(
  updated: Ride,
  ctx: PendingRideRealtimeContext,
): PendingRideRealtimeDecision {
  const isFront = ctx.availableRide?.id === updated.id;
  const inStack = ctx.availableRides.some((r) => r.id === updated.id);
  const inDeferred = ctx.deferredRides.some((r) => r.id === updated.id);
  const isTracked = isFront || inStack || inDeferred;

  if (isRideClaimedByMe(updated, ctx)) {
    return isTracked
      ? { action: 'drop', notifyUnavailable: false }
      : { action: 'ignore' };
  }

  if (isRideStillOfferable(updated)) {
    if (isTracked) return { action: 'patch' };
    return { action: 'present' };
  }

  if (!isTracked) return { action: 'ignore' };
  return { action: 'drop', notifyUnavailable: isFront };
}
