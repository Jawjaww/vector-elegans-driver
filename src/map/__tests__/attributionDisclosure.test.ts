/**
 * @jest-environment jsdom
 */

// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import { BASEMAP_CANVAS } from '../basemapTone';
import { buildMapHtmlTemplate } from '../mapHtmlTemplate';
import { MAP_CONTROL_SIZE } from '../../lib/utils/overlayLane';

/**
 * The credit was painted twice: a (i) pill *and* a vertical « © OpenStreetMap » strip, both on
 * screen at all times, both on the left. The owner's correction was exact — only one of the two is
 * permanent, the (i) is the one, it is far too big, and the right corner is where it belongs with
 * the vertical label appearing *on the tap*, very small.
 *
 * That is a styling request and it lands on a licence term: the basemap is OpenFreeMap /
 * OpenMapTiles over OpenStreetMap data, the ODbL behind the OSM data requires the credit to be
 * shown, and OpenFreeMap's terms repeat it (the TileJSON this document loads carries, measured
 * 2026-10-06 on `tiles.openfreemap.org/planet`:
 * `OpenFreeMap | (c) OpenMapTiles | Data from OpenStreetMap`, each with its own link). So the
 * credit may be *discreet*, it may be *revealed*, it may never be *disappearable*.
 *
 * The rule therefore changed nature rather than going away, and this file asserts the four things
 * that make it a rule:
 *
 * 1. at rest, only the (i) is painted — the credit and the complete list sit in the markup behind
 *    the browser's own `[hidden]` rule, so nothing paints them by accident;
 * 2. the tap reveals them and the next tap hides them again — exercised in a real DOM
 *    (`@jest-environment jsdom`), not read out of the string;
 * 3. no rule and no inline style can hide the credit while it is open, nor leave it painted once
 *    it is closed: `display` is banned outright on the two revealed elements, because a `display`
 *    declaration beats the UA's `[hidden] { display: none }` in both directions;
 * 4. the pill's *visible* size is small and its *touch* size is not — two numbers, asserted as
 *    two numbers, and both measured against the recenter control that owns the same corner.
 */

const WIDGET = '#ve-attrib';
const TOGGLE = '#ve-attrib-toggle';
const GLYPH = '#ve-attrib-glyph';
const CREDIT = '#ve-attrib-credit';
const PANEL = '#ve-attrib-full';

const DISCLOSURE_START = '// VE_ATTRIB_DISCLOSURE_START';
const DISCLOSURE_END = '// VE_ATTRIB_DISCLOSURE_END';

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();
const RECENTER_BUTTON = 'src/components/MapRecenterButton.tsx';
const BOTTOM_SHEET = 'src/components/BottomSheet.tsx';

/**
 * NativeWind's rem is **14** on native, not the web's 16 (`react-native-css-interop` sets it:
 * `dist/runtime/native/unit-observables.js`). So `right-4` is 56 px, not 16 — and the recenter
 * control leaves the outer 56 px of the corner free. Getting this wrong is how a placement that
 * reads as "clear of the button" is drawn straight through it.
 */
const NATIVE_REM = 14;

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

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

/** A `px` value as a number, or 0 when the declaration is absent. */
function px(html: string, selector: string, property: string): number {
  const raw = value(html, selector, property);
  return raw === null ? 0 : Number.parseFloat(raw);
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

/**
 * Horizontal footprint of the vertical label, from the declarations rather than from a rendering
 * engine: in `writing-mode: vertical-rl` the line box is horizontal, so its width is the line
 * height (one line, `line-height: 1`, i.e. the font size) plus the horizontal padding and the
 * border. jsdom does no layout, so this is the measurement — and it is the one that decides
 * whether the revealed strip can reach the recenter control.
 */
function verticalStripWidth(html: string, selector: string): number {
  const lineBox = px(html, selector, 'font-size') * Number.parseFloat(value(html, selector, 'line-height') ?? '1');
  const padding = (value(html, selector, 'padding') ?? '').trim().split(/\s+/);
  const horizontalPadding = Number.parseFloat(padding.length >= 2 ? padding[1] : padding[0] ?? '0');
  const border = (value(html, selector, 'border') ?? '').trim().split(/\s+/);
  const borderWidth = border.length > 0 ? Number.parseFloat(border[0]) : 0;
  return lineBox + 2 * horizontalPadding + 2 * borderWidth;
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

/**
 * The disclosure script, taken verbatim from the document between its markers, evaluated against
 * the document's own markup in jsdom. Extracted rather than imported so what is tested is what
 * ships — the same rule `navGuidanceSource.test.ts` follows for the guidance helpers.
 */
function extractDisclosure(html: string): string {
  const start = html.indexOf(DISCLOSURE_START);
  const end = html.indexOf(DISCLOSURE_END, start);
  // Non-vacuity: without the markers, the extraction is an empty string and every tap assertion
  // below would pass on nothing.
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return html.slice(start + DISCLOSURE_START.length, end);
}

/**
 * The body of the built document in the live DOM, with the inline script *not* executed
 * (`innerHTML` never runs scripts), then the disclosure fragment wired by hand.
 */
function mountDocument(html: string): void {
  const bodyStart = html.indexOf('<body>') + '<body>'.length;
  const bodyEnd = html.indexOf('</body>');
  document.body.innerHTML = html.slice(bodyStart, bodyEnd);
  // eslint-disable-next-line no-new-func
  new Function(extractDisclosure(html))();
}

function displayOf(id: string): string {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`${id} is missing from the document`);
  return window.getComputedStyle(element).display;
}

function toggle(): HTMLButtonElement {
  const button = document.getElementById('ve-attrib-toggle');
  if (button === null) throw new Error('the (i) pill is missing from the document');
  return button as HTMLButtonElement;
}

const LOCATION = { lat: 48.85, lng: 2.35 };

describe('map attribution disclosure', () => {
  const html = buildMapHtmlTemplate(LOCATION);

  it('paints the (i) pill alone, and leaves the credit in the markup unopened', () => {
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

    // Correction 1: one permanent element. The two revealed ones carry `hidden` in the markup, so
    // a document whose script never runs at all shows the (i) and no credit — never both.
    expect(/<span id="ve-attrib-credit"[^>]*\shidden/.test(html)).toBe(true);
    expect(/<div id="ve-attrib-full"[^>]*\shidden/.test(html)).toBe(true);
    expect(/<button[^>]*id="ve-attrib-toggle"[^>]*\shidden/.test(html)).toBe(false);

    // And nothing in the stylesheet may paint them anyway: a `display` declaration of *any* value
    // on a `[hidden]` element beats the browser's own rule, which is how a "revealed" credit
    // becomes a permanently painted one.
    for (const selector of [CREDIT, PANEL]) {
      const rules = declarations(html, selector);
      expect({ selector, rules: rules.length > 0 }).toEqual({ selector, rules: true });
      expect({
        selector,
        display: rules.filter((declaration) => declaration.startsWith('display:')),
      }).toEqual({ selector, display: [] });
    }
  });

  it('reveals the credit on the tap, and hides it again on the next one', () => {
    mountDocument(html);

    // Closed at rest, and measurably so — not merely "carries an attribute".
    expect(displayOf('ve-attrib-credit')).toBe('none');
    expect(displayOf('ve-attrib-full')).toBe('none');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    toggle().click();
    expect(displayOf('ve-attrib-credit')).not.toBe('none');
    expect(displayOf('ve-attrib-full')).not.toBe('none');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    toggle().click();
    expect(displayOf('ve-attrib-credit')).toBe('none');
    expect(displayOf('ve-attrib-full')).toBe('none');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('separates the pill\u2019s visible size from its touch zone', () => {
    // Correction 3. The two figures are asserted separately because they answer two different
    // questions, and collapsing them is exactly the mistake being corrected: a 44 px *face*.
    const touchWidth = Math.max(px(html, TOGGLE, 'width'), px(html, TOGGLE, 'min-width'));
    const touchHeight = Math.max(px(html, TOGGLE, 'height'), px(html, TOGGLE, 'min-height'));
    expect({ touchWidth, touchHeight, thumbSized: touchWidth >= 40 && touchHeight >= 40 }).toEqual(
      { touchWidth, touchHeight, thumbSized: true },
    );

    // The face the driver sees, well inside the target.
    const faceWidth = px(html, GLYPH, 'width');
    const faceHeight = px(html, GLYPH, 'height');
    expect({ faceWidth, faceHeight, small: faceWidth >= 22 && faceWidth <= 26 && faceHeight === faceWidth }).toEqual(
      { faceWidth, faceHeight, small: true },
    );
    expect(faceWidth).toBeLessThan(touchWidth);

    const glyph = px(html, GLYPH, 'font-size');
    expect({ glyph, small: glyph >= 15 && glyph <= 18 }).toEqual({ glyph, small: true });
  });

  it('reaches the complete credit through the (i) pill', () => {
    expect(html).toContain('id="ve-attrib-toggle"');
    expect(html).toContain('aria-controls="ve-attrib-credit ve-attrib-full"');

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

    // And the disclosure is wired: both revealed elements collapse through the `hidden` attribute
    // and the script toggles exactly that attribute, so no rule can make one permanently
    // invisible while the other opens.
    expect(/getElementById\(['"]ve-attrib-full['"]\)/.test(html)).toBe(true);
    expect(/getElementById\(['"]ve-attrib-credit['"]\)/.test(html)).toBe(true);
    expect(/removeAttribute\(['"]hidden['"]\)/.test(html)).toBe(true);
    expect(/setAttribute\(['"]hidden['"]/.test(html)).toBe(true);
    for (const selector of [CREDIT, PANEL]) {
      expect({ selector, hiding: declarations(html, selector).filter(hidesOrShrinks) }).toEqual({
        selector,
        hiding: [],
      });
    }
  });

  it('pins a legibility floor for the credit: it is very small, not unreadable', () => {
    // Correction 2: "en très très petit". Small enough to be a whisper beside the map, above the
    // floor below which a licence credit stops being a credit.
    const fontSize = px(html, CREDIT, 'font-size');
    expect({ fontSize, floor: fontSize >= 9 && fontSize <= 11 }).toEqual({
      fontSize,
      floor: true,
    });
    // Vertical, as the owner asked, and revealed rather than permanent.
    expect(value(html, CREDIT, 'writing-mode')).toBe('vertical-rl');
    expect(/<span id="ve-attrib-credit"[^>]*\shidden/.test(html)).toBe(true);

    // A short label is what keeps the revealed strip a strip: it sits above the pill, inside the
    // narrow column the corner leaves free.
    const label = /<span id="ve-attrib-credit"[^>]*>([^<]*)<\/span>/.exec(html);
    const text = label === null ? '' : label[1].trim();
    expect({ text: text.length > 0, short: text.length <= 20 }).toEqual({
      text: true,
      short: true,
    });
    expect(text).toContain('OpenStreetMap');

    // Contrast is computed, not assumed. The faces are translucent, so each is composited over
    // the basemap canvas and, worst case, over black.
    const backdrops = [parseColor(BASEMAP_CANVAS), parseColor('#000000')];
    for (const selector of [GLYPH, CREDIT, PANEL]) {
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

  it('never lets the credit be hidden by a rule or by an inline style', () => {
    for (const selector of [WIDGET, TOGGLE, GLYPH, CREDIT, PANEL]) {
      const rules = declarations(html, selector);
      // Non-vacuity: a selector with no rule would make the guard below pass on nothing.
      expect({ selector, rules: rules.length > 0 }).toEqual({ selector, rules: true });
      expect({ selector, hiding: rules.filter(hidesOrShrinks) }).toEqual({
        selector,
        hiding: [],
      });
    }

    // Nor by reaching for an inline style: the only state this widget toggles is the `hidden`
    // attribute, never a style on any of its elements.
    expect(/['"]ve-attrib[^'"]*['"]\s*\)\s*\.style\s*\./.test(html)).toBe(false);
  });

  it('sits at the bottom right, clear of the recenter control that owns the corner', () => {
    // Correction 4, as arithmetic rather than as a screenshot. The recenter control is the other
    // tenant of this corner; its own numbers are read from its source so that moving it fails
    // here instead of drawing the credit through it.
    const recenter = readSource(RECENTER_BUTTON);
    const insetMatch = /className="[^"]*\bright-(\d+)\b/.exec(recenter);
    const slopMatch = /hitSlop=\{(\d+)\}/.exec(recenter);
    expect(insetMatch).not.toBeNull();
    expect(slopMatch).not.toBeNull();
    const recenterOffset = Number(insetMatch?.[1]) * NATIVE_REM;
    const recenterHitSlop = Number(slopMatch?.[1]);
    // Non-vacuity: the two numbers below are the whole clearance, and a mis-read default would
    // make it look infinite.
    expect(recenterOffset).toBeGreaterThan(0);
    expect(recenterHitSlop).toBeGreaterThanOrEqual(0);

    const right = px(html, WIDGET, 'right');
    const touchWidth = Math.max(px(html, TOGGLE, 'width'), px(html, TOGGLE, 'min-width'));
    // The pill's touch box ends exactly where the recenter's touch box begins: 4 + 44 + 8 = 56.
    // No shared pixel, and the drawn faces are 8 px apart (the recenter's own hit-slop is the
    // difference between the two).
    expect(right + touchWidth + recenterHitSlop).toBeLessThanOrEqual(recenterOffset);
    expect(right).toBe(recenterOffset - recenterHitSlop - touchWidth);
    expect(right + touchWidth).toBeLessThanOrEqual(recenterOffset - recenterHitSlop);
    expect(MAP_CONTROL_SIZE).toBeGreaterThan(0);

    // Right-anchored, and no longer left-anchored: the previous version lived in the other corner.
    expect(value(html, WIDGET, 'left')).toBeNull();
    expect(value(html, WIDGET, 'right')).not.toBeNull();

    // Drawn faces, which is what the driver actually sees: the 24 px disc is centred in the 44 px
    // target, so 18 px separate it from the control's own drawn edge.
    const faceWidth = px(html, GLYPH, 'width');
    const drawnGap = recenterOffset - (right + (touchWidth - faceWidth) / 2 + faceWidth);
    expect(drawnGap).toBe(18);
    expect(drawnGap).toBeGreaterThan(0);

    // The revealed label has to fit in the same strip, or revealing it is what puts the credit
    // under the control. Its horizontal footprint is derived from the declarations (jsdom does no
    // layout): one line box of 10 px, 3 px of horizontal padding on each side, a 1 px border —
    // 18 px, right-aligned at the widget's edge, so it ends 38 px short of the control.
    const strip = verticalStripWidth(html, CREDIT);
    expect(value(html, CREDIT, 'line-height')).toBe('1');
    expect(strip).toBe(18);
    expect(right + strip).toBeLessThanOrEqual(recenterOffset);
    expect(recenterOffset - (right + strip)).toBeGreaterThan(0);

    // And lifted clear of the sheet handle, which covers the bottom strip of the map, exactly as
    // `attributionCompliance.test.ts` asserts from the same constant.
    const handleMatch = /HANDLE_ONLY_VISIBLE\s*=\s*(\d+)/.exec(readSource(BOTTOM_SHEET));
    expect(handleMatch).not.toBeNull();
    expect(px(html, WIDGET, 'bottom')).toBeGreaterThanOrEqual(Number(handleMatch?.[1]));
  });
});
