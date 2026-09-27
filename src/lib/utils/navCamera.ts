/**
 * Bearing decision for the driver's guidance camera, as pure functions.
 *
 * They live outside the map document — and are injected into it with `.toString()`, the way
 * `snapToNavLine` is — for one measured reason: the frozen-north arrow. The WebView had a sticky
 * `__veNavCourseUp` flag set by every navigating fix and never cleared by `clearAllRoutes()`, so
 * a puck aligned to the viewport kept `rotation: 0` while the camera went back to north-up. The
 * rule that prevents it is a decision, not a drawing, so it belongs where a test can pin it.
 *
 * All three exports are injected, in this order: `normaliseBearing`, `deviceBearing`, then
 * `planNavCamera`. Only the named function's own source reaches the map document, so a helper
 * left out of that list is a `ReferenceError` inside the WebView and not a shared import —
 * `navInjectionContract.test.ts` runs the injected fragment in a fresh scope so that mistake
 * cannot wait for a phone to surface it.
 */
export type NavCameraPlan = {
  /** Bearing to apply to the map, in degrees. */
  bearing: number;
  /**
   * True only when `bearing` is the azimuth of the route itself. The puck may be aligned to the
   * viewport (screen-up) in that case, and only then: the viewport is course-up exactly when the
   * camera really is, so a north-up map can no longer draw an arrow that claims to be north.
   */
  courseUp: boolean;
};

/** Normalise into [0, 360), or null when the value is not a usable bearing. */
export function normaliseBearing(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

/**
 * `expo-location` reports "no heading" as a negative number, and 0 is a legitimate heading
 * (due north). Collapsing the two would point every stationary driver north.
 */
export function deviceBearing(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return normaliseBearing(value);
}

export function planNavCamera(input: {
  /** Azimuth of the trace ahead; null when there is no usable line. */
  traceBearing: number | null | undefined;
  /** Device heading in degrees; negative or absent when unknown. */
  deviceHeading: number | null | undefined;
  /** Bearing the map is currently oriented to. */
  mapBearing: number | null | undefined;
  /** Last bearing this planner applied, so a parking fix does not snap back to north. */
  lastBearing?: number | null;
}): NavCameraPlan {
  // 1. The azimuth of the route ahead — the driver is being guided, so the road wins.
  const trace = normaliseBearing(input.traceBearing);
  if (trace !== null) return { bearing: trace, courseUp: true };

  // 2. The device heading, when there is no usable line.
  const device = deviceBearing(input.deviceHeading);
  if (device !== null) return { bearing: device, courseUp: false };

  // 3. The last bearing actually applied: a stationary fix has no heading and must not reset
  //    the view to north.
  const last = normaliseBearing(input.lastBearing);
  if (last !== null) return { bearing: last, courseUp: false };

  // 4. The map's own bearing, never invented: it is 0 only because the map is.
  return { bearing: normaliseBearing(input.mapBearing) ?? 0, courseUp: false };
}
