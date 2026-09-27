import { buildMapHtmlTemplate } from '../mapHtmlTemplate';
import {
  deviceBearing,
  normaliseBearing,
  planNavCamera,
} from '../../lib/utils/navCamera';

/**
 * The guidance planner runs inside the map document, injected with `.toString()`.
 *
 * Each function carries only its own source, so a helper kept at module scope is not shared with
 * the WebView — it is missing there. That class of mistake is invisible to a unit test that
 * imports the module (the helper resolves) and invisible to the app build (the source compiles);
 * it shows up as a camera that never turns, on a phone, in traffic. These tests run the injected
 * fragment the way the document receives it: in a scope that contains nothing but that fragment.
 */
const INJECTED_FRAGMENT = [
  normaliseBearing.toString(),
  deviceBearing.toString(),
  planNavCamera.toString(),
].join('\n');

describe('nav camera injection contract', () => {
  it('plans a course-up bearing from the injected source alone', () => {
    const plan = new Function(
      `${INJECTED_FRAGMENT}
      return planNavCamera({ traceBearing: 137, deviceHeading: 300, mapBearing: 0, lastBearing: 12 });`,
    )();

    expect(plan).toEqual({ bearing: 137, courseUp: true });
  });

  it('keeps the injected helpers reachable for the fallback branches', () => {
    const plan = new Function(
      `${INJECTED_FRAGMENT}
      return planNavCamera({ traceBearing: null, deviceHeading: -1, mapBearing: 0, lastBearing: 212 });`,
    )();

    // Dropping `deviceBearing` or `normaliseBearing` from the injection throws here instead of
    // silently returning north on a parked fix.
    expect(plan).toEqual({ bearing: 212, courseUp: false });
  });

  it('is exactly what the map document is given', () => {
    const html = buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });

    for (const source of [
      normaliseBearing.toString(),
      deviceBearing.toString(),
      planNavCamera.toString(),
    ]) {
      expect(html).toContain(source);
    }
  });
});
