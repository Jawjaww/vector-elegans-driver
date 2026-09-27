import type { Ride } from '../stores/driverStore';

/**
 * The statuses that mean "this ride is still the driver's job".
 * Mirrors the `scheduled | in-progress` filter of `rideService.fetchAssignedRide`.
 */
export const ACTIVE_RIDE_STATUSES = ['scheduled', 'in-progress'] as const;

export function isActiveRideStatus(status: string | null | undefined): boolean {
  return (ACTIVE_RIDE_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * Result of reading the driver's assigned ride.
 *
 * `ok: true` with `ride: null` is the server answering "you have no ride"; `ok: false` is
 * "the question could not be asked". Collapsing the two into a single `null` is what let a
 * transient read error — or a read that started before the driver pressed Accept — end the
 * trip on the device while the server still had the ride assigned.
 */
export type AssignedRideFetch =
  | { ok: true; ride: Ride | null }
  | { ok: false; reason: 'network' | 'server' };

export type AssignedRideAction =
  /** The server named a ride the device did not know about. */
  | 'adopted'
  /** The server confirmed the ride already open, with fresher columns. */
  | 'refreshed'
  /** A null read discarded because it was issued before the local Accept. */
  | 'kept_accept_race'
  /** A successful read that started after the accept, and found no ride. */
  | 'released'
  /** No ride locally and none on the server. */
  | 'unchanged'
  /** The read failed; the device state is deliberately left untouched. */
  | 'read_failed';

export type AssignedRideReconcile = {
  /** Ride to store, or null to release the trip. */
  next: Ride | null;
  action: AssignedRideAction;
};

/** Server acceptance time in ms, 0 when absent or unreadable. */
function acceptedAtMs(ride: Ride): number {
  const raw = ride.accepted_at;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Decide what the dashboard boot may do with the driver's active ride.
 *
 * The boot refreshes, it does not arbitrate. A read that failed leaves the ride in place, and a
 * read that raced the driver's own Accept is discarded — that race is real: `accept_ride` lands
 * after a boot refresh has already been issued, so the refresh answers "no ride" about a
 * question asked before the ride existed. Only a successful read that started *after* the local
 * ride was accepted can release it, which is the one case where "no assigned ride" is a
 * statement about this ride rather than about a question asked too early.
 */
export function reconcileAssignedRide(args: {
  current: Ride | null;
  fetch: AssignedRideFetch;
  /** Device clock when the read was issued, ms. */
  readStartedAt: number;
}): AssignedRideReconcile {
  const { current, fetch, readStartedAt } = args;
  if (!fetch.ok) {
    return { next: current, action: 'read_failed' };
  }
  if (fetch.ride) {
    return current?.id === fetch.ride.id
      ? { next: fetch.ride, action: 'refreshed' }
      : { next: fetch.ride, action: 'adopted' };
  }
  if (!current) return { next: null, action: 'unchanged' };
  if (acceptedAtMs(current) >= readStartedAt) {
    return { next: current, action: 'kept_accept_race' };
  }
  return { next: null, action: 'released' };
}
