import {
  computeFitSpanKm,
  flattenFitCoordLists,
  resolveOfferFitCamera,
} from '../utils/offerMapZoom';

describe('resolveOfferFitCamera', () => {
  it('allows tight zoom under 2 km', () => {
    expect(resolveOfferFitCamera(1)).toEqual({ maxZoom: 15, boundsExpand: 1.0 });
  });

  it('moderates zoom between 2 and 5 km', () => {
    expect(resolveOfferFitCamera(4)).toEqual({ maxZoom: 14, boundsExpand: 1.02 });
  });

  it('uses legacy long-trip cap beyond 15 km', () => {
    expect(resolveOfferFitCamera(20)).toEqual({ maxZoom: 10, boundsExpand: 1.38 });
  });
});

describe('computeFitSpanKm', () => {
  it('returns max pairwise distance in km', () => {
    const paris: [number, number] = [2.3522, 48.8566];
    const nearby: [number, number] = [2.36, 48.86];
    const span = computeFitSpanKm([paris, nearby]);
    expect(span).toBeGreaterThan(0);
    expect(span).toBeLessThan(2);
  });
});

describe('flattenFitCoordLists', () => {
  it('merges nested lists', () => {
    expect(
      flattenFitCoordLists([
        [[1, 2], [3, 4]],
        [[5, 6]],
      ]),
    ).toHaveLength(3);
  });
});
