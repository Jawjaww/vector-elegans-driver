// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import { GLASS_MATERIAL, VE_BLUE, theme } from '../theme';
import { MAP_PALETTE } from '../mapPalette';
import { tripGuidanceAccent } from '../utils/tripGuidance';
import {
  CONTROL_BASE_OFFSET,
  LANE_BASE_OFFSET,
  LIFT_OVER_INSTRUCTION,
  MAP_CONTROL_SIZE,
  OVERLAY_STACK_GAP,
  TRIP_GUIDANCE_BAR_HEIGHT,
} from '../utils/overlayLane';

/**
 * The panels drawn over the live map.
 *
 * The look these pin is a *decision*, not a taste: that the edge light leaves one corner and
 * fades, that the face is a slate blue rather than charcoal, that the type is grey rather than
 * white, that the recenter control no longer lands on top of the sentence the driver is reading.
 * None of it shows up in a render test and all of it would be silently reversed by a
 * plausible-looking edit.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const GLASS_PANEL = 'src/components/GlassPanel.tsx';
const THEME = 'src/lib/theme.ts';
const GUIDANCE_BAR = 'src/components/TripGuidanceBar.tsx';
const ARRIVAL_HUD = 'src/components/TripArrivalHud.tsx';
const MANEUVER_HUD = 'src/components/TripManeuverHud.tsx';
const RECENTER_BUTTON = 'src/components/MapRecenterButton.tsx';
const DASHBOARD = 'app/(tabs)/index.tsx';
const NEON_SWIPE_BUTTON = 'src/components/NeonSwipeButton.tsx';
const DELETED_PREFERENCE_MODULE = 'src/lib/glass/glassMaterialPreference.ts';

/** Every overlay drawn on the panel, i.e. every surface that has to look like the same material. */
const GLASS_CONSUMERS = [
  GUIDANCE_BAR,
  ARRIVAL_HUD,
  MANEUVER_HUD,
  RECENTER_BUTTON,
];

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

type Rgb = { r: number; g: number; b: number; a: number };

/** A colour as written in the theme: `#rrggbb` or `rgb()` / `rgba()`. */
function rgbOf(css: string): Rgb {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(css);
  if (hex) {
    const packed = parseInt(hex[1], 16);
    return {
      r: (packed >> 16) & 255,
      g: (packed >> 8) & 255,
      b: packed & 255,
      a: 1,
    };
  }
  const match = /rgba?\(([^)]*)\)/.exec(css);
  if (!match) throw new Error(`not a colour: ${css}`);
  const parts = match[1].split(',').map((part) => Number(part.trim()));
  return {
    r: parts[0],
    g: parts[1],
    b: parts[2],
    a: parts.length < 4 ? 1 : parts[3],
  };
}

/** The pale map tiles the overlays float over, as the backdrop every judgement is made against. */
const MAP_TILE: Rgb = { r: 232, g: 238, b: 244, a: 1 };

/**
 * A translucent stop as the driver actually sees it, composited over the map.
 *
 * The raw channel values say nothing on their own: the whole point of a translucent face is that
 * its weight depends on the alpha, and a body that reads as slate at 0.92 reads as a grey smudge
 * at 0.5. Every lightness assertion below goes through this.
 */
function overMap(css: string): number {
  const colour = rgbOf(css);
  const composited = (channel: 'r' | 'g' | 'b') =>
    colour[channel] * colour.a + MAP_TILE[channel] * (1 - colour.a);
  return composited('r') + composited('g') + composited('b');
}

/** Explicit comparator: Sonar S2871, and the key order is irrelevant to the comparison anyway. */
const sortedKeys = (value: object): string[] =>
  Object.keys(value).sort((a, b) => a.localeCompare(b));

describe('the light on the edge of a panel', () => {
  it('draws two glows from one corner instead of lighting four sides', () => {
    // Two thin bars leaving the top-left and fading out say "the light comes from up and to the
    // left". Four lit corners say "bevelled box", which is what the first attempt looked like.
    const code = stripComments(readSource(GLASS_PANEL));
    const painted = code.match(/colors=\{EDGE_COLORS\}/g) ?? [];
    expect(painted).toHaveLength(2);
    expect(code).toContain('styles.edgeTop');
    expect(code).toContain('styles.edgeLeft');
    expect(code).not.toContain('edgeBottom');
    expect(code).not.toContain('edgeRight');
    // The retired corner treatment, named so it cannot come back unnoticed.
    expect(code).not.toContain('edgeLit');
    expect(code).not.toContain('edgeDim');
  });

  it('runs one bar along the top edge and the other down the left', () => {
    // Direction is the effect. A bar anchored to the wrong pair of sides is the same colour in
    // the same place and would render the light coming from the bottom-right.
    const source = readSource(GLASS_PANEL);
    expect(source).toMatch(/edgeTop:\s*\{[\s\S]*?top:\s*0[\s\S]*?right:\s*0/);
    expect(source).toMatch(/edgeLeft:\s*\{[\s\S]*?left:\s*0[\s\S]*?bottom:\s*0/);
  });

  it('keeps each glow a hairline that dies well before the far edge', () => {
    // Thickness and fade are what separate a reflection from a border.
    expect(GLASS_MATERIAL.edgeThickness).toBeLessThanOrEqual(2);
    expect(GLASS_MATERIAL.edgeFade).toBeLessThan(0.5);
    const code = stripComments(readSource(GLASS_PANEL));
    // Read from the material rather than hard-coded, so widening the bar is a theme change and
    // not an edit that quietly bypasses this test.
    expect(code).toContain('height: GLASS_MATERIAL.edgeThickness');
    expect(code).toContain('width: GLASS_MATERIAL.edgeThickness');
    expect(code).toContain('locations={EDGE_LOCATIONS}');
  });

  it('tints the rim and the glow blue, in the family the portal already uses', () => {
    const glow = rgbOf(GLASS_MATERIAL.edgeGlow);
    const rim = rgbOf(GLASS_MATERIAL.rim);
    // Cool, both of them: blue above red is the whole difference between a highlight and a scuff.
    expect(glow.b).toBeGreaterThan(glow.r);
    expect(rim.b).toBeGreaterThan(rim.r);
    // And the rim stays a hairline. A saturated outline is what made the first version look like
    // an older toolkit rather than like glass.
    expect(rim.a).toBeLessThan(0.3);
    expect(GLASS_MATERIAL.rim).toBe(VE_BLUE.rim);
    // Shade in slate rather than black, so the panel sits in the blue family even in its shadow.
    const shadow = rgbOf(GLASS_MATERIAL.shadow.color);
    expect(shadow.b).toBeGreaterThan(shadow.r);
  });
});

describe('the face of a panel', () => {
  it('is lighter than the charcoal it replaced, without going pale', () => {
    // Both halves of this are the fix for a real complaint: the near-black face read as a hole
    // cut in the map, and a pale face over pale tiles would read as a white card. Read composited
    // over the map, because that is where the judgement was made.
    const stops = GLASS_MATERIAL.body.map(overMap);
    const lightest = Math.max(...stops);
    const darkest = Math.min(...stops);
    expect(lightest).toBeGreaterThan(200);
    expect(darkest).toBeGreaterThan(100);
    expect(darkest).toBeLessThan(180);
    // Translucent, but not a window: the type on it has to stay readable at every stop.
    for (const stop of GLASS_MATERIAL.body) {
      expect(rgbOf(stop).a).toBeGreaterThan(0.5);
    }
  });

  it('carries a blue cast at every stop rather than a neutral grey', () => {
    // A neutral slate is a different look, and the difference is invisible in a screenshot until
    // it is pointed at. Each stop has to lean blue on its own.
    for (const stop of GLASS_MATERIAL.body) {
      const colour = rgbOf(stop);
      expect(colour.b - colour.r).toBeGreaterThanOrEqual(10);
    }
  });

  it('spends its type on two greys, never on white', () => {
    // Pure white on the face is what made the panel read as a retro dark card.
    expect(GLASS_MATERIAL.text).not.toBe('#ffffff');
    const text = rgbOf(GLASS_MATERIAL.text);
    const dim = rgbOf(GLASS_MATERIAL.textDim);
    expect(text.r + text.g + text.b).toBeLessThan(720);
    expect(dim.r + dim.g + dim.b).toBeLessThan(text.r + text.g + text.b);
    // But the supporting line is still a line the driver has to read.
    expect(dim.r + dim.g + dim.b).toBeGreaterThan(350);
  });

  it('takes the Vector Elegans blue as its accent, and the map agrees', () => {
    expect(GLASS_MATERIAL.accent).toBe(VE_BLUE.base);
    expect(GLASS_MATERIAL.accent).toBe(MAP_PALETTE.departure);
    expect(tripGuidanceAccent('to_pickup').color).toBe(GLASS_MATERIAL.accent);
    expect(GLASS_MATERIAL.accentLight).not.toBe(GLASS_MATERIAL.accent);
    // The next-turn HUD is what carries it, and it must not fall back to the theme's emerald:
    // blue is what the route itself is drawn in, so the instruction and its line agree.
    const hud = stripComments(readSource(MANEUVER_HUD));
    expect(hud).toContain('material.accent');
    expect(hud).not.toContain('colors.accent');
  });

  it('tints its chips from the panel accent, as a valid eight-digit colour', () => {
    // The tint is assembled as `${accent}${chipTintAlpha}`, so a stray character here would not
    // fail to compile — it would render transparent.
    expect(GLASS_MATERIAL.chipTintAlpha).toBe(VE_BLUE.tintAlpha);
    expect(GLASS_MATERIAL.chipTintAlpha).toMatch(/^[0-9a-f]{2}$/);
    for (const consumer of [GUIDANCE_BAR, MANEUVER_HUD]) {
      expect(stripComments(readSource(consumer))).toContain(
        'material.chipTintAlpha',
      );
    }
  });
});

describe('one material, and the theme owns it', () => {
  it('declares a single material, with no switch left behind', () => {
    // The pair existed to make a choice on a device; the choice is made, so a second entry would
    // now be a look nobody reviewed. Pinned by absence, and the module that served the switch is
    // pinned as gone as well.
    const themeSource = readSource(THEME);
    expect(themeSource).toContain('export const GLASS_MATERIAL: GlassMaterial');
    expect(themeSource).not.toContain('GLASS_MATERIALS');
    expect(themeSource).not.toContain('DEFAULT_GLASS_MATERIAL');
    expect(() => readSource(DELETED_PREFERENCE_MODULE)).toThrow();
  });

  it('lays out the material in the documented layer order', () => {
    // The order is load-bearing: the glows are light *landing on* the body, so they go over it,
    // and the children go last so no layer can cover them. Reordering silently flattens the
    // reflection into a wash.
    const code = stripComments(readSource(GLASS_PANEL));
    const body = code.indexOf('colors={material.body}');
    const sheen = code.indexOf('colors={material.sheen}');
    const topGlow = code.indexOf('styles.edgeTop');
    const children = code.indexOf('{children}');
    expect(body).toBeGreaterThan(-1);
    expect(sheen).toBeGreaterThan(body);
    expect(topGlow).toBeGreaterThan(sheen);
    expect(children).toBeGreaterThan(topGlow);
  });

  it('fits every layer to the radius it was handed', () => {
    // A highlight rounding its corners by a different amount than the body it outlines reads as
    // two plates sliding against each other.
    const source = readSource(GLASS_PANEL);
    expect(source).toContain('bodyRadius = radius - EDGE_PX');
    expect(source).toContain('borderRadius: radius, borderColor: material.rim');
    expect(source).toContain('borderColor: material.rim');
    // Nothing in this component invents a radius of its own.
    expect(source).not.toMatch(/borderRadius:\s*\d/);
  });

  it('is the single source of the look, reused by every overlay above the map', () => {
    for (const file of GLASS_CONSUMERS) {
      const source = readSource(file);
      expect(source).toContain("from './GlassPanel'");
      expect(source).toContain('<GlassPanel');
      // And each one reads the same material, from the theme rather than a hook or a store —
      // that indirection is what the switch needed and what made two looks possible.
      expect(source).toContain('GLASS_MATERIAL');
      expect(source).not.toContain('glassMaterialPreference');
    }
  });

  it('leaves no colour of its own in the overlays', () => {
    // A literal `#fff` in a component would sit off-material the moment the face is retuned, and
    // would be invisible in review because it renders "fine" on the current face.
    for (const consumer of GLASS_CONSUMERS) {
      const code = stripComments(readSource(consumer));
      expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code).not.toMatch(/rgba?\(/);
      // Bound to the material either way it is spelled: the three overlays destructure it, the
      // recenter control reads it field by field.
      expect(code).toMatch(/GLASS_MATERIAL|material\./);
    }
  });

  it('spells out the layer fields it depends on', () => {
    // A guard on the material's own shape: dropping a field the panel reads would compile only
    // as a long as the consumers were changed in the same breath, which is the point.
    expect(sortedKeys(GLASS_MATERIAL)).toEqual(
      [
        'accent',
        'accentLight',
        'body',
        'bodyBase',
        'bodyEnd',
        'bodyStart',
        'chipTintAlpha',
        'edgeFade',
        'edgeGlow',
        'edgeThickness',
        'rim',
        'shadow',
        'sheen',
        'sheenEnd',
        'sheenLocations',
        'sheenStart',
        'text',
        'textDim',
      ].sort((a, b) => a.localeCompare(b)),
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

  it('leaves the swipe controls alone', () => {
    // An explicit product constraint: the accept / decline gestures are muscle memory and must
    // not be restyled. Pinned so a later "apply glass everywhere" pass fails here first.
    expect(readSource(NEON_SWIPE_BUTTON)).not.toContain('GlassPanel');
  });
});

describe('the lane above the sheet', () => {
  it('derives the lift from the bar it has to clear', () => {
    expect(LIFT_OVER_INSTRUCTION).toBe(
      TRIP_GUIDANCE_BAR_HEIGHT + OVERLAY_STACK_GAP,
    );
  });

  it('raises the recenter control clear of the instruction, by the shared figure', () => {
    // The regression this exists for: the control sits in the same strip as the bar and takes
    // touches, so at rest it is painted straight across the sentence. These four numbers are the
    // whole geometry; if the lift ever drops out, the last assertion is what notices.
    const barTop = LANE_BASE_OFFSET + TRIP_GUIDANCE_BAR_HEIGHT;
    const atRest = CONTROL_BASE_OFFSET + MAP_CONTROL_SIZE;
    const lifted =
      CONTROL_BASE_OFFSET + LIFT_OVER_INSTRUCTION + MAP_CONTROL_SIZE;
    expect(atRest).toBeLessThan(barTop);
    expect(lifted).toBeGreaterThanOrEqual(barTop);

    // And both controls in the lane move on that one figure rather than each carrying its own.
    for (const file of [ARRIVAL_HUD, RECENTER_BUTTON]) {
      const source = stripComments(readSource(file));
      expect(source).toContain('LIFT_OVER_INSTRUCTION');
      expect(source).toMatch(/outputRange:\s*\[0,\s*-LIFT_OVER_INSTRUCTION\]/);
    }
  });

  it('drives the lift from the same flag as the panel it clears', () => {
    // Two flags for one decision is how a control ends up hovering over an empty slot: the bar
    // retracts on its own and the control has to follow it down.
    const dashboard = stripComments(readSource(DASHBOARD));
    expect(dashboard).toContain('aboveGuidanceBar={guidanceVisible}');
    expect(dashboard).toMatch(
      /<TripGuidanceBar[\s\S]*?visible=\{guidanceVisible\}/,
    );
  });

  it('draws the control on the same material as everything else above the map', () => {
    const source = stripComments(readSource(RECENTER_BUTTON));
    expect(source).toContain('aboveGuidanceBar');
    // The white disc with a dark teal glyph is gone; so is the opaque background and its border.
    expect(source).not.toContain('#fff');
    expect(source).not.toContain('backgroundColor');
    expect(source).toContain('GLASS_MATERIAL.accentLight');
  });
});

describe('the accent each stage of the trip is drawn in', () => {
  it('matches the colour of the map marker it names', () => {
    // The instruction and the pin it points at must agree at a glance: a blue bar naming the
    // blue departure marker, a green one naming the green arrival flag.
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
