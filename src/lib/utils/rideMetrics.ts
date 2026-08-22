/**
 * Canonical ride metrics from DB (see vector-elegans-docs DATABASE-SCHEMA):
 * - distance: kilometers
 * - duration: minutes
 *
 * Some clients store duration in seconds (e.g. 600 = 10 min). Detect via
 * distance when available: > ~20 min/km as minutes is unrealistic for VTC.
 */

export function rideDistanceKm(
  distance: number | null | undefined,
): number | null {
  if (distance == null || !Number.isFinite(Number(distance))) return null;
  const n = Number(distance);
  if (n <= 0) return null;
  // Values above ~500 are almost certainly meters (e.g. 18500), not km
  if (n > 500) return n / 1000;
  return n;
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
    return n;
  }

  // Without distance: values ≥ 120 are ambiguous; prefer seconds when ≥ 180
  // (3h+ as minutes is rare for a single urban VTC leg).
  if (n >= 180) return n / 60;
  return n;
}

export function formatRideDistanceKm(
  distance: number | null | undefined,
): string {
  const km = rideDistanceKm(distance);
  if (km == null) return "—";
  return `${km.toFixed(1)} km`;
}

export function formatRideDurationMin(
  duration: number | null | undefined,
  distance?: number | null,
): string {
  const km = rideDistanceKm(distance);
  const min = rideDurationMinutes(duration, km);
  if (min == null) return "—";
  const rounded = Math.max(1, Math.round(min));
  if (rounded >= 60) {
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${rounded} min`;
}

/** Haversine fallback when DB distance is missing (result in km) */
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

export function resolveRideTripMetrics(ride: {
  distance?: number | null;
  duration?: number | null;
  pickup_lat?: number;
  pickup_lon?: number;
  dropoff_lat?: number;
  dropoff_lon?: number;
}): { distanceKm: number; durationMin: number } {
  let distanceKm = rideDistanceKm(ride.distance);
  if (
    distanceKm == null &&
    ride.pickup_lat != null &&
    ride.pickup_lon != null &&
    ride.dropoff_lat != null &&
    ride.dropoff_lon != null
  ) {
    distanceKm = haversineKm(
      ride.pickup_lat,
      ride.pickup_lon,
      ride.dropoff_lat,
      ride.dropoff_lon,
    );
  }
  distanceKm = distanceKm ?? 0;

  let durationMin = rideDurationMinutes(ride.duration, distanceKm);
  if (durationMin == null && distanceKm > 0) {
    durationMin = (distanceKm / 30) * 60;
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

  const time = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const dayMs = 24 * 60 * 60 * 1000;

  if (target === today) return `Aujourd'hui · ${time}`;
  if (target === today + dayMs) return `Demain · ${time}`;
  if (target === today - dayMs) return `Hier · ${time}`;

  const day = date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${day} · ${time}`;
}
