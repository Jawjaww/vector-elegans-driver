export type GpsCoord = { lat: number; lng: number };

/** Skip React/store GPS updates below this (puck still moves via postGpsCamera). */
export const GPS_STORE_MIN_METERS = 8;

export function haversineMeters(
  a: GpsCoord,
  b: GpsCoord,
): number {
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

/** True when we should write location into React state / Zustand. */
export function gpsMovedEnough(
  prev: GpsCoord | null | undefined,
  next: GpsCoord,
  minMeters: number = GPS_STORE_MIN_METERS,
): boolean {
  if (!prev) return true;
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  return haversineMeters(prev, next) >= minMeters;
}
