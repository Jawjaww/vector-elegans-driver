/** MapLibre/OSRM coordinate tuple [lng, lat]. */
export type LngLat = [number, number];

/**
 * Coordinates to include in offer-mode fitBounds: driver approach origin,
 * pickup→dropoff geometry (or straight segment), so GPS + both endpoints stay visible.
 */
export function buildOfferFitCoordLists(
  approachFrom: LngLat | null | undefined,
  start: LngLat,
  end: LngLat,
  tripCoords: LngLat[] | null | undefined,
  driverMarker?: LngLat | null,
): LngLat[][] {
  const trip =
    tripCoords && tripCoords.length > 1 ? tripCoords : [start, end];
  const points: LngLat[] = [];
  const driver = approachFrom ?? driverMarker ?? null;
  if (driver) {
    points.push(driver);
  }
  for (const coord of trip) {
    points.push(coord);
  }
  return [points];
}
