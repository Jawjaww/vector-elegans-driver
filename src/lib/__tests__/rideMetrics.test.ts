import {
  rideDistanceKm,
  rideDurationMinutes,
  formatRideDistanceKm,
  formatRideDurationMin,
  resolveRideTripMetrics,
} from '../utils/rideMetrics';

describe('rideMetrics', () => {
  it('treats DB distance as km (not meters)', () => {
    expect(rideDistanceKm(18.5)).toBe(18.5);
    expect(formatRideDistanceKm(18.5)).toBe('18.5 km');
    expect(rideDistanceKm(18500)).toBe(18.5);
  });

  it('treats DB duration as minutes (not seconds)', () => {
    expect(rideDurationMinutes(30)).toBe(30);
    expect(formatRideDurationMin(30)).toBe('30 min');
    expect(rideDurationMinutes(1800)).toBe(30);
  });

  it('detects seconds when duration is absurd vs distance (600s / 2.5km)', () => {
    expect(rideDurationMinutes(600, 2.5)).toBe(10);
    expect(formatRideDurationMin(600, 2.5)).toBe('10 min');
  });

  it('falls back to haversine when distance missing', () => {
    const { distanceKm, durationMin } = resolveRideTripMetrics({
      distance: null,
      duration: null,
      pickup_lat: 48.8566,
      pickup_lon: 2.3522,
      dropoff_lat: 48.8606,
      dropoff_lon: 2.3376,
    });
    expect(distanceKm).toBeGreaterThan(0.5);
    expect(distanceKm).toBeLessThan(3);
    expect(durationMin).toBeGreaterThan(0);
  });
});
