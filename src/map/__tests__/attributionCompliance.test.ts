// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};

import { buildMapHtmlTemplate } from '../mapHtmlTemplate';

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
 * The credit is now drawn by the document itself — a small (i) pill painted at all times, which
 * reveals ONE short vertical label — and MapLibre's own control is off so the two cannot double
 * up. The label is itself the anchor to the copyright page: the panel that used to carry the link
 * (and a second, much bigger label) was removed on the owner's instruction, and a clickable credit
 * is what keeps the ODbL term satisfied without adding a second element. This file checks that the
 * credit the licence is about is still *there*, still in the markup rather than assembled by the
 * map script, and still linked; the guard that the tap opens exactly one credit element, that it
 * stays legible, and that no rule or inline style can make it invisible lives in
 * `attributionDisclosure.test.ts`.
 *
 * What occupies that corner: the widget is bottom-right, in the strip the recenter control leaves
 * free (`right-4` is 56 px on native, the control is 48 px wide with an 8 px `hitSlop`, so the
 * outer 56 px are out of its way — that arithmetic is asserted in `attributionDisclosure.test.ts`).
 * `BottomSheet` rests at `HANDLE_ONLY_VISIBLE` px, which covers the bottom strip of the map on
 * every screen of the home tab. The lift below is asserted against that constant rather than
 * against a copy of it.
 */
const HANDLE_SOURCE = 'src/components/BottomSheet.tsx';
/** The WebView that feeds this document in, and the one place a link out of it can be caught. */
const WEBVIEW_SOURCE = 'src/map/WebViewMap.tsx';

function restingHandleHeight(): number {
  const source = readFileSync(HANDLE_SOURCE, 'utf8');
  const match = /HANDLE_ONLY_VISIBLE\s*=\s*(\d+)/.exec(source);
  if (!match) throw new Error('HANDLE_ONLY_VISIBLE is gone from BottomSheet');
  return Number(match[1]);
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

    // The replacement is markup in the body: the pill painted at all times, and the credit it
    // reveals on the tap. One credit — the panel that used to open beside the label is gone, and
    // this is the line that fails if it is ever brought back.
    expect(html).toContain('id="ve-attrib-credit"');
    expect(html).toContain('id="ve-attrib-toggle"');
    expect(html).not.toContain('id="ve-attrib-full"');
  });

  it('names the data source the ODbL is about, and links the credit to it', () => {
    // The provider list (OpenFreeMap, OpenMapTiles, MapLibre) left with the panel: the tap reveals
    // one label now, not two, and the label is short on purpose. What a licence needs — the OSM
    // data attribution — is on that label, visible and clickable.
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

  it('leaves the credit above the sheet handle that covers the bottom of the map', () => {
    const handle = restingHandleHeight();
    const lift = cssBottom(html, '#ve-attrib');
    expect(lift).not.toBeNull();
    expect(lift as number).toBeGreaterThanOrEqual(handle);
  });
});
