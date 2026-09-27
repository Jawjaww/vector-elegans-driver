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
    expect(lock).toBeGreaterThan(-1);
    expect(tick).toBeGreaterThan(lock);
    expect(html).toContain('window.__veOfferFraming = isOffer');
    expect(html).toContain('window.__veOfferFraming = false');
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
    expect(html).toContain('const trimmed = syncNavRouteStart(coords);');
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
    expect(html).toContain('course_up: plan.courseUp');
  });
});
