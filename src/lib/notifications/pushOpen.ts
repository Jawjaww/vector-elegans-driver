/** Whether a push payload should open the driver home (offer overlay). */
export function shouldOpenHomeFromPushData(
  data: Record<string, unknown>,
): boolean {
  const type = typeof data.type === 'string' ? data.type : null;
  const rideId = typeof data.ride_id === 'string' ? data.ride_id : null;
  return type === 'ride_offer' || Boolean(rideId);
}

/** Ride id carried by a ride_offer push payload, if any. */
export function rideIdFromPushData(
  data: Record<string, unknown>,
): string | null {
  return typeof data.ride_id === 'string' && data.ride_id.length > 0
    ? data.ride_id
    : null;
}

/**
 * Ride tapped from a ride_offer push, awaiting promotion to the overlay.
 * Kept in module scope: on cold start the notification handler runs before the
 * offer store hydrates, so the dashboard consumes it once offers are live.
 */
let pendingOfferRideId: string | null = null;

export function setPendingOfferRideId(rideId: string): void {
  pendingOfferRideId = rideId;
}

export function peekPendingOfferRideId(): string | null {
  return pendingOfferRideId;
}

export function consumePendingOfferRideId(): string | null {
  const rideId = pendingOfferRideId;
  pendingOfferRideId = null;
  return rideId;
}
