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

/** Drop a later fix coarser than this once a position is already held. */
export const GPS_MAX_ACCURACY_METERS = 80;

/** Reject an implied speed above this (~200 km/h) as a GPS jump. */
export const GPS_MAX_SPEED_MPS = 55;

/**
 * Speed is only judged against a fix accepted inside this window.
 * A stale anchor (the filter already dropped everything after a bad first fix)
 * must not freeze the puck forever.
 */
export const GPS_JUMP_WINDOW_MS = 5000;

export function gpsFixAcceptable(input: {
  accuracy: number | null | undefined;
  prev: GpsCoord | null;
  next: GpsCoord;
  elapsedMs: number;
  hasFix: boolean;
}): boolean {
  if (!Number.isFinite(input.next.lat) || !Number.isFinite(input.next.lng)) {
    return false;
  }
  if (
    input.hasFix &&
    typeof input.accuracy === 'number' &&
    Number.isFinite(input.accuracy) &&
    input.accuracy > GPS_MAX_ACCURACY_METERS
  ) {
    return false;
  }
  if (
    input.hasFix &&
    input.prev &&
    input.elapsedMs > 0 &&
    input.elapsedMs <= GPS_JUMP_WINDOW_MS
  ) {
    const speed = haversineMeters(input.prev, input.next) / (input.elapsedMs / 1000);
    if (speed > GPS_MAX_SPEED_MPS) return false;
  }
  return true;
}

/**
 * Street-level follow camera from ground speed (m/s).
 *
 * Deliberately tight, and fixed per band rather than interpolated: the driver reads the turn
 * ahead, not the neighbourhood. Standstill and city share the same framing so a red light does
 * not re-frame the map, and only a real motorway speed is allowed to pull back.
 */
export function navCameraForSpeed(speedMps: number | null | undefined): {
  zoom: number;
  pitch: number;
} {
  const kmh =
    typeof speedMps === 'number' && Number.isFinite(speedMps) && speedMps > 0
      ? speedMps * 3.6
      : 0;
  if (kmh > 70) return { zoom: 17, pitch: 40 };
  if (kmh >= 30) return { zoom: 18, pitch: 45 };
  return { zoom: 19, pitch: 50 };
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
