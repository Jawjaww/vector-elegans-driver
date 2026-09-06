export type OfferApproachPoint = { lat: number; lng: number };

/** ~50 m grid — stable enough for OSRM, coarse enough to ignore GPS jitter. */
export function roundOfferApproachCoord(
  loc: OfferApproachPoint,
): OfferApproachPoint {
  return {
    lat: Math.round(loc.lat * 2e3) / 2e3,
    lng: Math.round(loc.lng * 2e3) / 2e3,
  };
}

/**
 * First GPS fix for the current offer wins.
 * Later ticks must not change the value — that would bump updateRoute and abort the trip OSRM.
 */
export function seedOfferApproach(
  prev: OfferApproachPoint | undefined,
  location: OfferApproachPoint | null | undefined,
): OfferApproachPoint | undefined {
  if (prev) return prev;
  if (!location) return undefined;
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return undefined;
  }
  return roundOfferApproachCoord(location);
}
