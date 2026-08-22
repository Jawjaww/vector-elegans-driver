import {
  getPendingRideDisplayLabel,
  isRidePickupStillOfferable,
  RIDE_PICKUP_GRACE_MS,
  ridePickupExpiryCutoffIso,
} from '../utils/ridePickup';

describe('ridePickup', () => {
  it('isRidePickupStillOfferable respects 15 min grace', () => {
    const now = Date.now();
    expect(
      isRidePickupStillOfferable(new Date(now + 60_000).toISOString()),
    ).toBe(true);
    expect(
      isRidePickupStillOfferable(
        new Date(now - RIDE_PICKUP_GRACE_MS + 60_000).toISOString(),
      ),
    ).toBe(true);
    expect(
      isRidePickupStillOfferable(
        new Date(now - RIDE_PICKUP_GRACE_MS - 60_000).toISOString(),
      ),
    ).toBe(false);
  });

  it('getPendingRideDisplayLabel switches to Dépassée', () => {
    const past = new Date(Date.now() - RIDE_PICKUP_GRACE_MS - 60_000).toISOString();
    expect(getPendingRideDisplayLabel(past)).toBe('Dépassée');
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(getPendingRideDisplayLabel(future)).toBe('En attente');
  });

  it('ridePickupExpiryCutoffIso is in the past', () => {
    const cutoff = new Date(ridePickupExpiryCutoffIso()).getTime();
    expect(cutoff).toBeLessThanOrEqual(Date.now());
  });
});
