// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require("fs") as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require("path") as { join: (...parts: string[]) => string };

import { buildMapHtmlTemplate } from "../mapHtmlTemplate";

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();
const TEMPLATE = "src/map/mapHtmlTemplate.ts";

/**
 * The guidance core runs inside the map document, embedded as literal text between markers.
 *
 * The previous version of this suite imported the helpers and compared two `toString()` results,
 * which is circular: Node/V8 keeps the source, Hermes does not. `fn.toString()` on a release build
 * returns a bytecode placeholder, so every guidance call threw
 * `ReferenceError: bytecode is not defined` on the phone while the suite stayed green.
 *
 * So this suite reads the fragments the document actually receives, and evaluates them in a scope
 * that contains nothing else. A helper left out of a fragment is then a real failure, not an
 * import that resolves.
 */
function mapHtml(): string {
  return buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });
}

function extractBetween(html: string, startMarker: string, endMarker: string) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

function navScope(): Record<string, any> {
  const fragment = extractBetween(
    mapHtml(),
    "/* VE_NAV_HELPERS_START */",
    "/* VE_NAV_HELPERS_END */",
  );
  // eslint-disable-next-line no-new-func
  return new Function(
    `${fragment}
    return {
      snapToNavLine: snapToNavLine,
      planNavCamera: planNavCamera,
      normaliseBearing: normaliseBearing,
      deviceBearing: deviceBearing,
      haversineMeters: haversineMeters,
      bearingDegrees: bearingDegrees,
      distanceToNavLine: distanceToNavLine,
      pointAlongNavLine: pointAlongNavLine,
      canSnapToNavLine: canSnapToNavLine,
      emptyNavMotion: emptyNavMotion,
      estimateNavSpeed: estimateNavSpeed,
      stepNavMotion: stepNavMotion,
      smoothNavBearing: smoothNavBearing,
      shouldResyncNav: shouldResyncNav,
      navCumulativeLengths: navCumulativeLengths,
      navPointAtDistance: navPointAtDistance,
      navBearingAtDistance: navBearingAtDistance,
      headingDeltaDegrees: headingDeltaDegrees,
      NAV_SNAP_METERS: NAV_SNAP_METERS,
      NAV_MAX_CATCHUP_METERS: NAV_MAX_CATCHUP_METERS,
      NAV_MAX_LEAD_METERS: NAV_MAX_LEAD_METERS,
      NAV_SPRING_PER_S: NAV_SPRING_PER_S,
      NAV_RESYNC_METERS: NAV_RESYNC_METERS,
      NAV_SPEED_MIN_MOVE_M: NAV_SPEED_MIN_MOVE_M,
      NAV_GPS_STALE_MS: NAV_GPS_STALE_MS,
      NAV_MAX_DT_S: NAV_MAX_DT_S,
    };`,
  )();
}

/** The off-route guard, run against a stub document so its thresholds can be driven. */
function offRouteGuardScope(nav: Record<string, any>) {
  const fragment = extractBetween(
    mapHtml(),
    "/* VE_OFF_ROUTE_GUARD_START */",
    "/* VE_OFF_ROUTE_GUARD_END */",
  );
  const posted: Record<string, unknown>[] = [];
  const fakeWindow = {
    __veNav: nav,
    ReactNativeWebView: {
      postMessage: (raw: string) => posted.push(JSON.parse(raw)),
    },
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(
    "window",
    `${fragment}
    return {
      latchOffRoute: latchOffRoute,
      clearOffRouteLatch: clearOffRouteLatch,
      navLineIsRoad: navLineIsRoad,
      OFF_ROUTE_METERS: OFF_ROUTE_METERS,
      OFF_ROUTE_MS: OFF_ROUTE_MS,
    };`,
  )(fakeWindow);
  return { api, posted, nav };
}

const ROAD_LINE: [number, number][] = [
  [2.3, 48.84],
  [2.302, 48.84],
  [2.304, 48.84],
];

function navWith(line: [number, number][] | null) {
  return { line: line, offRouteSince: null, awaitingReroute: false };
}

describe("guidance fragment injection contract", () => {
  it("is embedded as source text, never as a toString() result", () => {
    // The regression: Hermes discards the source, `.toString()` returns a bytecode placeholder,
    // and the definition is valid while every call throws. Nothing on Node can reproduce that, so
    // the only CI guard is the shape of the template source itself.
    const source = readFileSync(join(REPO_ROOT, TEMPLATE), "utf8");
    expect(source).not.toMatch(/\$\{[^}]*\.toString\(\)/);
    expect(source).toContain("VE_NAV_HELPERS_START");
    expect(source).toContain("VE_NAV_HELPERS_END");
  });

  it("defines every helper the document calls", () => {
    const scope = navScope();
    for (const name of [
      "snapToNavLine",
      "planNavCamera",
      "normaliseBearing",
      "deviceBearing",
      "haversineMeters",
      "bearingDegrees",
      "distanceToNavLine",
      "pointAlongNavLine",
      "canSnapToNavLine",
      "estimateNavSpeed",
      "stepNavMotion",
      "smoothNavBearing",
      "shouldResyncNav",
      "navCumulativeLengths",
      "navPointAtDistance",
      "navBearingAtDistance",
    ]) {
      expect(typeof scope[name]).toBe("function");
    }
  });

  it("probes the helpers on the device, so a hollow injection names itself", () => {
    // Node cannot reproduce Hermes, so the boot probe is the only observer that runs where the
    // bug lives. It must stay wired into the map load.
    const html = mapHtml();
    expect(html).toContain("function navInjectionProbe()");
    expect(html).toContain('source: "navInjectionProbe"');
  });
});

describe("distanceToNavLine", () => {
  it("measures the drift without snapping, and never throws", () => {
    const { distanceToNavLine } = navScope();
    expect(distanceToNavLine([2.3, 48.84], ROAD_LINE)).toBeLessThan(1);
    // ~60 m north of the line.
    const off = [2.3, 48.840539];
    expect(distanceToNavLine(off, ROAD_LINE)).toBeGreaterThan(45);
    expect(distanceToNavLine(off, ROAD_LINE)).toBeLessThan(80);
    // Past the end of the polyline, where a vertex-only walk would under-report.
    expect(distanceToNavLine([2.306, 48.84], ROAD_LINE)).toBeGreaterThan(100);
    // A chord is not a road, and an empty line has no distance to give.
    expect(distanceToNavLine([2.3, 48.84], [])).toBe(Infinity);
    expect(distanceToNavLine([2.3, 48.84], null)).toBe(Infinity);
  });
});

describe("off-route guard", () => {
  it("latches after 2.5 s of continuous drift, not after N fixes", () => {
    const { api, posted, nav } = offRouteGuardScope(navWith(ROAD_LINE));
    expect(api.OFF_ROUTE_METERS).toBe(30);
    expect(api.OFF_ROUTE_MS).toBe(2500);

    expect(api.latchOffRoute([2.3, 48.842], 60, 0)).toBe(false);
    expect(api.latchOffRoute([2.3, 48.842], 60, 1000)).toBe(false);
    expect(api.latchOffRoute([2.3, 48.842], 60, 2499)).toBe(false);
    expect(posted).toHaveLength(0);

    expect(api.latchOffRoute([2.3, 48.842], 60, 2500)).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: "offRoute", lng: 2.3 });
    expect(nav.awaitingReroute).toBe(true);
  });

  it("restarts the window when a fix comes back inside the threshold", () => {
    const { api } = offRouteGuardScope(navWith(ROAD_LINE));
    api.latchOffRoute([2.3, 48.842], 60, 0);
    api.latchOffRoute([2.3, 48.842], 60, 2000);
    expect(api.latchOffRoute([2.3, 48.84], 10, 2100)).toBe(false);
    expect(api.latchOffRoute([2.3, 48.842], 60, 2101)).toBe(false);
    expect(api.latchOffRoute([2.3, 48.842], 60, 4601)).toBe(true);
  });

  it("never latches on a two-point chord: the guard needs a real road line", () => {
    // markRouteFailed leaves a chord, and navLineIsRoad() rejects it. Without a retry the driver
    // is left unguided with the guard disarmed, which is the state this suite pins.
    const { api, posted } = offRouteGuardScope(
      navWith([
        [2.3, 48.84],
        [2.304, 48.84],
      ]),
    );
    expect(api.navLineIsRoad()).toBe(false);
    for (let t = 0; t <= 8000; t += 500) {
      expect(api.latchOffRoute([2.3, 48.85], 500, t)).toBe(false);
    }
    expect(posted).toHaveLength(0);
  });

  it("stays latched until the line is replaced", () => {
    const { api } = offRouteGuardScope(navWith(ROAD_LINE));
    api.latchOffRoute([2.3, 48.842], 60, 0);
    expect(api.latchOffRoute([2.3, 48.842], 60, 2500)).toBe(true);
    // Back on the line, still awaiting: one reroute per latch, not one per tick.
    expect(api.latchOffRoute([2.3, 48.84], 1, 3000)).toBe(true);
    api.clearOffRouteLatch();
    expect(api.latchOffRoute([2.3, 48.84], 1, 3100)).toBe(false);
  });

  it("does not treat a burst of frames as a completed window", () => {
    const { api, posted } = offRouteGuardScope(navWith(ROAD_LINE));
    for (let i = 0; i < 60; i++) {
      expect(api.latchOffRoute([2.3, 48.842], 60, i * 16)).toBe(false);
    }
    expect(posted).toHaveLength(0);
  });

  it("measures the drift before the helpers that can throw", () => {
    const source = readFileSync(join(REPO_ROOT, TEMPLATE), "utf8");
    const tick = source.slice(source.indexOf("function guideTickPlanned"));
    const latchAt = tick.indexOf("latchOffRoute(");
    const snapAt = tick.indexOf("snapToNavLine(coords, line, 60)");
    expect(tick).toContain("distanceToNavLine(coords, line)");
    expect(latchAt).toBeGreaterThanOrEqual(0);
    expect(snapAt).toBeGreaterThan(latchAt);
  });
});

describe("snapToNavLine", () => {
  it("drops the GPS onto the segment and faces further along it", () => {
    const { snapToNavLine, bearingDegrees } = navScope();
    const snap = snapToNavLine([2.301, 48.8404], ROAD_LINE, 60);
    expect(snap).not.toBeNull();
    expect(snap.point[1]).toBeCloseTo(48.84, 4);
    expect(snap.traveledMeters).toBeGreaterThan(50);
    expect(snap.traveledMeters).toBeLessThan(200);
    expect(snap.bearing).toBeGreaterThan(70);
    expect(snap.bearing).toBeLessThan(110);
    expect(bearingDegrees(ROAD_LINE[0], ROAD_LINE[1])).toBeGreaterThan(70);
  });

  it("returns null when there is no usable line", () => {
    const { snapToNavLine } = navScope();
    expect(snapToNavLine([2.3, 48.84], [], 60)).toBeNull();
    expect(snapToNavLine([2.3, 48.84], [[2.3, 48.84]], 60)).toBeNull();
  });
});

describe("speculative display motion", () => {
  const T0 = 1_700_000_000_000;

  function moving(progressM: number, gpsProgressM: number) {
    return {
      progressM: progressM,
      gpsProgressM: gpsProgressM,
      vEst: 20,
      lastGpsProgressM: gpsProgressM,
      lastGpsAtMs: T0,
    };
  }

  it("advances between fixes even when the platform reports no speed", () => {
    // The measured failure: `coords.speed` null left the model at zero and the arrow frozen
    // between two fixes, then teleported onto the next one.
    const { estimateNavSpeed, stepNavMotion, emptyNavMotion } = navScope();
    const seeded = {
      ...emptyNavMotion(),
      progressM: 100,
      gpsProgressM: 100,
      lastGpsProgressM: 100,
      lastGpsAtMs: T0,
    };
    const estimate = estimateNavSpeed(seeded, 104, T0 + 1000, undefined);
    expect(estimate.speedSource).toBe("derived");
    expect(estimate.vEst).toBeGreaterThan(0);
    const step = stepNavMotion(
      { ...seeded, vEst: estimate.vEst },
      0.05,
      T0 + 1000,
    );
    expect(step.progressM).toBeGreaterThan(100);
  });

  it("prefers the speed derived from two matches over the platform one", () => {
    const { estimateNavSpeed, emptyNavMotion } = navScope();
    const seeded = { ...emptyNavMotion(), lastGpsProgressM: 0, lastGpsAtMs: T0 };
    const estimate = estimateNavSpeed(seeded, 20, T0 + 1000, 3);
    expect(estimate.speedSource).toBe("derived");
    // EMA toward 20 m/s, not toward the 3 m/s the platform reported.
    expect(estimate.vEst).toBeGreaterThan(6);
  });

  it("reads a match that did not move as a stop", () => {
    const { estimateNavSpeed, emptyNavMotion } = navScope();
    const seeded = {
      ...emptyNavMotion(),
      lastGpsProgressM: 50,
      lastGpsAtMs: T0,
    };
    const stopped = estimateNavSpeed(seeded, 50.2, T0 + 1000, undefined);
    expect(stopped.speedSource).toBe("derived");
    expect(stopped.vEst).toBeLessThan(1);
  });

  it("closes a correction over several frames instead of teleporting onto the fix", () => {
    const { stepNavMotion } = navScope();
    // A 30 m gap: one frame moves a fraction of it, never all of it.
    const state = moving(100, 130);
    const first = stepNavMotion(state, 0.05, T0);
    expect(first.progressM).toBeGreaterThan(100);
    expect(first.progressM - 100).toBeLessThan(5);
    // It converges over the frames that follow, and never overshoots the clamp by much.
    let cursor = state;
    for (let i = 0; i < 40; i++) cursor = stepNavMotion(cursor, 0.05, T0);
    expect(cursor.progressM).toBeGreaterThan(128);
  });

  it("never drives the arrow backwards on a lagging fix", () => {
    const { stepNavMotion } = navScope();
    // Display 15 m ahead of the fix: the arrow slows, it does not rewind.
    const step = stepNavMotion(moving(115, 100), 0.05, T0);
    expect(step.progressM).toBeGreaterThanOrEqual(115);
  });

  it("freezes once the fixes stop arriving instead of extrapolating forever", () => {
    const { stepNavMotion, NAV_GPS_STALE_MS } = navScope();
    const state = moving(100, 100);
    expect(stepNavMotion(state, 0.05, T0).progressM).toBeGreaterThan(100);
    // A frozen GPS must freeze the arrow: extrapolating is how the displayed car ended up
    // kilometres past the real one, and any correction then a teleport.
    expect(
      stepNavMotion(state, 0.05, T0 + NAV_GPS_STALE_MS + 1).progressM,
    ).toBe(100);
  });

  it("clamps one frame's dt so a recovered clock cannot jump the arrow", () => {
    const { stepNavMotion, NAV_MAX_DT_S } = navScope();
    const huge = stepNavMotion(moving(0, 0), 5, T0);
    expect(huge.progressM).toBeCloseTo(20 * NAV_MAX_DT_S, 5);
  });

  it("resyncs only on a gap wide enough to be a reroute, not on a correction", () => {
    const { shouldResyncNav, NAV_RESYNC_METERS } = navScope();
    expect(shouldResyncNav(100, 100 + NAV_RESYNC_METERS - 1)).toBe(false);
    expect(shouldResyncNav(100, 100 + NAV_RESYNC_METERS + 1)).toBe(true);
    expect(shouldResyncNav(null, 100)).toBe(false);
  });

  it("slews the bearing toward the route, and holds it below a walking pace", () => {
    const { smoothNavBearing } = navScope();
    const oneFrame = smoothNavBearing(0, 90, 0.05, 20);
    expect(oneFrame).toBeGreaterThan(0);
    expect(oneFrame).toBeLessThan(90);
    let settled: number | null = 0;
    for (let i = 0; i < 20; i++) settled = smoothNavBearing(settled, 90, 0.05, 20);
    expect(settled).toBe(90);
    // Parked heading is noise: the last bearing is held.
    expect(smoothNavBearing(37, 300, 0.05, 0)).toBe(37);
  });

  it("takes the short way around the wrap", () => {
    const { smoothNavBearing } = navScope();
    const step = smoothNavBearing(350, 10, 0.05, 20);
    expect(step).toBeGreaterThanOrEqual(350);
    expect(step).toBeLessThanOrEqual(360);
  });
});

describe("snap admission", () => {
  it("snaps only while close, and only trusts heading once the car is moving", () => {
    const { canSnapToNavLine, NAV_SNAP_METERS } = navScope();
    expect(canSnapToNavLine(NAV_SNAP_METERS, null, 90, 0)).toBe(true);
    expect(canSnapToNavLine(NAV_SNAP_METERS + 1, 90, 90, 0)).toBe(false);
    // Parked GPS heading is noise: a 90° disagreement must not unsap the puck.
    expect(canSnapToNavLine(5, 180, 90, 0.5)).toBe(true);
    expect(canSnapToNavLine(5, 180, 90, 10)).toBe(false);
    expect(canSnapToNavLine(5, 95, 90, 10)).toBe(true);
  });
});

describe("cached line geometry", () => {
  it("resolves a point and a bearing without walking the whole line", () => {
    const { navCumulativeLengths, navPointAtDistance, navBearingAtDistance } =
      navScope();
    const cum = navCumulativeLengths(ROAD_LINE);
    expect(cum.length).toBe(ROAD_LINE.length);
    expect(cum[0]).toBe(0);
    const mid = navPointAtDistance(ROAD_LINE, cum, cum[1] / 2);
    expect(mid[0]).toBeCloseTo(2.301, 4);
    expect(mid[1]).toBeCloseTo(48.84, 4);
    const bearing = navBearingAtDistance(ROAD_LINE, cum, 10, 15);
    expect(bearing).toBeGreaterThan(70);
    expect(bearing).toBeLessThan(110);
  });

  it("falls back to the final segment's bearing near the end of the line", () => {
    const { navCumulativeLengths, navBearingAtDistance } = navScope();
    const cum = navCumulativeLengths(ROAD_LINE);
    const bearing = navBearingAtDistance(ROAD_LINE, cum, cum[cum.length - 1], 15);
    expect(bearing).toBeCloseTo(90, 0);
  });

  it("returns null rather than a bearing for a degenerate line", () => {
    const { navCumulativeLengths, navBearingAtDistance } = navScope();
    const degenerate = [
      [2.3, 48.84],
      [2.3, 48.84],
    ];
    expect(navBearingAtDistance(degenerate, navCumulativeLengths(degenerate), 0, 15)).toBeNull();
    expect(navBearingAtDistance(ROAD_LINE, [], 0, 15)).toBeNull();
  });
});

describe("planNavCamera", () => {
  it("faces the route ahead, and says so", () => {
    const { planNavCamera } = navScope();
    // The measured symptom this fixes: the puck stayed north while the camera did not.
    expect(
      planNavCamera({
        traceBearing: 137,
        deviceHeading: 300,
        mapBearing: 0,
        lastBearing: 12,
      }),
    ).toEqual({ bearing: 137, courseUp: true });
  });

  it("falls back to the device heading when there is no usable line", () => {
    const { planNavCamera } = navScope();
    // courseUp false is what keeps the puck map-aligned: the camera is not course-up, so an
    // arrow aligned to the viewport would point somewhere the car is not going.
    expect(
      planNavCamera({
        traceBearing: null,
        deviceHeading: 275,
        mapBearing: 0,
        lastBearing: 12,
      }),
    ).toEqual({ bearing: 275, courseUp: false });
  });

  it("keeps the last bearing when a parked fix has no heading", () => {
    const { planNavCamera } = navScope();
    // Non-vacuity: dropping this step is what let a stationary fix snap the view back to north.
    expect(
      planNavCamera({
        traceBearing: null,
        deviceHeading: -1,
        mapBearing: 0,
        lastBearing: 212,
      }),
    ).toEqual({ bearing: 212, courseUp: false });
  });

  it("never invents a bearing: the last resort is the map own bearing", () => {
    const { planNavCamera } = navScope();
    expect(
      planNavCamera({ traceBearing: null, deviceHeading: -1, mapBearing: 0 }),
    ).toEqual({ bearing: 0, courseUp: false });
    expect(
      planNavCamera({ traceBearing: null, deviceHeading: null, mapBearing: 44 }),
    ).toEqual({ bearing: 44, courseUp: false });
  });

  it('treats heading 0 as due north, not as "unknown"', () => {
    const { planNavCamera } = navScope();
    // expo-location reports "no heading" as a negative number; reading 0 as unknown pointed
    // every driver facing due north at their last known bearing instead.
    expect(
      planNavCamera({
        traceBearing: null,
        deviceHeading: 0,
        mapBearing: 180,
        lastBearing: 90,
      }),
    ).toEqual({ bearing: 0, courseUp: false });
  });

  it("ignores a non-finite bearing rather than passing NaN to the map", () => {
    const { planNavCamera } = navScope();
    expect(
      planNavCamera({
        traceBearing: Number.NaN,
        deviceHeading: Number.POSITIVE_INFINITY,
        mapBearing: 33,
      }),
    ).toEqual({ bearing: 33, courseUp: false });
  });

  it("normalises out-of-range bearings", () => {
    const { planNavCamera } = navScope();
    expect(
      planNavCamera({ traceBearing: 370, deviceHeading: null, mapBearing: 0 })
        .bearing,
    ).toBe(10);
    expect(
      planNavCamera({ traceBearing: -90, deviceHeading: null, mapBearing: 0 })
        .bearing,
    ).toBe(270);
  });
});
