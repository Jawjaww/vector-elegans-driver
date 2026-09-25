/** [lng, lat], the order MapLibre and the nav polyline already use. */
export type LngLat = [number, number];

export type RouteSnap = {
  /** GPS dropped onto the nearest point of a segment, not onto a vertex. */
  point: LngLat;
  /** Metres from the start of the polyline to `point`. */
  traveledMeters: number;
  /** Bearing toward a point `lookAheadM` further along the line, degrees clockwise from north. */
  bearing: number;
};

export function haversineMeters(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDegrees(from: LngLat, to: LngLat): number {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const φ1 = from[1] * toRad;
  const φ2 = to[1] * toRad;
  const Δλ = (to[0] - from[0]) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * toDeg + 360) % 360;
}

/**
 * Drop `coords` onto the closest point of any segment, then face a point further along
 * that same line. Nearest-vertex search is what made the arrow flip between corners.
 */
export function snapToNavLine(
  coords: LngLat,
  line: LngLat[],
  lookAheadM: number,
): RouteSnap | null {
  function projectOnSegment(p: LngLat, a: LngLat, b: LngLat) {
    const lat0 = ((a[1] + b[1]) / 2) * (Math.PI / 180);
    const mx = (lng: number) => lng * Math.cos(lat0) * 111320;
    const my = (lat: number) => lat * 110540;
    const ax = mx(a[0]);
    const ay = my(a[1]);
    const bx = mx(b[0]) - ax;
    const by = my(b[1]) - ay;
    const px = mx(p[0]) - ax;
    const py = my(p[1]) - ay;
    const len2 = bx * bx + by * by;
    const t =
      len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / len2));
    return {
      t,
      point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as LngLat,
    };
  }

  function pointAtDistance(path: LngLat[], meters: number): LngLat {
    if (meters <= 0) return path[0];
    let left = meters;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = haversineMeters(path[i], path[i + 1]);
      if (left <= seg || i === path.length - 2) {
        const t = seg === 0 ? 0 : Math.min(1, left / seg);
        return [
          path[i][0] + (path[i + 1][0] - path[i][0]) * t,
          path[i][1] + (path[i + 1][1] - path[i][1]) * t,
        ];
      }
      left -= seg;
    }
    return path[path.length - 1];
  }

  if (!line || line.length < 2) return null;

  let bestDist = Infinity;
  let bestPoint: LngLat = line[0];
  let bestTraveled = 0;
  let walked = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const segLen = haversineMeters(a, b);
    const proj = projectOnSegment(coords, a, b);
    const dist = haversineMeters(coords, proj.point);
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = proj.point;
      bestTraveled = walked + proj.t * segLen;
    }
    walked += segLen;
  }

  const ahead = pointAtDistance(line, bestTraveled + Math.max(0, lookAheadM));
  const bearing =
    haversineMeters(bestPoint, ahead) >= 1
      ? bearingDegrees(bestPoint, ahead)
      : bearingDegrees(line[line.length - 2], line[line.length - 1]);

  return { point: bestPoint, traveledMeters: bestTraveled, bearing };
}
