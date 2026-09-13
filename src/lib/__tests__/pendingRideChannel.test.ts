import {
  OFFER_CATCHUP_INTERVAL_MS,
  shouldHydrateOffersOnRealtimeStatus,
  shouldRetryPendingRideChannel,
  isOpenRideOffer,
  shouldDropOverlayForOfferStatus,
} from '../utils/pendingRideChannel';

describe('pendingRideChannel', () => {
  it('polls missed offers within 5 seconds', () => {
    expect(OFFER_CATCHUP_INTERVAL_MS).toBe(5_000);
  });

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

  it('treats unexpired offered rows as open', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(
      isOpenRideOffer({
        ride_id: 'r1',
        driver_id: 'd1',
        status: 'offered',
        expires_at: future,
      }),
    ).toBe(true);
    expect(
      isOpenRideOffer({
        ride_id: 'r1',
        driver_id: 'd1',
        status: 'offered',
        expires_at: null,
      }),
    ).toBe(true);
    expect(
      isOpenRideOffer({
        ride_id: 'r1',
        driver_id: 'd1',
        status: 'timeout',
        expires_at: future,
      }),
    ).toBe(false);
    expect(
      isOpenRideOffer({
        ride_id: 'r1',
        driver_id: 'd1',
        status: 'offered',
        expires_at: new Date(Date.now() - 1_000).toISOString(),
      }),
    ).toBe(false);
  });

  it('drops overlay when the server times out or assigns elsewhere', () => {
    expect(shouldDropOverlayForOfferStatus('timeout')).toBe(true);
    expect(shouldDropOverlayForOfferStatus('expired_taken')).toBe(true);
    expect(shouldDropOverlayForOfferStatus('declined')).toBe(true);
    expect(shouldDropOverlayForOfferStatus('offered')).toBe(false);
    expect(shouldDropOverlayForOfferStatus('accepted')).toBe(false);
  });
});
