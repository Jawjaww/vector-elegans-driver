import { BASEMAP_CANVAS } from '../basemapTone';
import { buildMapHtmlTemplate } from '../mapHtmlTemplate';

/**
 * The owner asked for a discreet credit that takes less room. That is a styling request, and it
 * runs straight at a licence term: the basemap is OpenFreeMap / OpenMapTiles over OpenStreetMap
 * data, the ODbL behind the OSM data requires the credit to be shown, and OpenFreeMap's terms
 * repeat it (the TileJSON this document loads carries, measured 2026-10-06 on
 * `tiles.openfreemap.org/planet`:
 * `OpenFreeMap | (c) OpenMapTiles | Data from OpenStreetMap`, each with its own link).
 *
 * This file is the guard that a future "let us save space" pass cannot answer by hiding the
 * credit. It asserts three things about the built document, all of them observable in the string:
 *
 * 1. the always-painted credit can never be hidden — no CSS rule and no inline style may put it
 *    in `display: none`, `visibility: hidden`, `opacity: 0`, a zero font, or off-screen;
 * 2. the complete credit is reachable — the (i) pill exists, is wired to the panel, and the panel
 *    carries the three providers and their links;
 * 3. the credit stays legible — a font-size floor, and a contrast ratio computed rather than
 *    assumed, since the face the credit sits on is translucent over a map that can be any colour.
 */

const WIDGET = '#ve-attrib';
const TOGGLE = '#ve-attrib-toggle';
const CREDIT = '#ve-attrib-credit';
const PANEL = '#ve-attrib-full';

/** Every declaration block of a rule whose selector names `selector` (and nothing longer). */
function blocksFor(html: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}(?![\\w-])[^{}]*\\{([^}]*)\\}`, 'g');
  const blocks: string[] = [];
  for (let match = re.exec(html); match !== null; match = re.exec(html)) {
    blocks.push(match[1]);
  }
  return blocks;
}

/** The declarations of every rule naming `selector`, normalised to `property: value`. */
function declarations(html: string, selector: string): string[] {
  return blocksFor(html, selector)
    .flatMap((block) => block.split(';'))
    .map((declaration) => declaration.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((declaration) => declaration.length > 0);
}

/** The last value declared for `property`, or null. */
function value(html: string, selector: string, property: string): string | null {
  const prefix = `${property}:`;
  const found = declarations(html, selector).filter((d) => d.startsWith(prefix));
  return found.length === 0 ? null : found[found.length - 1].slice(prefix.length).trim();
}

/**
 * A declaration that takes a credit off the screen or makes it unreadable.
 *
 * `opacity: 0` is matched exactly, so the translucent face (`0.86`) is not a false positive, and
 * a negative offset is treated as a hide because parking the credit outside the viewport is the
 * same failure as `display: none` with better manners.
 */
function hidesOrShrinks(declaration: string): boolean {
  return (
    /^display: none$/.test(declaration) ||
    /^visibility: (hidden|collapse)$/.test(declaration) ||
    /^opacity: 0(\.0+)?$/.test(declaration) ||
    /^font-size: 0(px)?$/.test(declaration) ||
    /^(left|right|top|bottom): -/.test(declaration) ||
    /^transform: .*translate[xy]?\(\s*-/.test(declaration)
  );
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(input: string): Rgba {
  const value = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((d) => d + d)
            .join('')
        : digits;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!fn) throw new Error(`unparsable colour: ${input}`);
  const parts = fn[1].split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`unparsable colour: ${input}`);
  }
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

/** `fg` painted over `bg`, in the same space a browser would composite it. */
function composite(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function luminance(color: Rgba): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** WCAG 2.x contrast ratio. 4.5:1 is the floor for text under 18 pt. */
function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const LOCATION = { lat: 48.85, lng: 2.35 };

describe('map attribution disclosure', () => {
  const html = buildMapHtmlTemplate(LOCATION);

  it('never lets the painted credit be hidden', () => {
    // The widget is markup in the body, not a string the map script may or may not insert: a
    // credit that exists only after MapLibre boots is a credit that disappears with the map.
    const body = html.indexOf('<body>');
    const widgetAt = html.indexOf('id="ve-attrib"');
    const scriptAt = html.indexOf('<script>', body);
    expect(body).toBeGreaterThanOrEqual(0);
    expect(widgetAt).toBeGreaterThan(body);
    expect(widgetAt).toBeLessThan(scriptAt);

    // Something painted at all times has to name the data source.
    expect(html).toContain('OpenStreetMap');

    for (const selector of [WIDGET, TOGGLE, CREDIT]) {
      const rules = declarations(html, selector);
      // Non-vacuity: a selector with no rule would make the guard below pass on nothing.
      expect({ selector, rules: rules.length > 0 }).toEqual({ selector, rules: true });
      expect({ selector, hiding: rules.filter(hidesOrShrinks) }).toEqual({
        selector,
        hiding: [],
      });
    }

    // Nor by reaching for an inline style: the only state this widget toggles is the `hidden`
    // attribute on the full panel, never a style on the credit itself.
    expect(/['"]ve-attrib[^'"]*['"]\s*\)\s*\.style\s*\./.test(html)).toBe(false);
  });

  it('reaches the complete credit through the (i) pill', () => {
    expect(html).toContain('id="ve-attrib-toggle"');
    expect(html).toContain('aria-controls="ve-attrib-full"');

    const px = (property: string): number => {
      const raw = value(html, TOGGLE, property);
      return raw === null ? 0 : Number.parseFloat(raw);
    };
    // A small glyph, but a thumb-sized target: the pill itself is the 44 x 44 box, the (i) sits
    // inside it. Touch size is asserted as a floor, on the maximum of the declared and minimum
    // size, so widening the pill is allowed and shrinking it is not.
    const width = Math.max(px('width'), px('min-width'));
    const height = Math.max(px('height'), px('min-height'));
    expect({ width, height, thumbSized: width >= 44 && height >= 44 }).toEqual({
      width,
      height,
      thumbSized: true,
    });
    const glyph = px('font-size');
    expect({ glyphSmallerThanTarget: glyph > 0 && glyph <= 18 }).toEqual({
      glyphSmallerThanTarget: true,
    });

    // The complete credit is in the document, providers and links included.
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
    ]) {
      expect({ link, linked: html.includes(`<a href="${link}`) }).toEqual({
        link,
        linked: true,
      });
    }

    // And the disclosure is wired: the panel collapses through the `hidden` attribute and the
    // script toggles exactly that attribute, so no rule can make it permanently invisible.
    expect(/getElementById\(['"]ve-attrib-full['"]\)/.test(html)).toBe(true);
    expect(/removeAttribute\(['"]hidden['"]\)/.test(html)).toBe(true);
    expect(/setAttribute\(['"]hidden['"]/.test(html)).toBe(true);
    expect(declarations(html, PANEL).filter(hidesOrShrinks)).toEqual([]);
  });

  it('pins a legibility floor for the credit: font size and contrast', () => {
    const fontSize = Number.parseFloat(value(html, CREDIT, 'font-size') ?? '0');
    expect({ fontSize, floor: fontSize >= 10 && fontSize <= 12 }).toEqual({
      fontSize,
      floor: true,
    });
    // Vertical, as the owner asked — and the vertical label is the one thing always on screen.
    expect(value(html, CREDIT, 'writing-mode')).toBe('vertical-rl');

    // A short label is what keeps the vertical strip inside its corner: at eleven px per glyph,
    // twenty characters cannot reach past the top of a phone screen.
    const label = /<span id="ve-attrib-credit"[^>]*>([^<]*)<\/span>/.exec(html);
    const text = label === null ? '' : label[1].trim();
    expect({ text: text.length > 0, short: text.length <= 20 }).toEqual({
      text: true,
      short: true,
    });
    expect(text).toContain('OpenStreetMap');

    // Contrast is computed, not assumed. The face is translucent, so the credit is composited
    // over the basemap canvas and, worst case, over black.
    const backdrops = [parseColor(BASEMAP_CANVAS), parseColor('#000000')];
    for (const selector of [CREDIT, TOGGLE, PANEL]) {
      const ink = parseColor(value(html, selector, 'color') ?? 'transparent');
      const face = parseColor(value(html, selector, 'background-color') ?? 'transparent');
      for (const backdrop of backdrops) {
        const ratio = contrastRatio(ink, composite(face, backdrop));
        expect({ selector, ratio: Number(ratio.toFixed(2)), ok: ratio >= 4.5 }).toEqual({
          selector,
          ratio: Number(ratio.toFixed(2)),
          ok: true,
        });
      }
    }
  });
});
