import {
  GPS_MAX_ACCURACY_METERS,
  GPS_STORE_MIN_METERS,
  gpsFixAcceptable,
  gpsMovedEnough,
  haversineMeters,
  navCameraForSpeed,
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

describe('gpsFixAcceptable', () => {
  const here = { lat: 48.8566, lng: 2.3522 };
  const nearby = { lat: 48.857, lng: 2.3522 };

  it('keeps the first fix even when it is coarse', () => {
    expect(
      gpsFixAcceptable({
        accuracy: 80,
        prev: null,
        next: here,
        elapsedMs: 0,
        hasFix: false,
      }),
    ).toBe(true);
  });

  it('drops a later fix coarser than 40 m', () => {
    expect(
      gpsFixAcceptable({
        accuracy: GPS_MAX_ACCURACY_METERS + 1,
        prev: here,
        next: nearby,
        elapsedMs: 1500,
        hasFix: true,
      }),
    ).toBe(false);
    expect(
      gpsFixAcceptable({
        accuracy: GPS_MAX_ACCURACY_METERS,
        prev: here,
        next: nearby,
        elapsedMs: 1500,
        hasFix: true,
      }),
    ).toBe(true);
  });

  it('drops a jump that implies more than about 200 km/h', () => {
    const far = { lat: 48.87, lng: 2.3522 };
    expect(haversineMeters(here, far)).toBeGreaterThan(55);
    expect(
      gpsFixAcceptable({
        accuracy: 8,
        prev: here,
        next: far,
        elapsedMs: 1000,
        hasFix: true,
      }),
    ).toBe(false);
  });
});

describe('navCameraForSpeed', () => {
  it('zooms out as speed rises', () => {
    expect(navCameraForSpeed(5)).toEqual({ zoom: 18, pitch: 50 });
    expect(navCameraForSpeed(30 / 3.6)).toEqual({ zoom: 17, pitch: 45 });
    expect(navCameraForSpeed(80 / 3.6)).toEqual({ zoom: 16, pitch: 40 });
    expect(navCameraForSpeed(null)).toEqual({ zoom: 18, pitch: 50 });
  });
});
