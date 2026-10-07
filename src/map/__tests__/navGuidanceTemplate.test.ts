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

  it('eats the drawn route at the driver, by paint', () => {
    // Ce test gardait le rognage geometrique (trimNavLineFrom / syncNavRouteStart) : la ligne
    // etait recoupee derriere la fleche, mais chaque recoupe refaisait un setData de toute la
    // geometrie (2,8 fois par seconde a 50 km/h) et la fleche s'y bloquait. Le rognage est parti,
    // le degrade de peinture le remplace (voir navRouteTrim.test.ts pour le mecanisme) : ce qui
    // est garde ici, c'est le CABLAGE — les deux chemins de guidage, la boucle d'affichage et le
    // tick GPS, effacent la portion parcourue.
    expect(html).toContain('function syncNavEatenRoute(');
    const display = html.slice(
      html.indexOf('function navDisplayTick(ts)'),
      html.indexOf('/* VE_NAV_DISPLAY_END */'),
    );
    expect(display).toContain('syncNavEatenRoute(');
    const planned = html.slice(html.indexOf('function guideTickPlanned'));
    expect(planned).toContain('syncNavEatenRoute(');
    // La geometrie complete reste la reference pour le cap et la distance restante : elle n'est
    // simplement plus recoupee.
    expect(html).not.toContain('nav.trimAnchor');
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

  it('points the arrow along the route before any fix has been matched', () => {
    // The complaint this answers: guidance starts with the driver parked, no fix is admissible
    // yet, and the arrow used to point north because planNavCamera's last resort is the map's
    // own bearing.
    expect(html).toContain('function routeBearingNearFix(coords)');
    expect(html).toContain('function seedNavBearingFromLine()');
    const tick = html.slice(html.indexOf('function navDisplayTick(ts)'));
    expect(tick).toContain('traceBearing: routeBearingNearFix(raw)');
    const planned = html.slice(html.indexOf('function guideTickPlanned'));
    expect(planned).toContain('traceBearing: routeBearingNearFix(coords)');
    // Both fallbacks slew rather than adopt, so the first frame is not a snap either.
    expect(tick).toContain('smoothNavBearing(nav.bearing, plan.bearing, dt, nav.vEst)');
    expect(planned).toContain(
      'smoothNavBearing(nav.bearing, plan.bearing, 0.05, nav.vEst)',
    );
  });

  it('seeds that bearing whenever a guidance line is set', () => {
    const displayed = html.slice(
      html.indexOf('function seedNavBearingFromLine'),
      html.indexOf('/* VE_NAV_DISPLAY_END */'),
    );
    expect(displayed).toContain('navBearingAtDistance(line, cum, 0, NAV_PAINT_LOOKAHEAD_M)');
    // The chord updateRoute draws before the road line lands, but only when not an offer: an
    // offer's chord runs pickup -> drop-off, which is not the driver's heading.
    expect(html).toMatch(/if \(!isOffer\) seedNavBearingFromLine\(\);/);
    // A reroute re-points the arrow at the new first segment.
    const recenter = html.slice(html.indexOf('function recenterTripNavCamera'));
    expect(recenter.indexOf('seedNavBearingFromLine()')).toBeGreaterThan(
      recenter.indexOf('resetNavMotion()'),
    );
  });
});
