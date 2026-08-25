/**
 * Canonical ride metrics from DB (see vector-elegans-docs DATABASE-SCHEMA):
 * - distance: kilometers
 * - duration: minutes
 *
 * Some clients store duration in seconds or distance in meters. When pickup /
 * dropoff coords exist, prefer the interpretation closest to haversine.
 */

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geoHintFromRide(ride: {
  pickup_lat?: number;
  pickup_lon?: number;
  dropoff_lat?: number;
  dropoff_lon?: number;
}): number | null {
  if (
    ride.pickup_lat == null ||
    ride.pickup_lon == null ||
    ride.dropoff_lat == null ||
    ride.dropoff_lon == null
  ) {
    return null;
  }
  const km = haversineKm(
    ride.pickup_lat,
    ride.pickup_lon,
    ride.dropoff_lat,
    ride.dropoff_lon,
  );
  return Number.isFinite(km) && km > 0 ? km : null;
}

/**
 * Normalize stored distance to kilometers.
 * @param geoHintKm Optional straight-line km (pickup→dropoff) to disambiguate
 *   meters vs long-haul km (e.g. 600 km vs 600 m).
 */
export function rideDistanceKm(
  distance: number | null | undefined,
  geoHintKm?: number | null,
): number | null {
  if (distance == null || !Number.isFinite(Number(distance))) return null;
  const n = Number(distance);
  if (n <= 0) return null;

  // Typical urban VTC: clearly kilometers
  if (n <= 400) return n;

  const asKm = n;
  const asMetersToKm = n / 1000;

  if (geoHintKm != null && geoHintKm > 0.05) {
    const errKm = Math.abs(asKm - geoHintKm) / geoHintKm;
    const errM = Math.abs(asMetersToKm - geoHintKm) / geoHintKm;
    // Prefer the unit that matches the map geometry
    if (errM + 0.05 < errKm) return asMetersToKm;
    if (errKm + 0.05 < errM) return asKm;
  }

  // No reliable geo: large values are meters (18_500 → 18.5 km);
  // 400–2000 without geo → treat as km (long-haul), not meters.
  if (n > 2000) return asMetersToKm;
  return asKm;
}

export function rideDurationMinutes(
  duration: number | null | undefined,
  distanceKm?: number | null,
): number | null {
  if (duration == null || !Number.isFinite(Number(duration))) return null;
  const n = Number(duration);
  if (n <= 0) return null;

  const km = distanceKm != null && distanceKm > 0 ? distanceKm : null;
  if (km != null) {
    const minPerKmIfMinutes = n / km;
    // e.g. 600 min / 2.5 km = 240 min/km → must be seconds
    if (minPerKmIfMinutes > 20) {
      return n / 60;
    }
    // e.g. 7 min / 600 km → absurdly fast; treat as broken, caller may re-estimate
    if (minPerKmIfMinutes < 0.15 && km > 30) {
      return null;
    }
    return n;
  }

  // Without distance: values ≥ 180 are often seconds
  if (n >= 180) return n / 60;
  return n;
}

export function formatRideDistanceKm(
  distance: number | null | undefined,
  geoHintKm?: number | null,
): string {
  const km = rideDistanceKm(distance, geoHintKm);
  if (km == null) return '—';
  if (km >= 100) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}

export function formatRideDurationMin(
  duration: number | null | undefined,
  distance?: number | null,
  geoHintKm?: number | null,
): string {
  const km = rideDistanceKm(distance, geoHintKm);
  const min = rideDurationMinutes(duration, km);
  if (min == null) return '—';
  return formatMinutesCompact(min);
}

/** Human duration for approach / trip chips (e.g. 12 min, 2h 05). */
export function formatMinutesCompact(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded >= 60) {
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return m > 0 ? `${h}h ${String(m).padStart(2, '0')}` : `${h}h`;
  }
  return `${rounded} min`;
}

export function resolveRideTripMetrics(ride: {
  distance?: number | null;
  duration?: number | null;
  pickup_lat?: number;
  pickup_lon?: number;
  dropoff_lat?: number;
  dropoff_lon?: number;
}): { distanceKm: number; durationMin: number } {
  const geoKm = geoHintFromRide(ride);
  let distanceKm = rideDistanceKm(ride.distance, geoKm);

  if (distanceKm == null && geoKm != null) {
    distanceKm = geoKm;
  }

  // DB value wildly off vs geometry → trust the map
  if (
    distanceKm != null &&
    geoKm != null &&
    geoKm > 2 &&
    (distanceKm < geoKm * 0.25 || distanceKm > geoKm * 4)
  ) {
    distanceKm = geoKm;
  }

  distanceKm = distanceKm ?? 0;

  let durationMin = rideDurationMinutes(ride.duration, distanceKm);
  if (durationMin == null && distanceKm > 0) {
    // ~70 km/h average for mixed / long trips; 30 km/h was urban-only
    const speedKmh = distanceKm > 40 ? 70 : 30;
    durationMin = (distanceKm / speedKmh) * 60;
  }
  durationMin = durationMin ?? 0;

  return { distanceKm, durationMin };
}

/** French pickup datetime for offer UI (e.g. "Aujourd'hui · 14:30") */
export function formatPickupDateTime(
  pickupTime: string | null | undefined,
): string | null {
  if (!pickupTime) return null;
  const date = new Date(pickupTime);
  if (Number.isNaN(date.getTime())) return null;

  const time = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const dayMs = 24 * 60 * 60 * 1000;

  if (target === today) return `Aujourd'hui · ${time}`;
  if (target === today + dayMs) return `Demain · ${time}`;
  if (target === today - dayMs) return `Hier · ${time}`;

  const day = date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${day} · ${time}`;
}
