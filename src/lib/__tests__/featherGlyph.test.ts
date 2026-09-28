// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import { FEATHER_GLYPHS, type GlyphShape } from '../featherGlyphs';
import { ACCENT_OUTLINE_WIDTH, APP_CHROME, VE_BLUE } from '../theme';

/**
 * The gradient glyphs.
 *
 * Three decisions are pinned here, none of which a render test would catch and all of which a
 * plausible edit would silently reverse: that an accent glyph is *painted* with a gradient rather
 * than stroked in a flat blue, that the glyphs are drawn as the paths they claim to be, and that
 * the gradient on the dark chrome is a lifted pair rather than the portal's button pair — which is
 * unreadable here for a reason this file measures rather than asserts by eye.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const GLYPH_COMPONENT = 'src/components/FeatherGlyph.tsx';
const ACCENT_OUTLINE = 'src/components/AccentOutline.tsx';
const TAB_ICON = 'src/components/DriverTabBarIcon.tsx';
const TAB_LAYOUT = 'app/(tabs)/_layout.tsx';
const PROFILE = 'app/(tabs)/profile.tsx';
const RIDES = 'app/(tabs)/rides.tsx';

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * Source with its comments removed.
 *
 * Several assertions below are about the *absence* of a thing the prose deliberately names — the
 * reason the gradient cannot go through `@expo/vector-icons` is written next to the code that does
 * not use it — and a naive `not.toContain` would fail on the explanation.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

/** One sRGB channel, linearised. The transfer function WCAG defines, not an approximation. */
function linearise(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(css: string): number {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(css);
  if (!hex) throw new Error(`not an opaque hex colour: ${css}`);
  const packed = parseInt(hex[1], 16);
  return (
    0.2126 * linearise((packed >> 16) & 255) +
    0.7152 * linearise((packed >> 8) & 255) +
    0.0722 * linearise(packed & 255)
  );
}

/** WCAG contrast ratio — the real formula, because this file makes a claim against a 3:1 floor. */
function contrastRatio(foreground: string, background: string): number {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)];
  const lighter = Math.max(...luminances);
  const darker = Math.min(...luminances);
  return (lighter + 0.05) / (darker + 0.05);
}

const glyphComponent = stripComments(readSource(GLYPH_COMPONENT));
const tabIcon = stripComments(readSource(TAB_ICON));
const tabLayout = stripComments(readSource(TAB_LAYOUT));
const profile = stripComments(readSource(PROFILE));

describe('an accent glyph', () => {
  it('is painted with a gradient, not stroked in a flat blue', () => {
    // Asserting only that a `<LinearGradient>` is declared would be vacuous: a flat
    // `stroke="#3b82f6"` left beside an unused definition passes that. The gradient has to be
    // *referenced* by the stroke, and both sides of that reference are taken from the same
    // constant, so the declaration and its use cannot drift apart. This is the check the web
    // portal's own icon test had to be rewritten to make.
    expect(glyphComponent).toContain('id={gradientId}');
    expect(glyphComponent).toMatch(/url\(#\$\{gradientId\}\)/);

    // And every colour comes from the theme. A component carrying no hex literal at all cannot
    // have picked a blue of its own, which is the whole failure mode here.
    expect(glyphComponent).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(glyphComponent).toContain('VE_BLUE.glyphGradient[0]');
    expect(glyphComponent).toContain('VE_BLUE.glyphGradient[1]');
    // A font glyph takes one colour, so the icon can no longer be one.
    expect(glyphComponent).not.toContain('@expo/vector-icons');
  });

  it('gets a gradient id of its own, because several are on screen at once', () => {
    // The profile puts six of these on one screen. A fixed id would be declared six times over,
    // and the two failure modes are opposite: on the platforms that scope ids per SVG root
    // nothing breaks, and on the ones that do not, a shared id is a glyph painted with whatever
    // the last declaration said. `useId` is the one source of uniqueness React guarantees here.
    expect(glyphComponent).toContain('useId()');
    expect(glyphComponent).toMatch(/const gradientId = `ve-glyph-\$\{useId\(\)/);
    // Sanitised, because the id becomes part of `url(#…)` and `useId` returns `:r0:`.
    expect(glyphComponent).toContain(".replace(/[^a-zA-Z0-9]/g, '')");
  });

  it('is a flat colour only when the caller asks for one', () => {
    // The tab bar's unselected glyph is the only flat caller. Written as "no colour means the
    // gradient" rather than a boolean flag, because the tab bar is no longer the only caller and
    // "which colour" is the question each one actually has.
    expect(glyphComponent).toContain('color?: string');
    expect(glyphComponent).toContain('const stroke = color ?? `url(#${gradientId})`');
    expect(glyphComponent).toContain('{color ? null : (');
    expect(tabIcon).toContain('color={focused ? undefined : INACTIVE}');
    // And the wrapper adds nothing of its own, so there is one place that decides what a tab
    // glyph looks like.
    expect(tabIcon).not.toContain('Svg');
    expect(tabIcon).not.toContain('LinearGradient');
  });
});

describe('the glyphs that are vendored', () => {
  it('is exactly the set its callers ask for, both ways round', () => {
    // A name in the map that no caller uses is dead data, and a caller asking for a name that is
    // not in the map is a blank chip. The second is a type error; the first is not, and only a
    // test catches it. Both callers are read rather than a list being copied here.
    const tabs = [...tabLayout.matchAll(/<DriverTabBarIcon\s+name="([^"]+)"/g)].map(
      (match) => match[1],
    );
    const rows = [...profile.matchAll(/icon: '([^']+)'/g)].map((match) => match[1]);

    expect(tabs.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
    expect([...tabs, ...rows].sort((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(FEATHER_GLYPHS).sort((a, b) => a.localeCompare(b)),
    );
  });

  it('sits centred in its grid, which is what the disc was blamed for', () => {
    // The complaint that started this: an icon reading as off-centre. The cause was the disc and
    // its ring, not the geometry — but "the geometry is fine" deserves a guard, since a mistyped
    // coordinate moves a glyph further than the ring ever did.
    //
    // Exact where the geometry can be enumerated: a union of points, circles and rectangles has a
    // bounding box computable here. Feather's own numbers are asymmetric — its `truck` spans 1..23,
    // its `navigation` 3..22 — so the tolerance is one grid unit, not zero: what is asserted is
    // that nothing has slipped off the grid, not that Feather drew every glyph symmetrically.
    //
    // The path-based glyphs (`file-text`, `download-cloud`, `volume-2`, `help-circle`, `tool`, and
    // the `home` and `user` legs) would need an SVG path parser to enumerate. They were checked by
    // *rendering* instead: each glyph's `getBBox()` in a browser, unioned over its shapes, lands
    // within 0.5 grid unit of (12, 12) — 0.42 px at the 22-point size these are drawn at. That is
    // the method to re-run if a path is ever touched; this list is what remains uncovered here.
    const bounds = (shapes: readonly GlyphShape[]) => {
      if (shapes.some((shape) => shape.kind === 'path')) return null;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const add = (x: number, y: number) => {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      };
      for (const shape of shapes) {
        if (shape.kind === 'circle') {
          add(shape.cx - shape.r, shape.cy - shape.r);
          add(shape.cx + shape.r, shape.cy + shape.r);
        } else if (shape.kind === 'rect') {
          add(shape.x, shape.y);
          add(shape.x + shape.width, shape.y + shape.height);
        } else if (shape.kind === 'line') {
          add(shape.x1, shape.y1);
          add(shape.x2, shape.y2);
        } else if (shape.kind === 'polyline' || shape.kind === 'polygon') {
          // Feather writes point lists space-separated; commas appear in hand-written ones.
          const numbers = shape.points.trim().split(/[\s,]+/).map(Number);
          for (let index = 0; index + 1 < numbers.length; index += 2) {
            add(numbers[index], numbers[index + 1]);
          }
        }
      }
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };

    const checked: string[] = [];
    for (const [name, shapes] of Object.entries(FEATHER_GLYPHS)) {
      const box = bounds(shapes);
      if (!box) continue;
      checked.push(name);
      const off = { name, dx: Math.round(Math.abs(box.cx - 12) * 10) / 10, dy: Math.round(Math.abs(box.cy - 12) * 10) / 10 };
      expect(off).toEqual({ name, dx: expect.any(Number), dy: expect.any(Number) });
      expect({ name, dx: Math.abs(box.cx - 12) <= 1 }).toEqual({ name, dx: true });
      expect({ name, dy: Math.abs(box.cy - 12) <= 1 }).toEqual({ name, dy: true });
    }

    // Non-vacuity: the enumerable shapes have to be a real subset, not all of them — otherwise the
    // paths, which are the majority, would be silently skipped by a `return null` that never runs.
    expect(checked.sort((a, b) => a.localeCompare(b))).toEqual([
      'navigation',
      'trending-up',
      'truck',
    ]);
  });

  it('carries the geometry it claims, so no glyph draws nothing', () => {
    // `toEqual` on the key sets above passes on a map of empty arrays. Every shape has to carry
    // its coordinates, or the icon is an empty SVG that still typechecks.
    const geometryOf = (shape: (typeof FEATHER_GLYPHS)[keyof typeof FEATHER_GLYPHS][number]): string => {
      switch (shape.kind) {
        case 'path':
          return shape.d;
        case 'circle':
          return `r${shape.r}`;
        case 'rect':
          return `${shape.width}x${shape.height}`;
        case 'line':
          return `${shape.x1},${shape.y1}->${shape.x2},${shape.y2}`;
        case 'polyline':
        case 'polygon':
          return shape.points;
      }
    };

    for (const [name, shapes] of Object.entries(FEATHER_GLYPHS)) {
      expect({ name, empty: shapes.length === 0 }).toEqual({ name, empty: false });
      for (const shape of shapes) {
        const geometry = geometryOf(shape);
        expect({ name, kind: shape.kind, geometry: geometry.trim() }).toEqual({
          name,
          kind: shape.kind,
          geometry: expect.stringMatching(/\S/),
        });
      }
    }
  });
});

describe('the profile rows', () => {
  it('carry the gradient glyph alone, the way the tab bar does', () => {
    // The row used to take the gradient's light stop as a *flat* colour on the font, which is a
    // different blue from the tab bar's beside it — the two read as two icon sets.
    expect(profile).toContain('<FeatherGlyph name={item.icon} size={22} />');
    expect(profile).not.toMatch(/<Feather\s+name=\{item\.icon/);
    // And the icon names are typed, so a row cannot ask for a glyph that was never vendored.
    expect(profile).toContain('icon: FeatherGlyphName');
  });

  it('gives the row no disc and no ring, because the pair of them read as a ball', () => {
    // The row carried a tinted disc, then a gradient ring around that disc. Both went: together
    // they stacked three concentric circles on every line, and a ring whose gradient runs
    // light-to-dark left-to-right drags the eye's centre off the glyph's. Pinned as absences,
    // because re-adding a container is the most natural "improvement" to make to a bare row.
    const row = profile.slice(profile.indexOf('menuItems.map'));
    const body = row.slice(0, row.indexOf('</Pressable>'));
    expect(body).not.toContain('rounded-full');
    expect(body).not.toContain('AccentRing');
    expect(body).not.toContain('tintAlpha');
    // What is left is a bare column, sized so the labels stay aligned regardless of glyph width.
    expect(body).toContain('<View className="w-6 items-center mr-4">');

    // And the same on the rides tab's empty state, which had briefly taken the ring too.
    expect(stripComments(readSource(RIDES))).not.toContain('AccentRing');
    expect(`${profile}${stripComments(readSource(RIDES))}`).not.toContain('ACCENT_RING');
  });

  it('outlines the edit button with a hairline of the light pair', () => {
    // Filled, the button competed with the blue wash of the card it sits on: two surfaces at full
    // strength, one of which is decoration. Outlined, it reads as a control on the card.
    const button = profile.slice(profile.indexOf('profile-setup'));
    const head = button.slice(0, button.indexOf('</Pressable>'));
    expect(head).toContain('<AccentOutline radius={999} thickness={ACCENT_OUTLINE_WIDTH} />');
    expect(head).toContain('backgroundColor: VE_BLUE.outlineFill');
    expect(head).toContain('VE_BLUE.glyphGradient[0]');
    // The old shape: a filled gradient pill with white upper-case type.
    expect(head).not.toContain('text-white text-xs font-bold uppercase');
    expect(ACCENT_OUTLINE_WIDTH).toBeGreaterThan(1);
  });

  it('strokes the outline over the face rather than cutting it into one', () => {
    // The single outline primitive, in `AccentOutline`. Stroked, because the controls it draws on
    // have translucent faces: an inset would let the gradient bleed through the middle and stop
    // being an outline. Pinned here because "simplify it to a border with a gradient behind" is a
    // natural-looking edit that silently turns chips and this button into dimmed solid pills.
    const outline = stripComments(readSource(ACCENT_OUTLINE));
    expect(outline).toContain('stroke={`url(#${gradientId})`}');
    expect(outline).toContain('strokeWidth={thickness}');
    // A fill would be a face, hiding the thing it is supposed to be drawn around.
    expect(outline).toContain('fill="none"');
    // Decoration: the press has to reach the `Pressable` it is inside.
    expect(outline).toContain('pointerEvents="none"');
    // It measures itself, because its callers are a pill sized by its label and chips that grow
    // when an option expands — neither knows its width to pass down.
    expect(outline).toContain('onLayout={measure}');
    expect(outline).toContain('StyleSheet.absoluteFill');
    // Inset by half the stroke so the control keeps the footprint it already had, and a radius of
    // half the height is a pill — which is how the button asks for one.
    expect(outline).toContain('x={thickness / 2}');
    expect(outline).toMatch(/rx=\{Math\.min\(radius, Math\.min\(box\.width, box\.height\) \/ 2\)\}/);
  });

  it('gives that face no reason to be opaque any more', () => {
    // The face was opaque because the hairline was *made* by covering a gradient; it is now stroked
    // over it — the previous test is the guard for that — so the opacity is a design choice rather
    // than a constraint. The value is still pinned, because it is the tone the button was asked
    // for, and it is still an opaque colour rather than an alpha over the card: what that buys is
    // a control that does not compete with the card's wash behind it.
    expect(VE_BLUE.outlineFill).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('the gradient itself', () => {
  it('clears the 3:1 floor a glyph needs, on the chrome it is drawn on', () => {
    for (const stop of VE_BLUE.glyphGradient) {
      expect(contrastRatio(stop, APP_CHROME.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('cannot be the portal button pair, and says so by measurement', () => {
    // The non-vacuity proof for the test above, in the same spirit as the broken-state simulation
    // in `42_invoker_dependencies_test.sql`: swapping in the pair that *looks* more branded has to
    // fail, or the lifted pair is not buying anything.
    //
    // If this ever stops holding, the button pair became legible on the chrome and the lift in
    // `VE_BLUE.glyphGradient` can be reconsidered — from the measurement, not by deleting this.
    expect(contrastRatio(VE_BLUE.gradient[1], APP_CHROME.surface)).toBeLessThan(3);
    expect(contrastRatio(VE_BLUE.gradient[0], APP_CHROME.surface)).toBeGreaterThan(3);
  });

  it('still carries the label of the outlined button', () => {
    // The label is the light stop on the opaque face cut out of the card. 11 px bold type, so 4.5:1
    // against its own face is the floor that matters.
    expect(
      contrastRatio(VE_BLUE.glyphGradient[0], VE_BLUE.outlineFill),
    ).toBeGreaterThanOrEqual(4.5);

    // The hairline runs the whole length of the button, so the test is on the whole ramp: both
    // stops of the light pair clear the 3:1 a boundary is asked for. The far stop does it with
    // 0.05 to spare, which is worth knowing — if the face is ever lifted, this is what breaks.
    for (const stop of VE_BLUE.glyphGradient) {
      expect(contrastRatio(stop, VE_BLUE.outlineFill)).toBeGreaterThanOrEqual(3);
    }

    // The non-vacuity proof that the pair is not a matter of taste. The two ramps are consecutive
    // steps of one blue: the light pair *ends* on the deep pair's first stop. So the deep pair buys
    // nothing at the near end and loses the far one, which drops under 3:1 — a hairline that fades
    // out halfway round the button.
    expect(VE_BLUE.glyphGradient[1]).toBe(VE_BLUE.gradient[0]);
    expect(contrastRatio(VE_BLUE.gradient[1], VE_BLUE.outlineFill)).toBeLessThan(3);
  });
});
