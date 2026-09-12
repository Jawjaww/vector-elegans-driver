import {
  shouldHydrateOffersOnRealtimeStatus,
  shouldRetryPendingRideChannel,
} from '../utils/pendingRideChannel';

describe('pendingRideChannel', () => {
  it('hydrates on subscribe and on socket failure so a missed INSERT is recovered', () => {
    expect(shouldHydrateOffersOnRealtimeStatus('SUBSCRIBED')).toBe(true);
    expect(shouldHydrateOffersOnRealtimeStatus('CHANNEL_ERROR')).toBe(true);
    expect(shouldHydrateOffersOnRealtimeStatus('TIMED_OUT')).toBe(true);
    expect(shouldHydrateOffersOnRealtimeStatus('CLOSED')).toBe(false);
  });

  it('retries the channel only after a dead socket', () => {
    expect(shouldRetryPendingRideChannel('CHANNEL_ERROR')).toBe(true);
    expect(shouldRetryPendingRideChannel('TIMED_OUT')).toBe(true);
    expect(shouldRetryPendingRideChannel('SUBSCRIBED')).toBe(false);
  });
});
