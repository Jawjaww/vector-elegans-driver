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
 * reveals the short vertical label and the complete list with its links — and MapLibre's own
 * control is off so the two cannot double up. This file checks that the credit the licence is
 * about is still *there*, and still in the markup rather than assembled by the map script; the
 * guard that the tap opens it, that it stays legible, and that no rule or inline style can make it
 * invisible lives in `attributionDisclosure.test.ts`.
 *
 * What occupies that corner: the widget is bottom-right, in the strip the recenter control leaves
 * free (`right-4` is 56 px on native, the control is 48 px wide with an 8 px `hitSlop`, so the
 * outer 56 px are out of its way — that arithmetic is asserted in `attributionDisclosure.test.ts`).
 * `BottomSheet` rests at `HANDLE_ONLY_VISIBLE` px, which covers the bottom strip of the map on
 * every screen of the home tab. The lift below is asserted against that constant rather than
 * against a copy of it.
 */
const HANDLE_SOURCE = 'src/components/BottomSheet.tsx';

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
    // reveals on the tap.
    expect(html).toContain('id="ve-attrib-credit"');
    expect(html).toContain('id="ve-attrib-toggle"');
    expect(html).toContain('id="ve-attrib-full"');
  });

  it('names every provider the source TileJSON credits, links included', () => {
    // The list is spelled out because the control that used to render it from the TileJSON is
    // off. If the provider changes, this is the line that has to follow it.
    for (const provider of [
      'OpenStreetMap contributors',
      'OpenFreeMap',
      'OpenMapTiles',
      'MapLibre',
    ]) {
      expect(html).toContain(provider);
    }
    for (const link of [
      'https://www.openstreetmap.org/copyright',
      'https://openfreemap.org',
      'https://www.openmaptiles.org',
      'https://maplibre.org/',
    ]) {
      expect(html).toContain(link);
    }
  });

  it('leaves the credit above the sheet handle that covers the bottom of the map', () => {
    const handle = restingHandleHeight();
    const lift = cssBottom(html, '#ve-attrib');
    expect(lift).not.toBeNull();
    expect(lift as number).toBeGreaterThanOrEqual(handle);
  });
});
