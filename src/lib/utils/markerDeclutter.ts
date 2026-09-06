export type ScreenPt = { x: number; y: number };
export type GeoPt = { lat: number; lng: number };

/**
 * If GPS and pickup are closer than this on screen, the pickup pin is
 * negligible (long-trip dezoom) and should be hidden.
 */
export const OFFER_GPS_MIN_SEPARATION_PX = 48;

/**
 * Hide the orange approach polyline only when the driver is already this close
 * (meters). Screen-pixel proximity alone is too strict after a long-trip dezoom:
 * GPS and pickup can sit under 48px while still being kilometers apart.
 */
export const OFFER_APPROACH_HIDE_MAX_METERS = 250;

export function markersOverlapOnScreen(
  a: ScreenPt,
  b: ScreenPt,
  minSeparation: number,
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < minSeparation;
}

/** Rough great-circle distance in meters (good enough for declutter thresholds). */
export function geoDistanceMeters(a: GeoPt, b: GeoPt): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Approach dotted line: hide only when geographically near the pickup.
 * Do not use screen px — dezoom makes far points look stacked.
 */
export function shouldHideOfferApproach(
  gps: GeoPt,
  pickup: GeoPt,
  maxMeters: number = OFFER_APPROACH_HIDE_MAX_METERS,
): boolean {
  return geoDistanceMeters(gps, pickup) < maxMeters;
}
