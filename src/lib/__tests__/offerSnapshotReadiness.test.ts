import {
  canCaptureOfferSnapshot,
  isCanvasSampleTooDark,
  isOsrmTripReady,
  meanLumaFromRgba,
  shouldAcceptCapturedJpeg,
} from '../utils/offerSnapshotReadiness';

describe('isOsrmTripReady', () => {
  it('is true only for real OSRM geometry (more than two points)', () => {
    expect(isOsrmTripReady(true, 80)).toBe(true);
    expect(isOsrmTripReady(false, 80)).toBe(false);
    expect(isOsrmTripReady(true, 2)).toBe(false);
  });
});

describe('canCaptureOfferSnapshot', () => {
  it('requires OSRM trip, route layer, loaded tiles, and a still camera', () => {
    expect(
      canCaptureOfferSnapshot({
        osrmTrip: true,
        routeLayer: true,
        tilesLoaded: true,
        cameraMoving: false,
      }),
    ).toBe(true);
  });

  it('refuses a 2-point fallback (no OSRM) even if the camera is idle', () => {
    expect(
      canCaptureOfferSnapshot({
        osrmTrip: false,
        routeLayer: true,
        tilesLoaded: true,
        cameraMoving: false,
      }),
    ).toBe(false);
  });

  it('refuses capture while tiles are still loading', () => {
    expect(
      canCaptureOfferSnapshot({
        osrmTrip: true,
        routeLayer: true,
        tilesLoaded: false,
        cameraMoving: false,
      }),
    ).toBe(false);
  });
});

describe('isCanvasSampleTooDark', () => {
  it('rejects a near-black sample (unloaded tiles)', () => {
    const rgba: number[] = [];
    for (let i = 0; i < 64; i += 1) rgba.push(12, 12, 14, 255);
    expect(isCanvasSampleTooDark(meanLumaFromRgba(rgba))).toBe(true);
  });

  it('accepts a light map sample', () => {
    const rgba: number[] = [];
    for (let i = 0; i < 64; i += 1) rgba.push(232, 238, 244, 255);
    expect(isCanvasSampleTooDark(meanLumaFromRgba(rgba))).toBe(false);
  });
});

describe('shouldAcceptCapturedJpeg', () => {
  it('rejects empty or missing data URLs', () => {
    expect(shouldAcceptCapturedJpeg(null)).toBe(false);
    expect(shouldAcceptCapturedJpeg('')).toBe(false);
    expect(shouldAcceptCapturedJpeg('short')).toBe(false);
  });

  it('accepts a real JPEG data URL', () => {
    expect(shouldAcceptCapturedJpeg(`data:image/jpeg;base64,${'A'.repeat(40)}`)).toBe(
      true,
    );
  });
});
