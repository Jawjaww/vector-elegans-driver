// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import { GLASS_MATERIALS, theme } from '../theme';
import { MAP_PALETTE } from '../mapPalette';
import { tripGuidanceAccent } from '../utils/tripGuidance';

/**
 * The panels drawn over the live map.
 *
 * The look these pin is a *decision*, not a taste: which two corners catch the light, which
 * layers make up the material, and the absence of a backdrop blur over a map that never holds
 * still. All of it is invisible in a render test and all of it would be silently reversed by a
 * plausible-looking edit, so it is pinned here by reading the source and the material.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const GLASS_PANEL = 'src/components/GlassPanel.tsx';
const THEME = 'src/lib/theme.ts';
const GUIDANCE_BAR = 'src/components/TripGuidanceBar.tsx';
const ARRIVAL_HUD = 'src/components/TripArrivalHud.tsx';
const MANEUVER_HUD = 'src/components/TripManeuverHud.tsx';
const NEON_SWIPE_BUTTON = 'src/components/NeonSwipeButton.tsx';

/** The three overlays that sit above the map and were restyled onto the panel. */
const GLASS_CONSUMERS = [GUIDANCE_BAR, ARRIVAL_HUD, MANEUVER_HUD];

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * Source with its comments removed.
 *
 * These tests are about what the code *does*, and several of them assert the absence of a thing
 * that the surrounding prose deliberately names — a comment explaining why `expo-blur` is not
 * used contains the word `expo-blur`, and a naive `not.toContain` would fail on the explanation
 * rather than on the code. The `//` guard skips the one in a URL scheme.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

/** Alpha channel of an `rgb()` / `rgba()` colour, as written in the palette. */
function alphaOf(css: string): number {
  const match = /rgba?\(([^)]*)\)/.exec(css);
  if (!match) throw new Error(`not an rgb colour: ${css}`);
  const parts = match[1].split(',');
  return parts.length < 4 ? 1 : Number(parts[3]);
}

/** Explicit comparator: Sonar S2871, and the key order is irrelevant to the comparison anyway. */
const sortedKeys = (value: object): string[] =>
  Object.keys(value).sort((a, b) => a.localeCompare(b));

describe('the glass the map overlays are made of', () => {
  it('lights two opposite corners and dims the other two', () => {
    const source = readSource(GLASS_PANEL);
    // Pairing asserted per side rather than as a set: the effect *is* the opposition, and four
    // sides carrying "some colour" would render as a flat box with a uniform border.
    expect(source).toMatch(/borderTopColor:\s*material\.edgeLit/);
    expect(source).toMatch(/borderLeftColor:\s*material\.edgeLit/);
    expect(source).toMatch(/borderBottomColor:\s*material\.edgeDim/);
    expect(source).toMatch(/borderRightColor:\s*material\.edgeDim/);
  });

  it('paints every layer the material declares', () => {
    // The material stopped being a fill and became a stack: a body gradient, a sheen that fades
    // out by halfway, an inner bevel that gives the panel thickness, the specular rim, and the
    // outer halo. Each one is a separate decision, and dropping any of them would leave the
    // others wired up and the tests green — which is precisely how a look erodes.
    const code = stripComments(readSource(GLASS_PANEL));
    const layers: Record<string, string> = {
      body: 'colors={material.body}',
      sheen: 'colors={material.sheen}',
      bevel: 'borderTopColor: material.bevelTop',
      rim: 'borderTopColor: material.edgeLit',
      halo: 'borderColor: material.halo',
    };
    for (const [layer, marker] of Object.entries(layers)) {
      expect({ layer, painted: code.includes(marker) }).toEqual({
        layer,
        painted: true,
      });
    }
    // The bevel is inset inside the rim, and the halo outside the body: three rings that have to
    // stay on their own radii or the thickness reads as a seam.
    expect(code).toContain('bodyRadius = radius - EDGE_PX');
    expect(code).toContain('bevelRadius = radius - 2 * EDGE_PX');
  });

  it('keeps the lit corner actually lit, and the dim one actually visible', () => {
    // The wiring above would still pass if the two tokens were swapped in the material, or if
    // both were made near-invisible — the panel would lose its reflection and nothing else.
    for (const name of ['dark', 'light'] as const) {
      const material = GLASS_MATERIALS[name];
      expect(alphaOf(material.edgeLit)).toBeGreaterThan(
        alphaOf(material.edgeDim),
      );
      // Not fully transparent: the panel also has to hold an outline over the darkest map tiles.
      expect(alphaOf(material.edgeDim)).toBeGreaterThan(0);
      // And the body is translucent but not a window — the text on it stays readable either way.
      // Read from the *darkest* stop, which is the least legibility the panel ever offers.
      const darkest = material.body.reduce((lowest, stop) =>
        alphaOf(stop) < alphaOf(lowest) ? stop : lowest,
      );
      expect(alphaOf(darkest)).toBeGreaterThan(0.5);
    }
  });

  it('fits the highlight to the caller radius instead of a fixed one', () => {
    // A rim rounding its corners by a different amount than the body it outlines reads as two
    // plates sliding against each other.
    const source = readSource(GLASS_PANEL);
    const rim = source.slice(source.indexOf('styles.ring'));
    expect(rim).toContain('borderRadius: bodyRadius');
    // The halo owns the outer radius; the body and bevel are inset by a pixel each.
    expect(source).toContain(
      'borderRadius: radius, borderColor: material.halo',
    );
    expect(source).not.toMatch(/borderRadius:\s*\d+/);
  });

  it('builds both materials out of exactly the same layers', () => {
    // Switching is one line, and it can only stay one line while the two describe the same
    // material. A key added to one and forgotten in the other does not fail to compile —
    // `GLASS_MATERIALS[name]` is a union, so the missing field would surface as `undefined`
    // inside styles, i.e. as a panel that renders slightly wrong on one of the two settings.
    expect(sortedKeys(GLASS_MATERIALS.light)).toEqual(
      sortedKeys(GLASS_MATERIALS.dark),
    );
    expect(sortedKeys(GLASS_MATERIALS.light.shadow)).toEqual(
      sortedKeys(GLASS_MATERIALS.dark.shadow),
    );
  });

  it('never blurs, because the backdrop is a map that never stops moving', () => {
    // `expo-blur` would re-capture its backdrop every frame the driver moves — and on Android it
    // would not even blur: `BlurView` defaults to `BlurMethod.NONE`, which paints a flat tint.
    // The look is built from static layers instead, so this is a performance decision that has to
    // survive review, not an untried option.
    for (const file of [GLASS_PANEL, ...GLASS_CONSUMERS]) {
      const code = stripComments(readSource(file));
      expect(code).not.toContain('expo-blur');
      expect(code).not.toContain('BlurView');
    }
  });

  it('is the single source of the look, reused by every overlay above the map', () => {
    for (const file of GLASS_CONSUMERS) {
      expect(readSource(file)).toContain("from './GlassPanel'");
      expect(readSource(file)).toContain('<GlassPanel');
    }
  });

  it('leaves the swipe controls alone', () => {
    // An explicit product constraint: the accept / decline gestures are muscle memory and must
    // not be restyled. Pinned so a later "apply glass everywhere" pass fails here first.
    expect(readSource(NEON_SWIPE_BUTTON)).not.toContain('GlassPanel');
  });
});

describe('the accent each stage of the trip is drawn in', () => {
  it('matches the colour of the map marker it names', () => {
    // The instruction and the pin it points at must agree at a glance: a blue bar naming the
    // blue departure marker, a green one naming the green arrival flag.
    expect(tripGuidanceAccent('to_pickup').color).toBe(MAP_PALETTE.departure);
    expect(tripGuidanceAccent('to_dropoff').color).toBe(MAP_PALETTE.arrival);
    // Waiting is the one stage with no marker to drive to, so it takes the warning amber.
    expect(tripGuidanceAccent('at_pickup').color).toBe(theme.colors.warning);
    expect(tripGuidanceAccent('at_pickup').color).not.toBe(
      tripGuidanceAccent('to_pickup').color,
    );
  });

  it('gives each stage its own glyph, so the bar is readable without being read', () => {
    const icons = [
      tripGuidanceAccent('to_pickup').icon,
      tripGuidanceAccent('at_pickup').icon,
      tripGuidanceAccent('to_dropoff').icon,
    ];
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe('the glass tokens live in the theme, not in the components', () => {
  it('declares the materials once', () => {
    // A second copy of these colours in a component is how the overlays drift apart.
    const themeSource = readSource(THEME);
    expect(themeSource).toContain('export const GLASS_MATERIALS');
  });

  it('leaves no colour of its own in the overlays, so the two materials are comparable', () => {
    // This is the condition the whole comparison rests on. A single `#fff` in a component would
    // be invisible on the light material, and the driver would be judging a broken panel rather
    // than a design — while the two materials were switched by a line in the theme.
    for (const consumer of GLASS_CONSUMERS) {
      const code = stripComments(readSource(consumer));
      expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code).not.toMatch(/rgba?\(/);
      // And they read their tints from the material rather than the theme's fixed palette.
      expect(code).toContain('material.text');
    }
  });

  it('tints the icon chips from the material, since one alpha cannot suit both bodies', () => {
    // The alpha that reads as a tint on charcoal washes out on a pale body, so it belongs to the
    // material rather than to the accent helper.
    for (const consumer of [GUIDANCE_BAR, MANEUVER_HUD]) {
      const code = stripComments(readSource(consumer));
      expect(code).toContain('material.chipTintAlpha');
    }
    expect(GLASS_MATERIALS.light.chipTintAlpha).not.toBe(
      GLASS_MATERIALS.dark.chipTintAlpha,
    );
  });
});
