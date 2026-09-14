import { buildOfferFitCoordLists } from '../utils/offerRouteFit';

const driver: [number, number] = [2.34, 48.84];
const pickup: [number, number] = [2.35, 48.85];
const dropoff: [number, number] = [2.36, 48.86];
const tripGeometry: [number, number][] = [
  pickup,
  [2.355, 48.852],
  dropoff,
];

describe('buildOfferFitCoordLists', () => {
  it('includes approachFrom before trip geometry for offer fitBounds', () => {
    const lists = buildOfferFitCoordLists(driver, pickup, dropoff, tripGeometry);
    expect(lists).toHaveLength(1);
    expect(lists[0][0]).toEqual(driver);
    expect(lists[0]).toEqual([driver, ...tripGeometry]);
  });

  it('falls back to driverMarker when approachFrom is missing', () => {
    const lists = buildOfferFitCoordLists(
      null,
      pickup,
      dropoff,
      tripGeometry,
      driver,
    );
    expect(lists[0][0]).toEqual(driver);
  });

  it('uses start/end when trip geometry is empty', () => {
    const lists = buildOfferFitCoordLists(driver, pickup, dropoff, []);
    expect(lists[0]).toEqual([driver, pickup, dropoff]);
  });

  it('fits trip only when no driver origin is known', () => {
    const lists = buildOfferFitCoordLists(null, pickup, dropoff, tripGeometry);
    expect(lists[0]).toEqual(tripGeometry);
  });
});
