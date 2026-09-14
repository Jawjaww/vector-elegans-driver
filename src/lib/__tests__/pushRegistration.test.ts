import { shouldOpenHomeFromPushData } from '../notifications/pushOpen';

describe('shouldOpenHomeFromPushData', () => {
  it('opens home for a ride_offer payload', () => {
    expect(
      shouldOpenHomeFromPushData({ type: 'ride_offer', ride_id: 'abc' }),
    ).toBe(true);
  });

  it('opens home when only ride_id is present', () => {
    expect(shouldOpenHomeFromPushData({ ride_id: 'abc' })).toBe(true);
  });

  it('ignores unrelated notifications', () => {
    expect(shouldOpenHomeFromPushData({ type: 'promo' })).toBe(false);
    expect(shouldOpenHomeFromPushData({})).toBe(false);
  });
});
