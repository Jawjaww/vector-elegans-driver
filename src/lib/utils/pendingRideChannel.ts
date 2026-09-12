/** Catch-up when Realtime INSERT is missed while the driver is already online. */
export const OFFER_CATCHUP_INTERVAL_MS = 30_000;

/** Backoff before recreating the pending-rides channel after a socket error. */
export const OFFER_CHANNEL_RETRY_MS = 2_000;

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
