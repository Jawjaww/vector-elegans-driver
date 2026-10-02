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
 * The arrow's position is an estimate, not a projection: progressM is integrated from a speed
 * estimate on every frame, and each GPS match pulls it with a proportional spring instead of
 * assigning it. The previous model advanced by the platform speed alone (correctNavProgress and
 * advanceNavProgress), so a fix that carried no speed left the arrow frozen between fixes and
 * then teleporting onto the next one — and a 15-80 m disagreement was left uncorrected until a
 * hard reseed. That is the stutter this replaces.
 */

/** How close a fix must be to the line before it is allowed to correct the arrow. */
var NAV_SNAP_METERS = 22;
var NAV_SNAP_HEADING_DEG = 50;
var NAV_SNAP_MIN_SPEED_MPS = 2;
/** The display may lag the last match by this much: the catch-up spring's clamp, in metres. */
var NAV_MAX_CATCHUP_METERS = 25;
/** It may lead it by this much. A lead is speculation, so it is kept below the catch-up. */
var NAV_MAX_LEAD_METERS = 12;
/** Proportional correction, 1/s. An offset closes over ~1 s, never inside a single frame. */
var NAV_SPRING_PER_S = 1.4;
/** A gap this wide is not a correction to apply: only a new line (reroute) re-seats the arrow. */
var NAV_RESYNC_METERS = 120;
/** Speed estimate: EMA over matched fixes, clamped to a plausible road speed. */
var NAV_SPEED_EMA = 0.4;
var NAV_SPEED_MAX_MPS = 60;
var NAV_SPEED_MIN_MOVE_M = 1.5;
/** No fix for this long and the estimate stops: a frozen GPS must freeze the arrow. */
var NAV_GPS_STALE_MS = 4000;
/** Bearing slew, deg/s. Caps how fast the world rotates at a corner. */
var NAV_BEARING_SLEW_DEG_PER_S = 120;
/** Below this speed the heading is noise, so the bearing is held. */
var NAV_BEARING_MIN_SPEED_MPS = 0.5;
/** One frame's dt is clamped, so a recovered loop cannot jump the arrow forward. */
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
  return {
    progressM: null,
    gpsProgressM: null,
    vEst: 0,
    lastGpsProgressM: null,
    lastGpsAtMs: null,
  };
}

/**
 * Speed estimate, in m/s, from the progress between two GPS matches.
 *
 * Measured between two matches rather than read from the platform, because coords.speed comes
 * back null often enough on the devices at hand that trusting it alone is what froze the
 * arrow between fixes. A match that did not move is a stop; a backwards or absurd jump is
 * dropped rather than turned into a fake speed. The platform speed is only the fallback.
 */
function estimateNavSpeed(state, gpsProgressM, nowMs, coordsSpeedMps) {
  var seed = state || emptyNavMotion();
  var prev =
    typeof seed.vEst === "number" && Number.isFinite(seed.vEst) ? seed.vEst : 0;
  var capture =
    typeof gpsProgressM === "number" && Number.isFinite(gpsProgressM)
      ? gpsProgressM
      : null;
  var sample = null;
  var source = "none";
  if (
    capture !== null &&
    typeof nowMs === "number" &&
    Number.isFinite(nowMs) &&
    typeof seed.lastGpsProgressM === "number" &&
    typeof seed.lastGpsAtMs === "number"
  ) {
    var dt = (nowMs - seed.lastGpsAtMs) / 1000;
    var moved = capture - seed.lastGpsProgressM;
    if (dt >= 0.3 && dt <= 15) {
      if (moved >= NAV_SPEED_MIN_MOVE_M) {
        sample = moved / dt;
        source = "derived";
      } else if (moved >= -NAV_SPEED_MIN_MOVE_M) {
        sample = 0;
        source = "derived";
      }
    }
  }
  if (sample === null) {
    var device =
      typeof coordsSpeedMps === "number" &&
      Number.isFinite(coordsSpeedMps) &&
      coordsSpeedMps >= 0
        ? coordsSpeedMps
        : null;
    if (device !== null) {
      sample = device;
      source = "coords";
    }
  }
  var next = prev;
  if (sample !== null) {
    if (sample > NAV_SPEED_MAX_MPS) sample = NAV_SPEED_MAX_MPS;
    next = prev + (sample - prev) * NAV_SPEED_EMA;
  }
  return {
    vEst: next,
    speedSource: source,
    lastGpsProgressM: capture !== null ? capture : seed.lastGpsProgressM,
    lastGpsAtMs: capture !== null ? nowMs : seed.lastGpsAtMs,
  };
}

/**
 * One integration step of the display clock. Pure: the caller assigns the result.
 *
 * Velocity is the estimate plus a proportional pull toward the last match, so a correction is
 * spread over frames instead of landing as a teleport; the pull is clamped both ways, and the
 * result can never be negative — a lagging fix must not drive the arrow backwards. When no fix
 * has arrived for NAV_GPS_STALE_MS the estimate is dropped to zero: extrapolating a last known
 * speed forever is what put the displayed car kilometres past the real one.
 */
function stepNavMotion(state, dt, nowMs) {
  var seed = state || emptyNavMotion();
  var progress = seed.progressM;
  if (typeof progress !== "number" || !Number.isFinite(progress)) return seed;
  var step =
    typeof dt === "number" && Number.isFinite(dt)
      ? Math.max(0, Math.min(NAV_MAX_DT_S, dt))
      : 0;
  if (step === 0) return seed;
  var vEst =
    typeof seed.vEst === "number" && Number.isFinite(seed.vEst) ? seed.vEst : 0;
  if (
    typeof nowMs === "number" &&
    Number.isFinite(nowMs) &&
    typeof seed.lastGpsAtMs === "number" &&
    nowMs - seed.lastGpsAtMs > NAV_GPS_STALE_MS
  ) {
    vEst = 0;
  }
  var gps = seed.gpsProgressM;
  var offset =
    typeof gps === "number" && Number.isFinite(gps) ? gps - progress : 0;
  if (offset > NAV_MAX_CATCHUP_METERS) offset = NAV_MAX_CATCHUP_METERS;
  if (offset < -NAV_MAX_LEAD_METERS) offset = -NAV_MAX_LEAD_METERS;
  var v = vEst + NAV_SPRING_PER_S * offset;
  if (v < 0) v = 0;
  return {
    progressM: progress + v * step,
    gpsProgressM: seed.gpsProgressM,
    vEst: seed.vEst,
    lastGpsProgressM: seed.lastGpsProgressM,
    lastGpsAtMs: seed.lastGpsAtMs,
  };
}

/**
 * Slew the camera and puck bearing toward the route azimuth instead of adopting it outright.
 *
 * A look-ahead bearing is a step function at every vertex, so painting it raw makes the whole
 * map snap at each corner. The slew is held below a walking pace, where a GPS heading is noise.
 */
function smoothNavBearing(prevBearing, targetBearing, dt, speedMps) {
  var target = normaliseBearing(targetBearing);
  if (target === null) return normaliseBearing(prevBearing);
  var prev = normaliseBearing(prevBearing);
  if (prev === null) return target;
  var speed =
    typeof speedMps === "number" && Number.isFinite(speedMps) ? speedMps : 0;
  if (speed < NAV_BEARING_MIN_SPEED_MPS) return prev;
  var step =
    typeof dt === "number" && Number.isFinite(dt)
      ? Math.max(0, Math.min(NAV_MAX_DT_S, dt))
      : 0;
  if (step === 0) return prev;
  var delta = target - prev;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  var maxStep = NAV_BEARING_SLEW_DEG_PER_S * step;
  if (Math.abs(delta) <= maxStep) return target;
  return normaliseBearing(prev + (delta > 0 ? maxStep : -maxStep));
}

/**
 * True when the display and the last match are too far apart for the spring to explain.
 *
 * Only a new line (a reroute) or a GPS teleport produces a gap this wide, and both are moments
 * where re-seating the arrow is expected. Everything smaller closes through the spring.
 */
function shouldResyncNav(progressM, gpsProgressM) {
  if (
    typeof progressM !== "number" ||
    !Number.isFinite(progressM) ||
    typeof gpsProgressM !== "number" ||
    !Number.isFinite(gpsProgressM)
  ) {
    return false;
  }
  return Math.abs(gpsProgressM - progressM) > NAV_RESYNC_METERS;
}

/** Cumulative distance at each vertex, so a frame can binary-search instead of walking. */
function navCumulativeLengths(line) {
  var cum = [0];
  for (var i = 0; i < line.length - 1; i++) {
    cum.push(cum[i] + haversineMeters(line[i], line[i + 1]));
  }
  return cum;
}

/** Point at a distance along the line, resolved by binary search over the cumulative table. */
function navPointAtDistance(line, cum, meters) {
  if (!line || line.length < 2 || !cum || cum.length !== line.length) return null;
  var total = cum[cum.length - 1];
  var m = typeof meters === "number" && Number.isFinite(meters) ? meters : 0;
  if (m <= 0) return line[0];
  if (m >= total) return line[line.length - 1];
  var lo = 0;
  var hi = cum.length - 1;
  while (lo + 1 < hi) {
    var mid = (lo + hi) >> 1;
    if (cum[mid] <= m) lo = mid;
    else hi = mid;
  }
  var seg = cum[hi] - cum[lo];
  var t = seg === 0 ? 0 : Math.min(1, Math.max(0, (m - cum[lo]) / seg));
  return [
    line[lo][0] + (line[hi][0] - line[lo][0]) * t,
    line[lo][1] + (line[hi][1] - line[lo][1]) * t,
  ];
}

/**
 * Azimuth of the line at a distance, looking ahead by a short fixed amount.
 *
 * A per-frame call, so it must not walk the polyline: both endpoints come from the cumulative
 * table. Near the end of the line the look-ahead collapses onto the last vertex, and the final
 * segment's own bearing is used rather than a bearing between two coincident points.
 */
function navBearingAtDistance(line, cum, meters, lookAheadM) {
  if (!line || line.length < 2 || !cum || cum.length !== line.length) return null;
  var aheadM = typeof lookAheadM === "number" && lookAheadM > 0 ? lookAheadM : 0;
  var from = navPointAtDistance(line, cum, meters);
  var ahead = navPointAtDistance(line, cum, meters + aheadM);
  if (from && ahead && haversineMeters(from, ahead) >= 1) {
    return bearingDegrees(from, ahead);
  }
  var tailFrom = line[line.length - 2];
  var tailTo = line[line.length - 1];
  if (haversineMeters(tailFrom, tailTo) < 0.5) return null;
  return bearingDegrees(tailFrom, tailTo);
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
