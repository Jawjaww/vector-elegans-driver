import {
  formatIncentiveBonusLabel,
  getPendingRideDisplayLabel,
  isRidePickupStillOfferable,
  isRideStillOfferable,
  resolveRideOfferPrice,
  RIDE_MATCHING_WINDOW_MS,
  RIDE_PICKUP_GRACE_MS,
  ridePickupExpiryCutoffIso,
} from '../utils/ridePickup';

describe('ridePickup', () => {
  it('isRidePickupStillOfferable respects 2h matching window', () => {
    const now = Date.now();
    expect(
      isRidePickupStillOfferable(new Date(now + 60_000).toISOString()),
    ).toBe(true);
    expect(
      isRidePickupStillOfferable(
        new Date(now - RIDE_MATCHING_WINDOW_MS + 60_000).toISOString(),
      ),
    ).toBe(true);
    expect(
      isRidePickupStillOfferable(
        new Date(now - RIDE_MATCHING_WINDOW_MS - 60_000).toISOString(),
      ),
    ).toBe(false);
    expect(RIDE_PICKUP_GRACE_MS).toBe(RIDE_MATCHING_WINDOW_MS);
  });

  it('isRideStillOfferable uses matching_deadline_at and pause', () => {
    const now = Date.now();
    expect(
      isRideStillOfferable({
        status: 'delayed',
        pickup_time: new Date(now - 3_600_000).toISOString(),
        matching_deadline_at: new Date(now + 3_600_000).toISOString(),
      }),
    ).toBe(true);
    expect(
      isRideStillOfferable({
        status: 'delayed',
        pickup_time: new Date(now - 3_600_000).toISOString(),
        matching_deadline_at: new Date(now + 3_600_000).toISOString(),
        matching_paused_at: new Date(now).toISOString(),
      }),
    ).toBe(false);
    expect(
      isRideStillOfferable({
        status: 'scheduled',
        pickup_time: new Date(now + 3_600_000).toISOString(),
      }),
    ).toBe(false);
  });

  it('getPendingRideDisplayLabel switches labels', () => {
    const past = new Date(Date.now() - RIDE_MATCHING_WINDOW_MS - 60_000).toISOString();
    expect(getPendingRideDisplayLabel(past)).toBe('Recherche en pause');
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(getPendingRideDisplayLabel(future)).toBe('En attente');
    const overdue = new Date(Date.now() - 30 * 60_000).toISOString();
    const deadline = new Date(Date.now() + 3600_000).toISOString();
    expect(getPendingRideDisplayLabel(overdue, deadline)).toBe('En retard');
  });

  it('ridePickupExpiryCutoffIso is in the past', () => {
    const cutoff = new Date(ridePickupExpiryCutoffIso()).getTime();
    expect(cutoff).toBeLessThanOrEqual(Date.now());
  });

  it('resolveRideOfferPrice adds client incentive to total', () => {
    expect(
      resolveRideOfferPrice({
        estimated_price: 40,
        client_incentive: 5,
      }),
    ).toEqual({
      base: 40,
      incentive: 5,
      total: 45,
      hasIncentive: true,
    });
    expect(formatIncentiveBonusLabel(5)).toBe('Bonus +5€');
    expect(formatIncentiveBonusLabel(0)).toBe('');
  });
});
