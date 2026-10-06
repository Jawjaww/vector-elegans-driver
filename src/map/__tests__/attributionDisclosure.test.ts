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
 * That correction left a second defect behind, and it is the one this file now guards: the tap
 * opened *two* credit elements at once — the vertical label **and** a large panel listing every
 * provider. The owner named it in as many words: « quand on appuie sur le i, tu affiches deux
 * labels différents, l'un vertical et l'autre beaucoup plus gros ». The big one is gone; the
 * vertical one is all the tap reveals.
 *
 * That is a styling request and it lands on a licence term: the basemap is OpenFreeMap /
 * OpenMapTiles over OpenStreetMap data, and the ODbL behind the OSM data requires the credit to be
 * shown. So the credit may be *discreet*, it may be *revealed*, it may never be *disappearable* —
 * and, since the panel that carried the link is gone, the revealed label is itself the anchor to
 * the copyright page: a credit that is a link satisfies the term without adding a second element.
 *
 * The rule therefore changed nature rather than going away, and this file asserts the five things
 * that make it a rule:
 *
 * 1. at rest, only the (i) is painted — the credit sits in the markup behind the browser's own
 *    `[hidden]` rule, so nothing paints it by accident, and no second credit exists to reveal;
 * 2. **the tap reveals exactly ONE credit element** — asserted as a count over the live DOM, not
 *    as the presence of the one expected id, so a panel of providers cannot come back beside it;
 * 3. the tap reveals the credit and the next tap hides it again — exercised in a real DOM
 *    (`@jest-environment jsdom`), not read out of the string;
 * 4. no rule and no inline style can hide the credit while it is open, nor leave it painted once
 *    it is closed: `display` is banned outright on the revealed element, because a `display`
 *    declaration beats the UA's `[hidden] { display: none }` in both directions;
 * 5. the pill's *visible* size is small and its *touch* size is not — two numbers, asserted as
 *    two numbers, and both measured against the recenter control that owns the same corner.
 *
 * The count in (2) is itself proved non-vacuous: a second revealed credit is planted in the DOM
 * and the same probe has to report two. A guard that could only ever see one element would pass on
 * the exact state the owner reported.
 */

const WIDGET = '#ve-attrib';
const TOGGLE = '#ve-attrib-toggle';
const GLYPH = '#ve-attrib-glyph';
const CREDIT = '#ve-attrib-credit';

/** The page the revealed label points at, and the counterpart of the ODbL credit it carries. */
const CREDIT_URL = 'https://www.openstreetmap.org/copyright';

/** The id of the panel that used to open beside the label, and must not come back. */
const REMOVED_PANEL = 've-attrib-full';

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

/**
 * The credits the tap actually reveals, as ids — a **count**, because the defect was a count.
 *
 * It walks the widget's own children, keeps the ones that paint (`display` is what jsdom resolves
 * from the `hidden` attribute) and that carry the credit, and returns their ids. Asking whether
 * the expected label is present would have stayed green throughout the bug: the label was there,
 * a second element was there with it.
 */
function revealedCreditIds(): string[] {
  const widget = document.getElementById('ve-attrib');
  if (widget === null) throw new Error('the attribution widget is missing from the document');
  return Array.from(widget.children)
    .filter((child) => window.getComputedStyle(child).display !== 'none')
    .filter((child) => /openstreetmap/i.test(child.textContent ?? ''))
    .map((child) => child.id || child.tagName.toLowerCase());
}

function widget(): HTMLElement {
  const element = document.getElementById('ve-attrib');
  if (element === null) throw new Error('the attribution widget is missing from the document');
  return element;
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

    // Correction 1: one permanent element. The one revealed element carries `hidden` in the
    // markup, so a document whose script never runs at all shows the (i) and no credit.
    expect(/<a[^>]*id="ve-attrib-credit"[^>]*\shidden/.test(html)).toBe(true);
    expect(/<button[^>]*id="ve-attrib-toggle"[^>]*\shidden/.test(html)).toBe(false);

    // Correction 2: the panel is not hidden behind the label, it is *gone*. `hidden` would leave
    // the duplicate one attribute away from coming back, which is the state being corrected.
    expect(html).not.toContain(REMOVED_PANEL);

    // And nothing in the stylesheet may paint the label anyway: a `display` declaration of *any*
    // value on a `[hidden]` element beats the browser's own rule, which is how a "revealed" credit
    // becomes a permanently painted one.
    const rules = declarations(html, CREDIT);
    expect({ selector: CREDIT, rules: rules.length > 0 }).toEqual({ selector: CREDIT, rules: true });
    expect({
      selector: CREDIT,
      display: rules.filter((declaration) => declaration.startsWith('display:')),
    }).toEqual({ selector: CREDIT, display: [] });
  });

  it('reveals the credit on the tap, and hides it again on the next one', () => {
    mountDocument(html);

    // Closed at rest, and measurably so — not merely "carries an attribute".
    expect(displayOf('ve-attrib-credit')).toBe('none');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    // Nothing to read twice: at rest the widget reveals no credit at all.
    expect(revealedCreditIds()).toEqual([]);

    toggle().click();
    expect(displayOf('ve-attrib-credit')).not.toBe('none');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(revealedCreditIds()).toEqual(['ve-attrib-credit']);

    toggle().click();
    expect(displayOf('ve-attrib-credit')).toBe('none');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(revealedCreditIds()).toEqual([]);
  });

  it('opens exactly one credit element on the tap, so the two-label defect cannot return', () => {
    mountDocument(html);
    toggle().click();

    // The defect in one line. The document this replaces answered it with
    // ['ve-attrib-credit', 've-attrib-full'] — two labels, the vertical one and the big one.
    expect(revealedCreditIds()).toEqual(['ve-attrib-credit']);

    // Non-vacuity, on the defect's own markup: the old panel is planted back in the DOM and the
    // count has to reach two. Without this, a probe that could never see more than one element
    // would pass on the exact screen the owner reported.
    const oldPanel = document.createElement('div');
    oldPanel.id = REMOVED_PANEL;
    oldPanel.innerHTML = `<a href="${CREDIT_URL}">© OpenStreetMap contributors</a>`;
    widget().appendChild(oldPanel);
    expect(revealedCreditIds()).toEqual(['ve-attrib-credit', REMOVED_PANEL]);

    // And the tap that closes it closes the one element there is.
    oldPanel.remove();
    toggle().click();
    expect(revealedCreditIds()).toEqual([]);
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

  it('makes the revealed label itself the link to the copyright page', () => {
    expect(html).toContain('id="ve-attrib-toggle"');
    // The pill controls the one element the tap opens.
    expect(html).toContain('aria-controls="ve-attrib-credit"');

    // The credit is in the document, and it names its source.
    expect(html).toContain('OpenStreetMap');
    expect(html).toContain(`href="${CREDIT_URL}"`);

    // And it is the credit *itself* that is the anchor — one element doing both jobs. That is the
    // counterpart of dropping the panel: the licence asks for the credit to be visible and, where
    // it can be, clickable, and a clickable label satisfies both without a second element.
    const anchor = /<a\s[^>]*id="ve-attrib-credit"[^>]*>([^<]*)<\/a>/.exec(html);
    expect(anchor).not.toBeNull();
    expect(anchor?.[1]).toContain('OpenStreetMap');
    expect(anchor?.[0]).toContain(`href="${CREDIT_URL}"`);
    expect(anchor?.[0]).toContain('target="_blank"');
    expect(anchor?.[0]).toContain('rel="noopener"');

    // And the disclosure is wired: the label collapses through the `hidden` attribute and the
    // script toggles exactly that attribute, so no rule can make it permanently invisible.
    // The removed panel is reached by nothing, anywhere in the document.
    expect(/getElementById\(['"]ve-attrib-credit['"]\)/.test(html)).toBe(true);
    expect(/getElementById\(['"]ve-attrib-full['"]\)/.test(html)).toBe(false);
    expect(/removeAttribute\(['"]hidden['"]\)/.test(html)).toBe(true);
    expect(/setAttribute\(['"]hidden['"]/.test(html)).toBe(true);
    expect(declarations(html, CREDIT).filter(hidesOrShrinks)).toEqual([]);
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
    expect(/<a[^>]*id="ve-attrib-credit"[^>]*\shidden/.test(html)).toBe(true);

    // A short label is what keeps the revealed strip a strip: it sits above the pill, inside the
    // narrow column the corner leaves free.
    const label = /<a[^>]*id="ve-attrib-credit"[^>]*>([^<]*)<\/a>/.exec(html);
    const text = label === null ? '' : label[1].trim();
    expect({ text: text.length > 0, short: text.length <= 20 }).toEqual({
      text: true,
      short: true,
    });
    expect(text).toContain('OpenStreetMap');

    // Contrast is computed, not assumed. The faces are translucent, so each is composited over
    // the basemap canvas and, worst case, over black.
    const backdrops = [parseColor(BASEMAP_CANVAS), parseColor('#000000')];
    for (const selector of [GLYPH, CREDIT]) {
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
    for (const selector of [WIDGET, TOGGLE, GLYPH, CREDIT]) {
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
