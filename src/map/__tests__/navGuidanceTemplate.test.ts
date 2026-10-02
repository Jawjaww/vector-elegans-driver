import { buildMapHtmlTemplate } from '../mapHtmlTemplate';

/**
 * The guidance framing is a decision spread over one string of HTML, so the invariants that keep
 * the camera on the road are asserted against that string rather than discovered on the phone:
 * a fit that cannot fire while guiding, a look-ahead padding that puts the driver low on the
 * screen, a departure pin that is no longer drawn under the puck, and a tick that reports when
 * it throws.
 */
describe('guidance map template', () => {
  const html = buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });

  it('never fits the camera while guiding', () => {
    // presentOnce returns before any fitRouteBounds call, on the flag the app itself sends.
    expect(html).toMatch(/if \(nav\.navigating\) return;/);
    expect(html).toMatch(
      /nav\.navigating = !isOffer && isNavigating === true;/,
    );
  });

  it('frames an offer on the whole trip, including the approach once it arrives', () => {
    expect(html).toContain('offerApproachFitted');
    expect(html).toContain('window.__veApproachLine');
    expect(html).toContain('if (isOffer) frameOfferCamera([start, end])');
    expect(html).toContain('if (!isOffer || nav.navigating) return;');
    const guard = html.indexOf('if (nav.navigating) return;');
    const fit = html.indexOf('fitRouteBounds(', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(fit).toBeGreaterThan(guard);
  });

  it('does not let a follow fix steal the offer camera, and clears that lock when guiding', () => {
    const lock = html.indexOf('if (window.__veOfferFraming)');
    const tick = html.indexOf('guideTick(coords, opts)', lock);
    const navUnlock = html.indexOf('opts.navigation === true');
    const clearLock = html.indexOf('window.__veOfferFraming = false', navUnlock);
    expect(lock).toBeGreaterThan(-1);
    expect(tick).toBeGreaterThan(lock);
    // A navigation GPS must drop the offer lock before the return that would swallow the tick.
    expect(navUnlock).toBeGreaterThan(-1);
    expect(clearLock).toBeGreaterThan(navUnlock);
    expect(clearLock).toBeLessThan(lock);
    expect(html.indexOf('nav.navigating = true', navUnlock)).toBeLessThan(lock);
    expect(html).toContain('window.__veOfferFraming = isOffer');
    expect(html).toContain('window.__veOfferFraming = false');
    expect(html).toContain('function adoptGuidanceDrawing(coords)');
    expect(html).toContain('removeLayerSafe("approach-line")');
    expect(html).toContain('if (isOffer && nav.navigating) return;');
  });

  it('frames the look-ahead with a top padding, not a bottom one', () => {
    expect(html).toMatch(/top: Math\.round\(h \* 0\.4\)/);
    expect(html).toMatch(/bottom: Math\.round\(h \* 0\.1\)/);
    // The bottom-only padding is what lifted the puck up the screen and hid the road ahead.
    expect(html).not.toMatch(/bottom: Math\.round\(h \* 0\.35\)/);
  });

  it('draws the departure pin only outside guidance', () => {
    expect(html).toMatch(/if \(!window\.__veNav\.navigating\) \{/);
  });

  it('cuts the drawn route at the driver', () => {
    expect(html).toContain('function trimNavLineFrom(coords)');
    expect(html).toContain('function syncNavRouteStart(coords)');
    expect(html).toContain(
      'const trimmed = syncNavRouteStart(onLine ? paintPoint : coords);',
    );
    // The full geometry stays the reference for the bearing and the remaining distance.
    expect(html).toMatch(
      /nav\.trimAnchor = \{ coords: trimmed\[0\], generation: nav\.generation \};/,
    );
  });

  it('reports a tick that throws instead of letting the camera stand still', () => {
    expect(html).toMatch(/postNavDiag\(\{ error: navErrorMessage\(error\)/);
    expect(html).toContain('function guideTickFallback(coords, opts)');
    // The probe the app turns into `nav_tick` / `nav_tick_error` rows.
    expect(html).toContain('type: "navDiag"');
    expect(html).toContain('course_up: paintCourseUp');
  });

  it('paints from a display clock, not from a GPS teleport', () => {
    expect(html).toContain('function navDisplayTick(ts)');
    expect(html).toContain('function stepNavMotion(state, dt, nowMs)');
    expect(html).toContain('window.__veLastRawGpsCoords');
    // The 900 ms easeTo on each fix is what the loop replaces; it must not return as the
    // guidance camera. Offer / idle follow still uses moveNavCamera.
    const tick = html.slice(html.indexOf('function guideTickPlanned'));
    const fallback = html.slice(html.indexOf('function guideTickFallback'));
    expect(tick).toContain('navDisplayPaint(');
    expect(fallback).toContain('jumpNavCamera({');
  });

  it('integrates its own speed instead of trusting the platform field', () => {
    // The measured failure of #102: `coords.speed` null left the model at zero, so the arrow
    // froze between fixes and jumped onto the next one.
    expect(html).toContain(
      'function estimateNavSpeed(state, gpsProgressM, nowMs, coordsSpeedMps)',
    );
    expect(html).toContain(
      'function smoothNavBearing(prevBearing, targetBearing, dt, speedMps)',
    );
    expect(html).toContain('function shouldResyncNav(progressM, gpsProgressM)');
    expect(html).toContain('function navCumulativeLengths(line)');
    // A fix re-seats the arrow only across a gap wide enough to be a reroute.
    const tick = html.slice(html.indexOf('function guideTickPlanned'));
    const resyncAt = tick.indexOf('shouldResyncNav(nav.progressM, snapped.traveledMeters)');
    expect(resyncAt).toBeGreaterThan(-1);
  });

  it('restarts the display clock when its frames stop arriving', () => {
    expect(html).toContain('function navGeometry()');
    expect(html).toContain('function ensureNavDisplayWatchdog()');
    expect(html).toContain('window.__veNavDisplayGen');
  });
});
