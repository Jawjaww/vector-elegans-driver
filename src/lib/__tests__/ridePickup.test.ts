import {
  formatIncentiveBonusLabel,
  getPendingRideDisplayLabel,
  isMatchingDelayActive,
  isRidePickupStillOfferable,
  isRideStillOfferable,
  resolveRideOfferPrice,
  RIDE_MATCHING_WINDOW_MS,
  ridePickupExpiryCutoffIso,
  shouldShowMatchingFlameBadge,
} from '../utils/ridePickup';

describe('ridePickup', () => {
  it('isRidePickupStillOfferable respects the 25 min matching window', () => {
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
    expect(getPendingRideDisplayLabel(past)).toBe('Recherche expirée');
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(getPendingRideDisplayLabel(future)).toBe('En attente');
    const overdue = new Date(Date.now() - 30 * 60_000).toISOString();
    const deadline = new Date(Date.now() + 3600_000).toISOString();
    expect(getPendingRideDisplayLabel(overdue, deadline)).toBe('En recherche');
    expect(isMatchingDelayActive(overdue, deadline)).toBe(true);
    expect(
      shouldShowMatchingFlameBadge('pending', overdue, deadline, null),
    ).toBe(true);
    expect(
      shouldShowMatchingFlameBadge('delayed', overdue, deadline, null),
    ).toBe(true);
    expect(
      getPendingRideDisplayLabel(overdue, deadline, new Date().toISOString()),
    ).toBe('Confirmez la recherche');
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
    // client_incentive is numeric(10,2): cents are reachable, and this label is
    // the single formatter both driver surfaces use. Rounding to whole euros here
    // would show "+3€" on the offer card and "+2.50€" in the price block.
    expect(formatIncentiveBonusLabel(2.5)).toBe('Bonus +2.50€');
    expect(formatIncentiveBonusLabel(2.25)).toBe('Bonus +2.25€');
    // Defensive: a negative or non-numeric incentive must not render a chip.
    expect(formatIncentiveBonusLabel(-3)).toBe('');
    expect(formatIncentiveBonusLabel(Number.NaN)).toBe('');
  });
});
