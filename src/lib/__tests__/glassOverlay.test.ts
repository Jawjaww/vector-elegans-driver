// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import { GLASS_OVERLAY, theme } from '../theme';
import { MAP_PALETTE } from '../mapPalette';
import { tripGuidanceAccent } from '../utils/tripGuidance';

/**
 * The panels drawn over the live map.
 *
 * The look these pin is a *decision*, not a taste: which two corners catch the light, and the
 * absence of a backdrop blur over a map that never holds still. Both are invisible in a render
 * test and both would be silently reversed by a plausible-looking edit, so they are pinned here
 * by reading the source and the palette.
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

describe('the glass panel the map overlays are drawn on', () => {
  it('lights two opposite corners and dims the other two', () => {
    const source = readSource(GLASS_PANEL);
    // Pairing asserted per side rather than as a set: the effect *is* the opposition, and four
    // sides carrying "some colour" would render as a flat box with a uniform border.
    expect(source).toMatch(/borderTopColor:\s*GLASS_OVERLAY\.edgeLit/);
    expect(source).toMatch(/borderLeftColor:\s*GLASS_OVERLAY\.edgeLit/);
    expect(source).toMatch(/borderBottomColor:\s*GLASS_OVERLAY\.edgeDim/);
    expect(source).toMatch(/borderRightColor:\s*GLASS_OVERLAY\.edgeDim/);
  });

  it('keeps the lit corner actually lit, and the dim one actually visible', () => {
    // The wiring above would still pass if the two tokens were swapped in the palette, or if
    // both were made near-invisible — the panel would lose its reflection and nothing else.
    const lit = alphaOf(GLASS_OVERLAY.edgeLit);
    const dim = alphaOf(GLASS_OVERLAY.edgeDim);
    expect(lit).toBeGreaterThan(dim);
    // Not fully transparent: the panel also has to hold an outline over the darkest map tiles.
    expect(dim).toBeGreaterThan(0);
    // And the body is translucent but not a window — the text on it stays readable either way.
    expect(alphaOf(GLASS_OVERLAY.body)).toBeGreaterThan(0.5);
  });

  it('fits the highlight to the caller radius instead of a fixed one', () => {
    // A rim rounding its corners by a different amount than the body it outlines reads as two
    // plates sliding against each other.
    const source = readSource(GLASS_PANEL);
    const rim = source.slice(source.indexOf('styles.rim'));
    expect(rim).toContain('borderRadius: radius');
    expect(source).not.toMatch(/borderRadius:\s*\d+/);
  });

  it('never blurs, because the backdrop is a map that never stops moving', () => {
    // `expo-blur` would re-capture its backdrop every frame the driver moves. The look is built
    // from one static gradient and one static rim instead, so this is a performance decision
    // that has to survive review, not an untried option.
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
  it('declares the palette once', () => {
    // A second copy of these colours in a component is how the overlays drift apart.
    const themeSource = readSource(THEME);
    expect(themeSource).toContain('export const GLASS_OVERLAY');
    for (const consumer of GLASS_CONSUMERS) {
      const code = stripComments(readSource(consumer));
      expect(code).not.toMatch(/rgba\(20,\s*20,\s*22/);
    }
  });
});
