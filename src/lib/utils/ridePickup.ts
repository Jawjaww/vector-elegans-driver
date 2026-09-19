/** Default matching heartbeat after pickup_time — must match the infra policy. */
export const RIDE_MATCHING_WINDOW_MS = 25 * 60 * 1000;

export type RideMatchingFields = {
  pickup_time?: string | null;
  matching_deadline_at?: string | null;
  matching_paused_at?: string | null;
  status?: string | null;
};

/** ISO cutoff for legacy `.gt('pickup_time', cutoff)` filters (deadline ≈ pickup + window) */
export function ridePickupExpiryCutoffIso(
  graceMs: number = RIDE_MATCHING_WINDOW_MS,
): string {
  return new Date(Date.now() - graceMs).toISOString();
}

export function resolveMatchingDeadlineMs(
  pickupTime: string | null | undefined,
  matchingDeadlineAt?: string | null,
  windowMs: number = RIDE_MATCHING_WINDOW_MS,
): number | null {
  if (matchingDeadlineAt) {
    const d = new Date(matchingDeadlineAt).getTime();
    return Number.isNaN(d) ? null : d;
  }
  if (!pickupTime) return null;
  const t = new Date(pickupTime).getTime();
  if (Number.isNaN(t)) return null;
  return t + windowMs;
}

/** Whether a pending/delayed ride can still be offered to drivers */
export function isRideStillOfferable(
  ride: RideMatchingFields,
  nowMs: number = Date.now(),
): boolean {
  if (ride.matching_paused_at) return false;
  if (
    ride.status != null &&
    ride.status !== 'pending' &&
    ride.status !== 'delayed'
  ) {
    return false;
  }
  const deadline = resolveMatchingDeadlineMs(
    ride.pickup_time,
    ride.matching_deadline_at,
  );
  if (deadline == null) return false;
  return deadline > nowMs;
}

/**
 * Legacy helper: offerable if pickup_time is within grace of now.
 * Prefer isRideStillOfferable when matching_deadline_at is available.
 */
export function isRidePickupStillOfferable(
  pickupTime: string | null | undefined,
  graceMs: number = RIDE_MATCHING_WINDOW_MS,
): boolean {
  if (!pickupTime) return false;
  const t = new Date(pickupTime).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - graceMs;
}

/** Short label when pickup passed but matching is still open (badge uses flame icon). */
export const MATCHING_DELAY_LABEL = 'En recherche';

/** Pickup time passed, deadline still open, client has not paused matching. */
export function isMatchingDelayActive(
  pickupTime: string | null | undefined,
  matchingDeadlineAt?: string | null,
  matchingPausedAt?: string | null,
): boolean {
  if (matchingPausedAt) return false;
  const deadline = resolveMatchingDeadlineMs(pickupTime, matchingDeadlineAt);
  if (deadline == null || deadline <= Date.now()) return false;
  if (!pickupTime) return false;
  const pickup = new Date(pickupTime).getTime();
  return !Number.isNaN(pickup) && pickup < Date.now();
}

/** Compact flame badge on list cards when matching runs past pickup. */
export function shouldShowMatchingFlameBadge(
  status: string,
  pickupTime: string | null | undefined,
  matchingDeadlineAt?: string | null,
  matchingPausedAt?: string | null,
): boolean {
  if (matchingPausedAt) return false;
  if (status === 'delayed') return true;
  if (status !== 'pending') return false;
  return isMatchingDelayActive(
    pickupTime,
    matchingDeadlineAt,
    matchingPausedAt,
  );
}

/** UI label for pending/delayed rides */
export function getPendingRideDisplayLabel(
  pickupTime: string | null | undefined,
  matchingDeadlineAt?: string | null,
  matchingPausedAt?: string | null,
): string {
  if (matchingPausedAt) return 'Confirmez la recherche';
  const deadline = resolveMatchingDeadlineMs(pickupTime, matchingDeadlineAt);
  if (deadline == null) return 'En attente';
  if (deadline <= Date.now()) return 'Recherche expirée';
  if (isMatchingDelayActive(pickupTime, matchingDeadlineAt, matchingPausedAt)) {
    return MATCHING_DELAY_LABEL;
  }
  return 'En attente';
}

export type RidePriceFields = {
  estimated_price?: number | null;
  final_price?: number | null;
  client_incentive?: number | null;
};

/** Driver-facing fare: base (final preferred) + client incentive bonus. */
export function resolveRideOfferPrice(ride: RidePriceFields): {
  base: number;
  incentive: number;
  total: number;
  hasIncentive: boolean;
} {
  const rawBase = ride.final_price ?? ride.estimated_price;
  const base =
    rawBase != null && Number.isFinite(Number(rawBase))
      ? Number(rawBase)
      : 0;
  const incentive = Math.max(0, Number(ride.client_incentive ?? 0) || 0);
  return {
    base,
    incentive,
    total: base + incentive,
    hasIncentive: incentive > 0,
  };
}

export function formatIncentiveBonusLabel(incentive: number): string {
  const n = Math.max(0, Number(incentive) || 0);
  if (n <= 0) return '';
  const rounded = Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2);
  return `Bonus +${rounded}€`;
}
