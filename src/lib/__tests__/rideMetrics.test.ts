import {
  rideDistanceKm,
  rideDurationMinutes,
  formatRideDistanceKm,
  formatRideDurationMin,
  formatMinutesCompact,
  resolveRideTripMetrics,
} from '../utils/rideMetrics';

describe('rideMetrics', () => {
  it('treats DB distance as km (not meters)', () => {
    expect(rideDistanceKm(18.5)).toBe(18.5);
    expect(formatRideDistanceKm(18.5)).toBe('18.5 km');
    expect(rideDistanceKm(18500)).toBe(18.5);
  });

  it('keeps long-haul km (e.g. 600) instead of treating as meters', () => {
    // Paris → south FR ~600–750 km straight-line
    const geo = 650;
    expect(rideDistanceKm(600, geo)).toBe(600);
    expect(formatRideDistanceKm(600, geo)).toBe('600 km');
  });

  it('uses meters when geo matches n/1000', () => {
    expect(rideDistanceKm(18500, 18.5)).toBe(18.5);
    expect(rideDistanceKm(600, 0.6)).toBe(0.6);
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

  it('rejects tiny duration for long distance (unit / estimate bug)', () => {
    expect(rideDurationMinutes(7, 600)).toBeNull();
  });

  it('formatMinutesCompact uses hours for long approaches', () => {
    expect(formatMinutesCompact(1231)).toBe('20h 31');
    expect(formatMinutesCompact(45)).toBe('45 min');
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

  it('overrides wrong short DB distance when coords are long-haul', () => {
    const { distanceKm } = resolveRideTripMetrics({
      distance: 0.6,
      duration: 7,
      pickup_lat: 48.8566,
      pickup_lon: 2.3522,
      dropoff_lat: 43.2965,
      dropoff_lon: 5.3698, // Marseille
    });
    expect(distanceKm).toBeGreaterThan(500);
  });
});
