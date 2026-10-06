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
 * `OpenFreeMap | (c) OpenMapTiles | Data from OpenStreetMap`, and the ODbL behind the OSM data
 * requires the credit to be shown. The document used to set `attributionControl: false` *and*
 * hide `.maplibregl-ctrl-attrib` in CSS, so nothing was drawn at all.
 *
 * What occupies that corner: MapLibre puts the control bottom-right, and `BottomSheet` rests at
 * `HANDLE_ONLY_VISIBLE` px, which covers the bottom strip of the map on every screen of the home
 * tab. The lift below is asserted against that constant rather than against a copy of it.
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

/** True when some rule whose selector list contains `selector` hides it. */
function isHidden(html: string, selector: string): boolean {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}[^{]*\\{[^}]*display:\\s*none`).test(html);
}

describe('map attribution (licence requirement)', () => {
  const html = buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });

  it('lets MapLibre draw the control, compact', () => {
    // Boolean, not toContain: a failure prints one line instead of the whole HTML document.
    expect(html.includes('attributionControl: false')).toBe(false);
    expect(html).toMatch(/attributionControl:\s*\{\s*compact:\s*true/);
    // Passing an options object REPLACES the control's defaults instead of merging into them
    // (`constructor(t = Is)` in maplibre-gl 4.7.1), so the default MapLibre credit has to be
    // spelled out or it disappears with the boolean.
    expect(html).toContain('https://maplibre.org/');
  });

  it('stops hiding the credit with CSS', () => {
    expect(isHidden(html, '.maplibregl-ctrl-attrib')).toBe(false);
    expect(isHidden(html, '.maplibregl-ctrl-bottom-right')).toBe(false);
  });

  it('leaves the credit above the sheet handle that covers the bottom of the map', () => {
    const handle = restingHandleHeight();
    const lift = cssBottom(html, '.maplibregl-ctrl-bottom-right');
    expect(lift).not.toBeNull();
    expect(lift as number).toBeGreaterThanOrEqual(handle);
  });
});
