import { resolveTripMapPoints } from '../utils/tripMapPoints';

const ride = {
  status: 'scheduled' as const,
  pickup_lat: 48.85,
  pickup_lon: 2.35,
  dropoff_lat: 48.86,
  dropoff_lon: 2.36,
};

describe('resolveTripMapPoints', () => {
  it('uses offer pickup/dropoff with approach from driver', () => {
    const pts = resolveTripMapPoints({
      activeRide: null,
      offerRide: ride,
      offerApproach: { lat: 48.84, lng: 2.34 },
    });
    expect(pts.start).toEqual({ lat: 48.85, lng: 2.35 });
    expect(pts.end).toEqual({ lat: 48.86, lng: 2.36 });
    expect(pts.approachFrom).toEqual({ lat: 48.84, lng: 2.34 });
  });

  it('does not treat live currentLocation as offer approachFrom', () => {
    const pts = resolveTripMapPoints({
      activeRide: null,
      offerRide: ride,
      currentLocation: { lat: 48.84, lng: 2.34 },
    });
    expect(pts.start).toEqual({ lat: 48.85, lng: 2.35 });
    expect(pts.approachFrom).toBeUndefined();
  });

  it('routes driver → pickup when scheduled with GPS', () => {
    const pts = resolveTripMapPoints({
      activeRide: ride,
      offerRide: null,
      currentLocation: { lat: 48.84, lng: 2.34 },
    });
    expect(pts.start).toEqual({ lat: 48.84, lng: 2.34 });
    expect(pts.end).toEqual({ lat: 48.85, lng: 2.35 });
    expect(pts.approachFrom).toBeUndefined();
  });

  it('routes driver → dropoff when in-progress', () => {
    const pts = resolveTripMapPoints({
      activeRide: { ...ride, status: 'in-progress' },
      offerRide: null,
      currentLocation: { lat: 48.84, lng: 2.34 },
    });
    expect(pts.start).toEqual({ lat: 48.84, lng: 2.34 });
    expect(pts.end).toEqual({ lat: 48.86, lng: 2.36 });
  });

  it('rejects null-island coordinates for offers', () => {
    const pts = resolveTripMapPoints({
      activeRide: null,
      offerRide: { ...ride, pickup_lat: 0, pickup_lon: 0 },
      offerApproach: { lat: 48.84, lng: 2.34 },
    });
    expect(pts.start).toBeUndefined();
    expect(pts.end).toBeUndefined();
  });
});
