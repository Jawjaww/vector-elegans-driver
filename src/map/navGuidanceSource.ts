/**
 * Literal source of the guidance helpers that run inside the map document.
 *
 * They are NOT injected with `Function.prototype.toString()`. The app ships Hermes bytecode —
 * both in the embedded release and, more importantly, in every OTA update — and Hermes discards
 * the source text. `fn.toString()` then returns the string `function foo() { [bytecode] }`, which
 * is a *valid* definition (a two-element array literal) and a `ReferenceError: bytecode is not
 * defined` on every call. Measured on device before this file existed: 1514 `nav_tick_error` and
 * 127 `nav_message_error`, all with that exact message, and zero `nav_off_route` ever recorded —
 * `latchOffRoute` is reached from inside `guideTickPlanned`, which called `snapToNavLine` first.
 *
 * Node/V8 still has the source, so a unit test importing the module and comparing two
 * `.toString()` results sees nothing wrong: the comparison is circular. Text survives every
 * engine, bytecode does not, so the fragment is written out here and interpolated as-is.
 *
 * `haversineMeters` and `bearingDegrees` — used by `snapToNavLine` — are already hard-coded in
 * `mapHtmlTemplate.ts` next to the injection point. Keep them there; this fragment relies on them
 * the same way the rest of the document does.
 *
 * navGuidanceSource.test.ts extracts this exact fragment from the built HTML (between the
 * VE_NAV_HELPERS markers) and evaluates it in a scope that contains nothing else, so a helper
 * left out is caught in CI instead of on a phone in traffic.
 */
export const NAV_GUIDANCE_SOURCE = `
function navSegmentProjection(p, a, b) {
  const lat0 = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const mx = (lng) => lng * Math.cos(lat0) * 111320;
  const my = (lat) => lat * 110540;
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
    t: t,
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  };
}

/**
 * Metres from a fix to the closest point of the polyline, never null and never throwing.
 *
 * Deliberately separate from snapToNavLine: this is what the off-route guard measures, and a
 * guard that depends on the thing it watches cannot report that thing failing. It only needs a
 * distance, so it never computes a bearing.
 */
function distanceToNavLine(coords, line) {
  if (!line || line.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const proj = navSegmentProjection(coords, line[i], line[i + 1]);
    const d = haversineMeters(coords, proj.point);
    if (d < best) best = d;
  }
  return best;
}

function snapToNavLine(coords, line, lookAheadM) {
  function pointAtDistance(path, meters) {
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
  let bestPoint = line[0];
  let bestTraveled = 0;
  let walked = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const segLen = haversineMeters(a, b);
    const proj = navSegmentProjection(coords, a, b);
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

function normaliseBearing(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

function deviceBearing(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return normaliseBearing(value);
}

function planNavCamera(input) {
  const trace = normaliseBearing(input.traceBearing);
  if (trace !== null) return { bearing: trace, courseUp: true };

  const device = deviceBearing(input.deviceHeading);
  if (device !== null) return { bearing: device, courseUp: false };

  const last = normaliseBearing(input.lastBearing);
  if (last !== null) return { bearing: last, courseUp: false };

  return { bearing: normaliseBearing(input.mapBearing) ?? 0, courseUp: false };
}
`;
