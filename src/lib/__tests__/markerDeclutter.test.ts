import {
  OFFER_APPROACH_HIDE_MAX_METERS,
  OFFER_GPS_MIN_SEPARATION_PX,
  geoDistanceMeters,
  markersOverlapOnScreen,
  shouldHideOfferApproach,
} from '../utils/markerDeclutter';

describe('markersOverlapOnScreen', () => {
  it('is false when pickup and GPS are far enough on screen', () => {
    expect(
      markersOverlapOnScreen({ x: 0, y: 0 }, { x: 80, y: 0 }, 48),
    ).toBe(false);
  });

  it('is true when a long-trip dezoom stacks them on the same pixels', () => {
    expect(
      markersOverlapOnScreen({ x: 100, y: 100 }, { x: 110, y: 100 }, 48),
    ).toBe(true);
  });

  it('treats identical projections as overlap', () => {
    expect(
      markersOverlapOnScreen(
        { x: 50, y: 50 },
        { x: 50, y: 50 },
        OFFER_GPS_MIN_SEPARATION_PX,
      ),
    ).toBe(true);
  });
});

describe('shouldHideOfferApproach', () => {
  it('keeps the orange line when GPS is kilometers from pickup', () => {
    // ~11 km north of Paris center
    expect(
      shouldHideOfferApproach(
        { lat: 48.85, lng: 2.35 },
        { lat: 48.95, lng: 2.35 },
      ),
    ).toBe(false);
  });

  it('hides only when already near the pickup', () => {
    expect(
      shouldHideOfferApproach(
        { lat: 48.85, lng: 2.35 },
        { lat: 48.8505, lng: 2.35 },
        OFFER_APPROACH_HIDE_MAX_METERS,
      ),
    ).toBe(true);
  });

  it('geoDistanceMeters is in the right order of magnitude', () => {
    const m = geoDistanceMeters(
      { lat: 48.85, lng: 2.35 },
      { lat: 48.86, lng: 2.35 },
    );
    expect(m).toBeGreaterThan(1000);
    expect(m).toBeLessThan(1500);
  });
});
