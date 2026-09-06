import {
  GPS_STORE_MIN_METERS,
  gpsMovedEnough,
  haversineMeters,
} from '../utils/gpsThrottle';

describe('gpsMovedEnough', () => {
  const paris = { lat: 48.8566, lng: 2.3522 };

  it('treats a missing previous fix as a move', () => {
    expect(gpsMovedEnough(null, paris)).toBe(true);
  });

  it('skips sub-threshold jitter', () => {
    const nearby = { lat: 48.85662, lng: 2.3522 };
    expect(haversineMeters(paris, nearby)).toBeLessThan(GPS_STORE_MIN_METERS);
    expect(gpsMovedEnough(paris, nearby)).toBe(false);
  });

  it('notifies once the driver has moved ~10 m', () => {
    const moved = { lat: 48.8567, lng: 2.3522 };
    expect(haversineMeters(paris, moved)).toBeGreaterThan(GPS_STORE_MIN_METERS);
    expect(gpsMovedEnough(paris, moved)).toBe(true);
  });
});
