import {
  canPresentRideOffer,
  type OfferGateState,
  type Ride,
} from '../stores/driverStore';
import { isRideStillOfferable } from './ridePickup';

/** Pending rows not already on overlay / sheet / declined / suppressed. */
export function selectFreshHydrateRides(
  pending: Ride[],
  gate: OfferGateState,
): Ride[] {
  return pending.filter(
    (ride) =>
      isRideStillOfferable(ride) && canPresentRideOffer(ride.id, gate),
  );
}

/** Overlay ids that appeared after a merge (for record_ride_offer). */
export function newlyStackedOfferIds(
  stackIdsBefore: readonly string[],
  stackIdsAfter: readonly string[],
): string[] {
  const before = new Set(stackIdsBefore);
  return stackIdsAfter.filter((id) => !before.has(id));
}

/**
 * Merge a pending SELECT into the overlay (cap 4) / sheet (cap 12).
 * Does not replace the current front card. Returns ids newly stacked.
 */
export function hydratePendingOffers(args: {
  pending: Ride[];
  gate: OfferGateState;
  stackIdsBefore: readonly string[];
  addAvailableRide: (ride: Ride) => void;
  getStackIdsAfter: () => string[];
}): string[] {
  const fresh = selectFreshHydrateRides(args.pending, args.gate);
  if (fresh.length === 0) return [];
  for (const ride of fresh) {
    args.addAvailableRide(ride);
  }
  return newlyStackedOfferIds(args.stackIdsBefore, args.getStackIdsAfter());
}
