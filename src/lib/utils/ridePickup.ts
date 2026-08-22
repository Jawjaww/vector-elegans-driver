/** Must match infra-supabase expire_overdue_rides grace window */
export const RIDE_PICKUP_GRACE_MS = 15 * 60 * 1000;

/** ISO cutoff for Supabase `.gt('pickup_time', cutoff)` filters */
export function ridePickupExpiryCutoffIso(
  graceMs: number = RIDE_PICKUP_GRACE_MS,
): string {
  return new Date(Date.now() - graceMs).toISOString();
}

/** Whether a pending ride can still be offered to drivers */
export function isRidePickupStillOfferable(
  pickupTime: string | null | undefined,
  graceMs: number = RIDE_PICKUP_GRACE_MS,
): boolean {
  if (!pickupTime) return false;
  const t = new Date(pickupTime).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - graceMs;
}

/** UI label for pending rides (valid vs overdue before cron runs) */
export function getPendingRideDisplayLabel(
  pickupTime: string | null | undefined,
): string {
  return isRidePickupStillOfferable(pickupTime) ? 'En attente' : 'Dépassée';
}
