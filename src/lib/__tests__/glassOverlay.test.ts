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
  OVERLAY_CARD_RADIUS,
  TRIP_GUIDANCE_BAR_HEIGHT,
} from '../utils/overlayLane';

/**
 * The panels drawn over the live map.
 *
 * The look these pin is a *decision*, not a taste: that the face is a pale neutral frost rather
 * than a dark slab or a tinted one, that the map is allowed to cross it, that the type and the
 * outline are dark because the face is light, and that the recenter control no longer lands on
 * top of the sentence the driver is reading. None of it shows up in a render test and all of it
 * would be silently reversed by a plausible-looking edit.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const GLASS_PANEL = 'src/components/GlassPanel.tsx';
const MAP_TEMPLATE = 'src/map/mapHtmlTemplate.ts';
const THEME = 'src/lib/theme.ts';
const GUIDANCE_BAR = 'src/components/TripGuidanceBar.tsx';
const ARRIVAL_HUD = 'src/components/TripArrivalHud.tsx';
const MANEUVER_HUD = 'src/components/TripManeuverHud.tsx';
const RECENTER_BUTTON = 'src/components/MapRecenterButton.tsx';
const DASHBOARD = 'app/(tabs)/index.tsx';
const NEON_SWIPE_BUTTON = 'src/components/NeonSwipeButton.tsx';
const DELETED_PREFERENCE_MODULE = 'src/lib/glass/glassMaterialPreference.ts';
/** The dark material's panel, retired in favour of one shared primitive. */
const DELETED_GLASS_CARD = 'src/components/GlassCard.tsx';

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
 * A translucent layer as the driver actually sees it, composited over the map.
 *
 * The raw channel values say nothing on their own: the whole point of a translucent face is that
 * its weight depends on the alpha, and a veil that reads as a pale frost at 0.6 reads as a
 * painted slab at 0.95. Every lightness assertion below goes through this.
 */
function overMap(css: string): number {
  const colour = rgbOf(css);
  const composited = (channel: 'r' | 'g' | 'b') =>
    colour[channel] * colour.a + MAP_TILE[channel] * (1 - colour.a);
  return composited('r') + composited('g') + composited('b');
}

/** Sum of the three channels: the quick proxy for "how light is this". */
const lightness = (css: string): number => {
  const colour = rgbOf(css);
  return colour.r + colour.g + colour.b;
};

/** Explicit comparator: Sonar S2871, and the key order is irrelevant to the comparison anyway. */
const sortedKeys = (value: object): string[] =>
  Object.keys(value).sort((a, b) => a.localeCompare(b));

describe('the edge of a panel', () => {
  it('draws a hairline frost, not a beveled plate', () => {
    const code = stripComments(readSource(GLASS_PANEL));
    expect(code).toContain('material.hairline');
    expect(code).toContain('borderWidth: StyleSheet.hairlineWidth');
    expect(code).not.toContain('cornerGlowTop');
    expect(code).not.toContain('rimLight');
    expect(code).toContain('GLASS_PANEL_BEVEL_PX = 0');
    const edge = rgbOf(GLASS_MATERIAL.hairline);
    expect(edge.r).toBe(255);
    expect(edge.a).toBeGreaterThan(0.3);
    expect(edge.a).toBeLessThan(0.8);
    expect(GLASS_MATERIAL.shadow.opacity).toBeLessThanOrEqual(0.22);
  });
});

describe('the face of a panel', () => {
  it('frost the face with a neutral white veil, not a grey bossed plate', () => {
    for (const stop of [GLASS_MATERIAL.fillTop, GLASS_MATERIAL.fillBottom]) {
      const colour = rgbOf(stop);
      expect(colour.a).toBeGreaterThanOrEqual(0.22);
      expect(colour.a).toBeLessThanOrEqual(0.5);
      expect(colour.r).toBe(255);
      expect(colour.g).toBe(255);
      expect(colour.b).toBe(255);
      expect(overMap(stop)).toBeGreaterThan(680);
    }
    const top = rgbOf(GLASS_MATERIAL.fillTop);
    const bottom = rgbOf(GLASS_MATERIAL.fillBottom);
    expect(top.a).toBeGreaterThan(bottom.a);
    const panel = stripComments(readSource(GLASS_PANEL));
    const map = stripComments(readSource(MAP_TEMPLATE));
    expect(panel).toContain('elevation: 0');
    expect(panel).not.toContain('LinearGradient');
    expect(map).toContain('GLASS_MATERIAL.fillTop');
    expect(map).toContain('GLASS_MATERIAL.fillBottom');
  });

  it('has no highlight band, because a band over a short bar lands on the type', () => {
    const material = GLASS_MATERIAL as unknown as Record<string, unknown>;
    expect(material.sheen).toBeUndefined();
    expect(material.body).toBeUndefined();
    expect(material.edgeGlow).toBeUndefined();
    expect(stripComments(readSource(GLASS_PANEL))).not.toContain('locations=');
  });

  it('spends its type on dark greys, because the face inverted', () => {
    // The type was light because the face was dark. Both moved; a light grey on this face would
    // be the same mistake in the opposite direction, and just as unreadable.
    expect(lightness(GLASS_MATERIAL.text)).toBeLessThan(200);
    const text = lightness(GLASS_MATERIAL.text);
    const dim = lightness(GLASS_MATERIAL.textDim);
    expect(dim).toBeGreaterThan(text);
    // But the supporting line is still a line the driver has to read, not a whisper.
    expect(dim).toBeGreaterThan(200);
    expect(dim).toBeLessThan(500);
    for (const css of [GLASS_MATERIAL.text, GLASS_MATERIAL.textDim]) {
      const colour = rgbOf(css);
      expect(colour.a).toBe(1);
    }
  });

  it('takes the Vector Elegans blue as its accent, and the map agrees', () => {
    expect(GLASS_MATERIAL.accent).toBe(VE_BLUE.base);
    expect(GLASS_MATERIAL.accent).toBe(MAP_PALETTE.departure);
    expect(tripGuidanceAccent('to_pickup').color).toBe(GLASS_MATERIAL.accent);
    // The next-turn HUD is what carries it, and it must not fall back to the theme's emerald:
    // blue is what the route itself is drawn in, so the instruction and its line agree.
    const hud = stripComments(readSource(MANEUVER_HUD));
    expect(hud).toContain('material.accent');
    expect(hud).not.toContain('colors.accent');
  });

  it('draws its glyphs in a deeper accent step, never the accent itself', () => {
    // The same inversion as the type and the rim, applied to the one colour that has to stay the
    // accent: a glyph has to come *down* in value on a pale face, not up. Blue-500 on a pale pane
    // sits under 3:1, which is a glyph the driver has to hunt for.
    expect(GLASS_MATERIAL.accentStrong).not.toBe(GLASS_MATERIAL.accent);
    expect(lightness(GLASS_MATERIAL.accentStrong)).toBeLessThan(
      lightness(GLASS_MATERIAL.accent),
    );
    for (const file of [MANEUVER_HUD, RECENTER_BUTTON]) {
      const code = stripComments(readSource(file));
      // Either spelling of the binding is fine; what is pinned is that the glyph asks for the
      // deeper step and that the retired lighter one is gone.
      expect(code).toMatch(/(GLASS_MATERIAL|material)\.accentStrong/);
      expect(code).not.toContain('accentLight');
    }
  });

  it('draws a bare glyph, the way the reservation badge does', () => {
    // The badge is an icon and a line of type inside a pill. A tinted square behind the icon is
    // a second panel, which is what these overlays used to be.
    expect(GLASS_MATERIAL.chipTintAlpha).toMatch(/^[0-9a-f]{2}$/);
    for (const consumer of [GUIDANCE_BAR, MANEUVER_HUD, ARRIVAL_HUD]) {
      const code = stripComments(readSource(consumer));
      expect(code).toContain('OVERLAY_CARD_RADIUS');
      expect(code).not.toMatch(/\b999\b/);
      expect(code).toContain('paddingHorizontal: 16');
      expect(code).not.toContain('chipTintAlpha');
    }
    expect(OVERLAY_CARD_RADIUS).toBeLessThan(40);
  });
});

describe('one material, and the theme owns it', () => {
  it('declares a single material, with no switch left behind', () => {
    // The pair existed to make a choice on a device; the choice is made, so a second entry would
    // now be a look nobody reviewed. Pinned by absence, and the modules that served the switch
    // and the retired dark panel are pinned as gone as well.
    const themeSource = readSource(THEME);
    expect(themeSource).toContain('export const GLASS_MATERIAL: GlassMaterial');
    expect(themeSource).not.toContain('GLASS_MATERIALS');
    expect(themeSource).not.toContain('DEFAULT_GLASS_MATERIAL');
    expect(() => readSource(DELETED_PREFERENCE_MODULE)).toThrow();
    expect(() => readSource(DELETED_GLASS_CARD)).toThrow();
  });

  it('keeps the white wash over the blur, not a second plate', () => {
    const map = stripComments(readSource(MAP_TEMPLATE));
    const panel = stripComments(readSource(GLASS_PANEL));
    expect(map).toContain('GLASS_MATERIAL.fillTop');
    expect(map).toContain('GLASS_MATERIAL.fillBottom');
    expect(map).toContain('FROST_VEIL');
    expect(panel).not.toContain('BlurView');
    expect(panel).toContain("backgroundColor: 'transparent'");
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
    // as long as the consumers were changed in the same breath, which is the point.
    expect(sortedKeys(GLASS_MATERIAL)).toEqual(
      [
        'accent',
        'accentStrong',
        'backdropBlurPx',
        'chipTintAlpha',
        'fillBottom',
        'fillTop',
        'hairline',
        'shadow',
        'text',
        'textDim',
      ].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('blurs the map under the card, not a native plate over the WebView', () => {
    const panel = stripComments(readSource(GLASS_PANEL));
    const map = stripComments(readSource(MAP_TEMPLATE));
    expect(panel).toContain('measureLayout');
    expect(panel).toContain('publishFrostRect');
    expect(panel).not.toContain('expo-blur');
    expect(panel).not.toContain('dimezisBlurView');
    expect(map).toContain('paintFrost');
    expect(map).toContain('drawImage');
    expect(map).toContain('GLASS_MATERIAL.backdropBlurPx');
    expect(GLASS_MATERIAL.backdropBlurPx).toBeGreaterThanOrEqual(10);
    expect(GLASS_MATERIAL.backdropBlurPx).toBeLessThanOrEqual(18);
    for (const file of GLASS_CONSUMERS) {
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
      TRIP_GUIDANCE_BAR_HEIGHT +
        OVERLAY_STACK_GAP +
        (LANE_BASE_OFFSET - CONTROL_BASE_OFFSET),
    );
  });

  it('raises the recenter control clear of the instruction, by the shared figure', () => {
    // The regression this exists for: the control sits in the same strip as the bar and takes
    // touches, so at rest it is painted straight across the sentence. These four numbers are the
    // whole geometry; if the lift ever drops out, the last assertion is what notices.
    expect(LANE_BASE_OFFSET).toBeGreaterThanOrEqual(24);
    const barTop = LANE_BASE_OFFSET + TRIP_GUIDANCE_BAR_HEIGHT;
    const atRestTop = CONTROL_BASE_OFFSET + MAP_CONTROL_SIZE;
    const liftedBottom = CONTROL_BASE_OFFSET + LIFT_OVER_INSTRUCTION;
    expect(CONTROL_BASE_OFFSET).toBeLessThan(barTop);
    expect(atRestTop).toBeGreaterThan(LANE_BASE_OFFSET);
    expect(liftedBottom).toBeGreaterThanOrEqual(barTop);

    // And both controls in the lane move on that one figure rather than each carrying its own.
    // Lift is layout `bottom`, not `translateY`, so map frost and the hairline stay aligned.
    for (const file of [ARRIVAL_HUD, RECENTER_BUTTON]) {
      const source = stripComments(readSource(file));
      expect(source).toContain('LIFT_OVER_INSTRUCTION');
      expect(source).toMatch(
        /outputRange:\s*\[[^\]]+,\s*[^\]]+\+\s*LIFT_OVER_INSTRUCTION\]/,
      );
      expect(source).not.toContain('translateY');
    }
    const guidance = stripComments(readSource(GUIDANCE_BAR));
    expect(guidance).not.toContain('translateY');
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
    expect(source).toContain('GLASS_MATERIAL.accentStrong');
  });
});

describe('what the instruction bar says', () => {
  it('says the instruction, alone, and never cuts it', () => {
    // Two complaints on one row. The address was a second thing to read on a bar whose whole job
    // is one glance, and the sentence that shared the row with it was cut mid-word on the longest
    // locale. The bar now draws the title only, and the freed row is what pays for two lines —
    // `numberOfLines={1}` must not come back, because an ellipsis in an instruction reads as a
    // place the driver is not being told about.
    const code = stripComments(readSource(GUIDANCE_BAR));
    expect(code.match(/<Text\b/g) ?? []).toHaveLength(1);
    expect(code).toContain('tripGuidanceTitleKey(stage)');
    expect(code).toContain('numberOfLines={2}');
    expect(code).not.toContain('numberOfLines={1}');

    // And the address is no longer handed in, so a re-added line would have nothing to render.
    const dashboard = stripComments(readSource(DASHBOARD));
    const bar = dashboard.slice(dashboard.indexOf('<TripGuidanceBar'));
    expect(bar.slice(0, bar.indexOf('/>'))).not.toContain('Address');
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

  it('gives each stage a deeper ink for the glyph it draws', () => {
    // The marker colour is right for a marker and too light for a glyph on a pale pane. Every
    // stage carries the step down, which is why the bar reads at a glance in all three.
    for (const stage of ['to_pickup', 'at_pickup', 'to_dropoff'] as const) {
      const { color, ink } = tripGuidanceAccent(stage);
      expect(ink).not.toBe(color);
      expect(lightness(ink)).toBeLessThan(lightness(color));
    }
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
