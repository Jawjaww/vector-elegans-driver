/** Catch-up when Realtime INSERT is missed while the driver is already online. */
export const OFFER_CATCHUP_INTERVAL_MS = 30_000;

/** Backoff before recreating the pending-rides channel after a socket error. */
export const OFFER_CHANNEL_RETRY_MS = 2_000;

export type RideOfferRealtimeRow = {
  ride_id: string;
  driver_id: string;
  status: string;
  expires_at?: string | null;
};

export function shouldHydrateOffersOnRealtimeStatus(status: string): boolean {
  return (
    status === 'SUBSCRIBED' ||
    status === 'CHANNEL_ERROR' ||
    status === 'TIMED_OUT'
  );
}

export function shouldRetryPendingRideChannel(status: string): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT';
}

export function isOpenRideOffer(row: RideOfferRealtimeRow, nowMs = Date.now()): boolean {
  if (row.status !== 'offered') return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > nowMs;
}

/** Server closed this driver's offer — drop it from the overlay / sheet. */
export function shouldDropOverlayForOfferStatus(status: string): boolean {
  return status === 'timeout' || status === 'expired_taken' || status === 'declined';
}
