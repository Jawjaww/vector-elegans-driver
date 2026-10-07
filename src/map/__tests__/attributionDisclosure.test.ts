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
import {
  ATTRIBUTION_LABEL_BOTTOM,
  ATTRIBUTION_LABEL_RIGHT_INSET,
  ATTRIBUTION_LABEL_STRIP_W,
  INSTRUCTION_BAND_TOP,
  MAP_CONTROL_RIGHT_INSET,
  MAP_CONTROL_TOUCH_SLOP,
  OVERLAY_STACK_GAP,
  SHEET_PEEK_VISIBLE_H,
} from '../../lib/utils/overlayLane';

/**
 * The credit, after the (i) pill went away.
 *
 * The pill was the answer to an earlier correction — make the credit discreet, paint only a small
 * marker, reveal the label on the tap — and it produced a placement defect of its own. It sat in
 * the strip the low overlays occupy, so it was drawn across the sentence the driver is reading
 * ("Rendez-vous au point de prise en charge", the guidance bar) and across the control that says
 * where the driver currently is. The owner named both and asked for exactly two things: drop the
 * pill, keep the vertical « © OpenStreetMap » label, and lift it clear of that low band.
 *
 * So the credit is now **one permanent element**, painted at all times and linked to the copyright
 * page, and the disclosure mechanism it used to need is gone — markup, CSS, click listener,
 * `aria-expanded`, all of it. This is a licence term and not a preference, so the guards read:
 *
 * 1. **exactly ONE credit element exists in the document, and it paints** — counted over the live
 *    DOM and over the whole body, not asserted as the presence of the expected id, because the
 *    defect was a count (a pill *and* a label, then a label *and* a panel);
 * 2. nothing may make it invisible — no `display: none`, no `opacity: 0`, no `visibility: hidden`,
 *    no unreadable size, no negative offset, and no `hidden` attribute it could be flipped by,
 *    since there is no tap left to flip it;
 * 3. **its bottom clears the instruction band** — computed from the shared lane figures
 *    (`SHEET_PEEK_VISIBLE_H` + `LANE_BASE_OFFSET` + `TRIP_GUIDANCE_BAR_HEIGHT`), never from a
 *    number copied into this file, which is what makes the guard survive a move of the lane;
 * 4. **it is out of the recenter control's touch rectangle** — the guard the previous correction
 *    was missing, and the reason it shipped a defect while its own arithmetic said "34 px clear".
 *    The control was placed with `right-4`, read as 4 rem = 56 px; a Tailwind spacing step is
 *    `0.25rem`, and NativeWind's rem is 14 on native, so the class is 14 px and the credit's 18 px
 *    column (4..22) sat *inside* its touch zone. The claim here is the one that can be proven: the
 *    two rectangles are disjoint horizontally. The vertical claim cannot be made at all — the
 *    control's bottom is the settled, uncapped sheet height plus `CONTROL_BASE_OFFSET`, so it
 *    sweeps the column whatever offset the credit is given (see the second test below, which pins
 *    that in the dashboard and the sheet's own source);
 * 5. it stays legible (10 px, vertical) and stays the anchor, so dropping the panel did not drop
 *    the link.
 *
 * Both counts are proved non-vacuous by planting the state they are meant to catch: a second
 * credit element in the DOM (the count has to reach two), a too-low `bottom` (the placement guard
 * has to fail), and the control put back at `right-4` (the corner guard has to fail). A guard that
 * could only ever see one element, or that passed on the old offsets, would not be a guard.
 */

const CREDIT = '#ve-attrib-credit';

/** The page the credit points at, and the counterpart of the ODbL credit it carries. */
const CREDIT_URL = 'https://www.openstreetmap.org/copyright';

/** The ids that went with the disclosure mechanism, and must not come back. */
const REMOVED_TOGGLE = 've-attrib-toggle';
const REMOVED_GLYPH = 've-attrib-glyph';
const REMOVED_WIDGET = 've-attrib';
const REMOVED_PANEL = 've-attrib-full';

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();
const RECENTER_BUTTON = 'src/components/MapRecenterButton.tsx';
/** Where the control's vertical anchor is built, and why it is not a lane figure. */
const DASHBOARD = 'app/(tabs)/index.tsx';
const BOTTOM_SHEET_SOURCE = 'src/components/BottomSheet.tsx';

/**
 * NativeWind's rem is **14** on native, not the web's 16 (`react-native-css-interop` sets it:
 * `dist/runtime/native/unit-observables.js`). Tailwind's spacing scale is in rem, so `right-4` is
 * **1 rem = 14 px** — not 4 rem. The previous guard multiplied the class digit by the rem
 * (`4 * 14 = 56`) and concluded the control left the outer 56 px free, which is 42 px more than it
 * does: the control actually reaches to 14 px from the edge, and the credit's 18 px column (4..22)
 * is inside its touch zone. The CLI output is the evidence for the class side:
 * `npx tailwindcss` with `nativewind/preset` emits `right: 1rem`.
 */
const NATIVE_REM = 14;

/**
 * `right-4` in px on native: the spacing step `4` is `1rem` in Tailwind's scale (`4 * 0.25rem`),
 * so it is one rem here, not four. The digit of the class is a *step*, not a count of rems.
 */
const RIGHT_4_PX = 1 * NATIVE_REM;

/** Tags whose text is never painted, whatever they contain. */
const NON_PAINTED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'TITLE', 'META', 'LINK']);

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
 * whether the credit can reach the recenter control.
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
 * The body of the built document in the live DOM. `innerHTML` never runs scripts, which is the
 * point: a credit that only paints once some script has run is a credit that disappears with the
 * map, so what is asserted here is the markup as the browser first receives it.
 */
function mountDocument(html: string): void {
  const bodyStart = html.indexOf('<body>') + '<body>'.length;
  const bodyEnd = html.indexOf('</body>');
  document.body.innerHTML = html.slice(bodyStart, bodyEnd);
}

/**
 * The credit elements the document actually paints, as ids — a **count**, because the defect was
 * a count.
 *
 * It walks the whole body rather than a widget's children: the wrapper is gone, so a probe scoped
 * to it would see nothing at all and pass on an empty document. An element counts when it carries
 * the credit text *in its own text node* (so a container is not counted for its child's sake) and
 * paints (`display`, which is what jsdom resolves the `hidden` attribute to).
 */
function paintedCreditIds(): string[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('*'))
    .filter((element) => !NON_PAINTED_TAGS.has(element.tagName))
    .filter((element) => window.getComputedStyle(element).display !== 'none')
    .filter((element) =>
      Array.from(element.childNodes).some(
        (node) => node.nodeType === 3 && /openstreetmap/i.test(node.textContent ?? ''),
      ),
    )
    .map((element) => element.id || element.tagName.toLowerCase());
}

/**
 * The placement rule, as a predicate: the credit's bottom edge is at or above the bottom of the
 * instruction band, so the sentence the driver is reading is never under the credit.
 *
 * A function rather than an inline comparison so the same rule can be pointed at a mutated
 * document — which is how the guard is proved non-vacuous below.
 */
function clearsInstructionBand(html: string): boolean {
  return px(html, CREDIT, 'bottom') >= INSTRUCTION_BAND_TOP;
}

const LOCATION = { lat: 48.85, lng: 2.35 };

describe('map attribution credit', () => {
  const html = buildMapHtmlTemplate(LOCATION);

  it('paints exactly one credit element, from the document\u2019s own markup', () => {
    // The element is markup in the body, not a string the map script may or may not insert: a
    // credit that exists only once MapLibre booted is a credit that disappears with the map.
    const body = html.indexOf('<body>');
    const creditAt = html.indexOf('id="ve-attrib-credit"');
    const scriptAt = html.indexOf('<script>', body);
    expect(body).toBeGreaterThanOrEqual(0);
    expect(creditAt).toBeGreaterThan(body);
    expect(creditAt).toBeLessThan(scriptAt);

    // Something painted at all times has to name the data source, and it must not be hidden: the
    // `hidden` attribute was the disclosure's only moving part, and there is no disclosure left.
    expect(html).toContain('OpenStreetMap');
    expect(/<a[^>]*id="ve-attrib-credit"[^>]*\shidden/.test(html)).toBe(false);

    // The mechanism is gone, all of it: the pill, its glyph, the wrapper it lived in, the panel
    // that once opened beside the label, and the two ARIA attributes that described the tap.
    expect(new RegExp(REMOVED_TOGGLE).test(html)).toBe(false);
    expect(new RegExp(REMOVED_GLYPH).test(html)).toBe(false);
    expect(new RegExp(`id="${REMOVED_WIDGET}"`).test(html)).toBe(false);
    expect(html).not.toContain(REMOVED_PANEL);
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain('aria-controls');
    expect(/<button[^>]*id="ve-attrib/.test(html)).toBe(false);

    // Correction 1, measured rather than deduced from the markup: in a real DOM, exactly one
    // element carries the credit and paints.
    mountDocument(html);
    expect(paintedCreditIds()).toEqual(['ve-attrib-credit']);

    // Non-vacuity, on the defect's own shape: a second credit element is planted in the DOM and
    // the count has to reach two. Without this, a probe that could never see more than one
    // element would pass on the exact screen the owner reported.
    const duplicate = document.createElement('a');
    duplicate.id = REMOVED_PANEL;
    duplicate.href = CREDIT_URL;
    duplicate.textContent = '\u00a9 OpenStreetMap contributors';
    document.body.appendChild(duplicate);
    expect(paintedCreditIds()).toEqual(['ve-attrib-credit', REMOVED_PANEL]);
  });

  it('lifts the credit above the instruction band, with the shared lane figures', () => {
    // The placement defect in one line: the credit used to sit in the low strip, `SHEET_PEEK +
    // LANE_BASE_OFFSET` at most, which is inside the band the guidance bar occupies. The figures
    // below are read from `overlayLane.ts` — the lane's own source — and never copied here, so
    // moving the bar or the sheet lip moves this guard with them.
    const bottom = px(html, CREDIT, 'bottom');
    expect(bottom).toBe(ATTRIBUTION_LABEL_BOTTOM);
    expect(clearsInstructionBand(html)).toBe(true);

    // The measured clearance, not merely "it passes": the credit's bottom edge stands one stack
    // gap above the top of the band, and the band is the sheet lip plus the base offset plus the
    // bar, measured from the bottom of the map.
    expect(bottom - INSTRUCTION_BAND_TOP).toBe(OVERLAY_STACK_GAP);
    expect(INSTRUCTION_BAND_TOP).toBeGreaterThan(SHEET_PEEK_VISIBLE_H);

    // Non-vacuity: the guard has to fail on the state being corrected. The built document is
    // rewritten one pixel inside the band — exactly the defect the owner reported — and the same
    // predicate that just passed has to answer false.
    const tooLow = html.replace(`bottom: ${bottom}px`, `bottom: ${INSTRUCTION_BAND_TOP - 1}px`);
    expect(tooLow).not.toBe(html);
    expect(clearsInstructionBand(tooLow)).toBe(false);
  });

  it('never lets the credit be hidden by a rule or by an inline style', () => {
    const rules = declarations(html, CREDIT);
    // Non-vacuity: a selector with no rule would make the guard below pass on nothing.
    expect({ selector: CREDIT, rules: rules.length > 0 }).toEqual({ selector: CREDIT, rules: true });
    expect({ selector: CREDIT, hiding: rules.filter(hidesOrShrinks) }).toEqual({
      selector: CREDIT,
      hiding: [],
    });

    // And there is no second place to switch it off: the disclosure script that used to toggle an
    // attribute is gone, and nothing reaches for an inline style on the credit.
    expect(/getElementById\(['"]ve-attrib-toggle['"]\)/.test(html)).toBe(false);
    expect(/['"]ve-attrib[^'"]*['"]\s*\)\s*\.style\s*\./.test(html)).toBe(false);
    expect(/removeAttribute\(['"]hidden['"]\)/.test(html)).toBe(false);
    expect(/setAttribute\(['"]hidden['"]/.test(html)).toBe(false);
  });

  it('pins a legibility floor for the credit: it is very small, not unreadable', () => {
    // "en très très petit". Small enough to be a whisper beside the map, above the floor below
    // which a licence credit stops being a credit.
    const fontSize = px(html, CREDIT, 'font-size');
    expect({ fontSize, floor: fontSize >= 9 && fontSize <= 11 }).toEqual({ fontSize, floor: true });

    // Vertical, as the owner asked, and permanent: nothing the driver has to do to read it.
    expect(value(html, CREDIT, 'writing-mode')).toBe('vertical-rl');
    expect(value(html, CREDIT, 'line-height')).toBe('1');

    // A short label is what keeps the strip a strip: it sits in the narrow column the corner
    // leaves free, above the control that owns that corner.
    const label = /<a[^>]*id="ve-attrib-credit"[^>]*>([^<]*)<\/a>/.exec(html);
    const text = label === null ? '' : label[1].trim();
    expect({ text: text.length > 0, short: text.length <= 20 }).toEqual({ text: true, short: true });
    expect(text).toContain('OpenStreetMap');

    // Contrast is computed, not assumed. The face is translucent, so it is composited over the
    // basemap canvas and, worst case, over black.
    for (const backdrop of [parseColor(BASEMAP_CANVAS), parseColor('#000000')]) {
      const ink = parseColor(value(html, CREDIT, 'color') ?? 'transparent');
      const face = parseColor(value(html, CREDIT, 'background-color') ?? 'transparent');
      const ratio = contrastRatio(ink, composite(face, backdrop));
      expect({ ratio: Number(ratio.toFixed(2)), ok: ratio >= 4.5 }).toEqual({
        ratio: Number(ratio.toFixed(2)),
        ok: true,
      });
    }
  });

  it('keeps the credit itself the link to the copyright page', () => {
    expect(html).toContain(`href="${CREDIT_URL}"`);

    // The credit *is* the anchor — one element doing both jobs, which is how the licence term is
    // satisfied without a pill, a panel or a tap. Anchored on the credit's own id, so a link
    // elsewhere cannot satisfy this.
    const anchor = /<a\s[^>]*id="ve-attrib-credit"[^>]*>([^<]*)<\/a>/.exec(html);
    expect(anchor).not.toBeNull();
    expect(anchor?.[1]).toContain('OpenStreetMap');
    expect(anchor?.[0]).toContain(`href="${CREDIT_URL}"`);
    expect(anchor?.[0]).toContain('target="_blank"');
    expect(anchor?.[0]).toContain('rel="noopener"');
    // The exact ODbL wording ("contributors") is carried by the accessible name while the painted
    // text stays the short label the owner asked for.
    expect(anchor?.[0]).toContain('aria-label="\u00a9 OpenStreetMap contributors"');
  });

  it('stays out of the recenter control, in the axis that can be proven', () => {
    // The control is the other tenant of this corner, and it is the reason the credit has to be
    // placed against more than the instruction band. Its numbers are shared figures now, not a
    // class: the class was the defect. `right-4` reads as "4 rem = 56 px" and is **1 rem = 14 px**
    // on native (a spacing step is `0.25rem`), so the touch zone began 6 px from the edge and the
    // credit's column was inside it. The component has to read the derived inset, and must not go
    // back to a `right-N` class that could be mis-read again.
    const recenter = readSource(RECENTER_BUTTON);
    expect(recenter).toContain('right: MAP_CONTROL_RIGHT_INSET');
    expect(recenter).toContain('hitSlop={MAP_CONTROL_TOUCH_SLOP}');
    expect(recenter).not.toMatch(/className="[^"]*\bright-\d/);

    // The credit's column as the document actually paints it.
    const right = px(html, CREDIT, 'right');
    const strip = verticalStripWidth(html, CREDIT);

    const clearOfRecenter = (controlRightInset: number): boolean =>
      controlRightInset - MAP_CONTROL_TOUCH_SLOP - (right + strip) >=
      OVERLAY_STACK_GAP;

    // Both rectangles as distances from the right edge of the scene: the control's touch zone has
    // to start where the credit's column ends, with the lane's own gap — and that is the whole
    // clearance, no pixel of slack invented on top. This is the claim, and it is measured on the
    // built document, so a credit moved back into the control's column fails it directly.
    expect(clearOfRecenter(MAP_CONTROL_RIGHT_INSET)).toBe(true);
    expect(
      MAP_CONTROL_RIGHT_INSET - MAP_CONTROL_TOUCH_SLOP - (right + strip),
    ).toBe(OVERLAY_STACK_GAP);

    // The two figures the claim is made of, each pinned to the lane module: the document may not
    // carry its own right inset, and the shared figure may not be a literal that happens to pass.
    expect(right).toBe(ATTRIBUTION_LABEL_RIGHT_INSET);
    expect(strip).toBe(ATTRIBUTION_LABEL_STRIP_W);
    expect(value(html, CREDIT, 'left')).toBeNull();
    expect(MAP_CONTROL_RIGHT_INSET).toBe(
      ATTRIBUTION_LABEL_RIGHT_INSET +
        ATTRIBUTION_LABEL_STRIP_W +
        OVERLAY_STACK_GAP +
        MAP_CONTROL_TOUCH_SLOP,
    );

    // Non-vacuity, on the state being corrected: with the control back at `right-4` — 1 rem, 14 px
    // — the same predicate has to fail. It does, by 16 px, which is the overlap the owner saw.
    expect(clearOfRecenter(RIGHT_4_PX)).toBe(false);
    expect(RIGHT_4_PX - MAP_CONTROL_TOUCH_SLOP - (right + strip)).toBeLessThan(0);
  });

  it('cannot clear the control vertically, so the guard is horizontal', () => {
    // Why the credit was not simply raised until it was above the control, which is what the
    // report asked for: the control's bottom is not a lane figure. The dashboard anchors it to the
    // *settled* sheet height (`sheetVisibleHeight` of the palier the driver let the sheet rest on)
    // plus `CONTROL_BASE_OFFSET`, and `sheetVisibleHeight` answers from measured section bottoms.
    const dashboard = readSource(DASHBOARD);
    expect(dashboard).toContain(
      'return sheetVisibleHeight(sheetLevel, sheetBodies);',
    );
    expect(dashboard).toContain(
      'mapRecenterBottomOffset + CONTROL_BASE_OFFSET',
    );

    // And that height is deliberately uncapped — the sheet says so where it resolves the palier.
    // So the control's band top is the measured content of whatever palier settled: no lane
    // constant bounds it, and a test cannot reproduce the values a device measures. A fixed credit
    // offset cannot be shown to clear it — raising the credit moves the band in which the two can
    // meet up with it. Hence two separate claims: the instruction band below (vertical, bounded)
    // and the control above (horizontal, static).
    const sheet = readSource(BOTTOM_SHEET_SOURCE);
    expect(sheet).toContain('Deliberately **not** capped by');
  });
});
