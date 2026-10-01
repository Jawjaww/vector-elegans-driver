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

/**
 * Point along a polyline at a given distance from its start.
 *
 * Shared by the snap (look-ahead bearing) and the display loop (speculative motion). A hollow
 * inner copy would let the two diverge, which is how a jumping puck and a turning camera end
 * up describing two different cars.
 */
function pointAlongNavLine(path, meters) {
  if (!path || path.length < 2) return null;
  if (!(typeof meters === "number") || !Number.isFinite(meters) || meters <= 0) {
    return path[0];
  }
  var left = meters;
  for (var i = 0; i < path.length - 1; i++) {
    var seg = haversineMeters(path[i], path[i + 1]);
    if (left <= seg || i === path.length - 2) {
      var t = seg === 0 ? 0 : Math.min(1, left / seg);
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ];
    }
    left -= seg;
  }
  return path[path.length - 1];
}

function snapToNavLine(coords, line, lookAheadM) {
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

  const ahead = pointAlongNavLine(line, bestTraveled + Math.max(0, lookAheadM));
  const bearing =
    ahead && haversineMeters(bestPoint, ahead) >= 1
      ? bearingDegrees(bestPoint, ahead)
      : bearingDegrees(line[line.length - 2], line[line.length - 1]);

  return { point: bestPoint, traveledMeters: bestTraveled, bearing };
}

/**
 * Display-loop policy. GPS is a correction, never the paint clock.
 *
 * Snap only while the fix is close *and* (when moving) the heading agrees — past that the puck
 * follows the raw fix, so leaving the route is visible before the reroute latches. Speculation
 * may run at most NAV_MAX_LEAD_METERS ahead of the last match; a lagging fix is ignored rather
 * than pulling the arrow backwards; a teleport either way reseeds.
 */
var NAV_SNAP_METERS = 22;
var NAV_SNAP_HEADING_DEG = 50;
var NAV_SNAP_MIN_SPEED_MPS = 2;
var NAV_MAX_LEAD_METERS = 40;
var NAV_CATCH_UP_MPS = 4;
var NAV_BACKWARD_IGNORE_M = 15;
var NAV_BACKWARD_RESET_M = 80;
var NAV_MAX_DT_S = 0.1;

function headingDeltaDegrees(a, b) {
  const na = normaliseBearing(a);
  const nb = normaliseBearing(b);
  if (na === null || nb === null) return null;
  var d = Math.abs(na - nb);
  return d > 180 ? 360 - d : d;
}

function canSnapToNavLine(dist, heading, routeBearing, speedMps) {
  if (!(typeof dist === "number") || !Number.isFinite(dist) || dist > NAV_SNAP_METERS) {
    return false;
  }
  var speed =
    typeof speedMps === "number" && Number.isFinite(speedMps) ? speedMps : 0;
  if (speed < NAV_SNAP_MIN_SPEED_MPS) return true;
  var delta = headingDeltaDegrees(heading, routeBearing);
  if (delta === null) return true;
  return delta <= NAV_SNAP_HEADING_DEG;
}

function emptyNavMotion() {
  return { progressM: null, gpsProgressM: null, catchUpM: null };
}

function correctNavProgress(state, gpsProgress) {
  var seed = state || emptyNavMotion();
  if (typeof gpsProgress !== "number" || !Number.isFinite(gpsProgress) || gpsProgress < 0) {
    return seed;
  }
  var progress = seed.progressM;
  if (typeof progress !== "number" || !Number.isFinite(progress)) {
    return { progressM: gpsProgress, gpsProgressM: gpsProgress, catchUpM: null };
  }
  var ahead = gpsProgress - progress;
  if (ahead > NAV_BACKWARD_RESET_M) {
    return { progressM: gpsProgress, gpsProgressM: gpsProgress, catchUpM: null };
  }
  var behind = progress - gpsProgress;
  if (behind > NAV_BACKWARD_RESET_M) {
    return { progressM: gpsProgress, gpsProgressM: gpsProgress, catchUpM: null };
  }
  if (behind > 0 && behind <= NAV_BACKWARD_IGNORE_M) {
    return {
      progressM: progress,
      gpsProgressM: gpsProgress,
      catchUpM: seed.catchUpM,
    };
  }
  if (gpsProgress > progress) {
    return {
      progressM: progress,
      gpsProgressM: gpsProgress,
      catchUpM: gpsProgress,
    };
  }
  return {
    progressM: progress,
    gpsProgressM: gpsProgress,
    catchUpM: seed.catchUpM,
  };
}

function advanceNavProgress(state, dt, speedMps) {
  var seed = state || emptyNavMotion();
  var progress = seed.progressM;
  if (typeof progress !== "number" || !Number.isFinite(progress)) return seed;
  var step =
    typeof dt === "number" && Number.isFinite(dt)
      ? Math.max(0, Math.min(NAV_MAX_DT_S, dt))
      : 0;
  if (step === 0) return seed;
  var speed =
    typeof speedMps === "number" && Number.isFinite(speedMps) && speedMps > 0
      ? speedMps
      : 0;
  var gps = seed.gpsProgressM;
  var lead = typeof gps === "number" ? progress - gps : 0;
  var v = speed;
  if (typeof seed.catchUpM === "number" && seed.catchUpM > progress) {
    v = speed + NAV_CATCH_UP_MPS;
  }
  if (lead >= NAV_MAX_LEAD_METERS) v = 0;
  var next = progress + v * step;
  var catchUp = seed.catchUpM;
  if (typeof catchUp === "number" && next >= catchUp) {
    next = catchUp;
    catchUp = null;
  }
  return {
    progressM: next,
    gpsProgressM: seed.gpsProgressM,
    catchUpM: catchUp,
  };
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
