// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};

import { buildMapHtmlTemplate } from '../mapHtmlTemplate';
import {
  ATTRIBUTION_LABEL_BOTTOM,
  INSTRUCTION_BAND_TOP,
  SHEET_PEEK_VISIBLE_H,
} from '../../lib/utils/overlayLane';

/**
 * The credit is a licence term, not a preference.
 *
 * The basemap is OpenFreeMap / OpenMapTiles over OpenStreetMap data, and both put it in writing:
 * the TileJSON the document loads carries
 * `OpenFreeMap | (c) OpenMapTiles | Data from OpenStreetMap` (measured 2026-10-06 on
 * `tiles.openfreemap.org/planet`), and the ODbL behind the OSM data requires the credit to be
 * shown. The document used to set `attributionControl: false` *and* hide
 * `.maplibregl-ctrl-attrib` in CSS, so nothing was drawn at all.
 *
 * The credit is now drawn by the document itself — a single vertical label, painted at all times
 * and itself the anchor to the copyright page — and MapLibre's own control is off so the two
 * cannot double up. The (i) pill that used to reveal it is gone, on the owner's instruction: it
 * sat across the low overlays (the instruction bar, the location control). This file checks that
 * the credit the licence is about is still *there*, still in the markup rather than assembled by
 * the map script, still linked, and no longer in that low band; the guards on the count (one
 * element), on legibility and on un-hideability live in `attributionDisclosure.test.ts`.
 *
 * What occupies the corner: the credit is bottom-right, in the strip the recenter control leaves
 * free (`right-4` is 56 px on native, the control is 48 px wide with an 8 px `hitSlop` — that
 * arithmetic is asserted in `attributionDisclosure.test.ts`), and it is lifted above the whole
 * instruction band. `BottomSheet` now imports the resting lip it stands on
 * (`SHEET_PEEK_VISIBLE_H`) from the shared lane module instead of owning a copy, so the two
 * numbers below are the lane's own.
 */
const BOTTOM_SHEET_SOURCE = 'src/components/BottomSheet.tsx';
/** The WebView that feeds this document in, and the one place a link out of it can be caught. */
const WEBVIEW_SOURCE = 'src/map/WebViewMap.tsx';

/**
 * The resting lip of the sheet, from the shared lane module.
 *
 * Non-vacuity, and the point of the move: the figure has one home, and `BottomSheet` has to read
 * it. A local `14` re-appearing in the sheet would make the credit and the sheet disagree the
 * next time either moves, which is exactly the drift this checks for.
 */
function restingHandleHeight(): number {
  const source = readFileSync(BOTTOM_SHEET_SOURCE, 'utf8');
  expect(source).toContain('const HANDLE_ONLY_VISIBLE = SHEET_PEEK_VISIBLE_H;');
  return SHEET_PEEK_VISIBLE_H;
}

/** The `bottom` a rule sets for one selector, or null when no such rule exists. */
function cssBottom(html: string, selector: string): number | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(html);
  if (!rule) return null;
  const bottom = /bottom:\s*(\d+)px/.exec(rule[1]);
  return bottom ? Number(bottom[1]) : null;
}

describe('map attribution (licence requirement)', () => {
  const html = buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });

  it('draws the credit from the document, not from MapLibre compact control', () => {
    // Boolean, not toContain: a failure prints one line instead of the whole HTML document.
    expect(/attributionControl:\s*false/.test(html)).toBe(true);
    expect(html.includes('attributionControl: {')).toBe(false);

    // The replacement is markup in the body: one credit, painted. The (i) pill that used to
    // reveal it and the panel that once opened beside it are both gone, and these are the lines
    // that fail if either comes back.
    expect(html).toContain('id="ve-attrib-credit"');
    expect(html).not.toContain('id="ve-attrib-toggle"');
    expect(html).not.toContain('id="ve-attrib-full"');
    // Permanent, not revealed: nothing on the credit is waiting for a tap.
    expect(/<a[^>]*id="ve-attrib-credit"[^>]*\shidden/.test(html)).toBe(false);
    expect(html).not.toContain('aria-expanded');
  });

  it('names the data source the ODbL is about, and links the credit to it', () => {
    // The provider list (OpenFreeMap, OpenMapTiles, MapLibre) left with the panel: the credit is
    // one short label now, painted rather than revealed. What a licence needs — the OSM data
    // attribution — is on that label, visible and clickable.
    expect(html).toContain('OpenStreetMap');
    expect(html).toContain('href="https://www.openstreetmap.org/copyright"');

    // The exact ODbL wording ("contributors") is carried by the accessible name while the painted
    // text stays the short label the owner asked for, so the credit is correct for a screen reader
    // without becoming a second visible element.
    expect(html).toContain('OpenStreetMap contributors');

    // And the credit *is* the anchor: not a link sitting next to a label, which is what the panel
    // was. Anchored on the credit's own id, so a link elsewhere cannot satisfy this.
    expect(/<a\s[^>]*id="ve-attrib-credit"[\s\S]*?href="https:\/\/www\.openstreetmap\.org\/copyright"/.test(html)).toBe(true);
  });

  it('sends the credit link out to the browser instead of navigating the map away', () => {
    // A link inside this document is not free. The WebView is fed inline HTML and
    // `setSupportMultipleWindows` is false, so Android has no new window for a `target="_blank"`
    // to go to and loads it *in place*: without the interception, tapping the credit replaces the
    // map with the copyright page, in a WebView with no back affordance. The link has to leave.
    const source = readFileSync(WEBVIEW_SOURCE, 'utf8');
    expect(source).toContain('onShouldStartLoadWithRequest');
    expect(source).toContain('Linking.openURL');
    // Non-vacuity: intercepting is half of it — the navigation has to be refused, or the page
    // loads anyway and the browser opens on top of a dead map.
    expect(source).toContain('return false');
  });

  it('keeps the credit out of the low band the sheet and the instruction bar occupy', () => {
    // Two claims, one number. The credit stands on the sheet's resting lip (it is never drawn
    // under the collapsed sheet) *and* one gap above the whole instruction band, so the sentence
    // the driver is reading is never under the credit. Both are read from the shared lane module,
    // and the sheet is checked to read the same lip rather than keeping a copy.
    const handle = restingHandleHeight();
    const lift = cssBottom(html, '#ve-attrib-credit');
    expect(lift).not.toBeNull();
    expect(lift as number).toBeGreaterThanOrEqual(handle);
    expect(lift as number).toBeGreaterThanOrEqual(INSTRUCTION_BAND_TOP);
    expect(lift).toBe(ATTRIBUTION_LABEL_BOTTOM);
    expect(ATTRIBUTION_LABEL_BOTTOM).toBeGreaterThan(INSTRUCTION_BAND_TOP);
  });
});
