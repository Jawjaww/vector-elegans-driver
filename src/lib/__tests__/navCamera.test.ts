import { planNavCamera } from '../utils/navCamera';

describe('planNavCamera', () => {
  it('faces the route ahead, and says so', () => {
    // The measured symptom this fixes: the puck stayed north while the camera did not.
    expect(
      planNavCamera({
        traceBearing: 137,
        deviceHeading: 300,
        mapBearing: 0,
        lastBearing: 12,
      }),
    ).toEqual({ bearing: 137, courseUp: true });
  });

  it('falls back to the device heading when there is no usable line', () => {
    // courseUp false is what keeps the puck map-aligned: the camera is not course-up, so an
    // arrow aligned to the viewport would point somewhere the car is not going.
    expect(
      planNavCamera({
        traceBearing: null,
        deviceHeading: 275,
        mapBearing: 0,
        lastBearing: 12,
      }),
    ).toEqual({ bearing: 275, courseUp: false });
  });

  it('keeps the last bearing when a parked fix has no heading', () => {
    // Non-vacuity: dropping this step is what let a stationary fix snap the view back to north.
    expect(
      planNavCamera({
        traceBearing: null,
        deviceHeading: -1,
        mapBearing: 0,
        lastBearing: 212,
      }),
    ).toEqual({ bearing: 212, courseUp: false });
  });

  it('never invents a bearing: the last resort is the map own bearing', () => {
    expect(
      planNavCamera({ traceBearing: null, deviceHeading: -1, mapBearing: 0 }),
    ).toEqual({ bearing: 0, courseUp: false });
    expect(
      planNavCamera({ traceBearing: null, deviceHeading: null, mapBearing: 44 }),
    ).toEqual({ bearing: 44, courseUp: false });
  });

  it('treats heading 0 as due north, not as "unknown"', () => {
    // expo-location reports "no heading" as a negative number; reading 0 as unknown pointed
    // every driver facing due north at their last known bearing instead.
    expect(
      planNavCamera({
        traceBearing: null,
        deviceHeading: 0,
        mapBearing: 180,
        lastBearing: 90,
      }),
    ).toEqual({ bearing: 0, courseUp: false });
  });

  it('ignores a non-finite bearing rather than passing NaN to the map', () => {
    expect(
      planNavCamera({
        traceBearing: Number.NaN,
        deviceHeading: Number.POSITIVE_INFINITY,
        mapBearing: 33,
      }),
    ).toEqual({ bearing: 33, courseUp: false });
  });

  it('normalises out-of-range bearings', () => {
    expect(
      planNavCamera({ traceBearing: 370, deviceHeading: null, mapBearing: 0 })
        .bearing,
    ).toBe(10);
    expect(
      planNavCamera({ traceBearing: -90, deviceHeading: null, mapBearing: 0 })
        .bearing,
    ).toBe(270);
  });
});
