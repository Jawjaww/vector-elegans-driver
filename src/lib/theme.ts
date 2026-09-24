export const theme = {
  colors: {
    // Primary accent (Emerald)
    accent: '#10b981',
    accentLight: '#34d399',
    accentDark: '#059669',
    
    // Neon colors
    neonGreen: '#05c46b',
    neonGreenLight: '#9efbd1',
    neonGreenBright: '#10ff8c',
    
    // Bordeaux (for alerts)
    bordeaux: '#7c2230',
    bordeauxIcon: '#a0303a',
    
    // Status colors
    success: '#05c46b',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
    
    // Dark theme — charcoal chrome (tabs, sheet, loader)
    background: '#161616',
    backgroundMid: '#1c1c1c',
    surface: 'rgba(255, 255, 255, 0.02)',
    surfaceMid: 'rgba(255, 255, 255, 0.06)',
    surfaceHeavy: 'rgba(255, 255, 255, 0.12)',
    
    // Text
    text: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    
    // Borders
    border: 'rgba(255, 255, 255, 0.06)',
    borderLight: 'rgba(255, 255, 255, 0.12)',
    
    // Glass
    glassAlpha: 0.06,
    glassBorder: 'rgba(255, 255, 255, 0.06)',
    glassShadow: '0 8px 24px rgba(0, 0, 0, 0.55)',
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  
  borderRadius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },
  
  shadows: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.3)',
    md: '0 6px 18px rgba(0, 0, 0, 0.45)',
    lg: '0 12px 36px rgba(0, 0, 0, 0.5)',
    xl: '0 18px 60px rgba(0, 0, 0, 0.65)',
    inner: 'inset 0 2px 14px rgba(255, 255, 255, 0.02)',
  },
  
  gradients: {
    surface: 'linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.01))',
    background: 'linear-gradient(180deg, #161616 0%, #1c1c1c 100%)',
    card: 'linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.008))',
    accent: 'linear-gradient(90deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.06))',
    inputLight: 'linear-gradient(90deg, rgba(16, 185, 129, 0.1), rgba(255, 255, 255, 0.2))',
    success: 'linear-gradient(90deg, rgba(5, 196, 107, 0.2), rgba(5, 196, 107, 0.1))',
  },
  
  animations: {
    fast: 150,
    normal: 200,
    slow: 300,
    spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
};

/** Shared charcoal wash for tabs, loader, and bottomsheet (expo-linear-gradient). */
export const APP_CHROME = {
  base: ['#161616', '#1c1c1c'] as const,
  veil: ['rgba(255,255,255,0.028)', 'rgba(255,255,255,0.07)'] as const,
  start: { x: 0.5, y: 0 } as const,
  end: { x: 0.5, y: 1 } as const,
  fallback: '#161616',
};

export const glassStyle = {
  backgroundColor: theme.colors.surface,
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.borderRadius.lg,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.45,
  shadowRadius: 24,
  elevation: 8,
};

export const glassModalStyle = {
  ...glassStyle,
  padding: theme.spacing.lg,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.5,
  shadowRadius: 36,
  elevation: 12,
};

/**
 * The complete description of the glass the panels above the live map are made of.
 *
 * Every field here is a *layer*, and the layers are what the look is: a flat fill reads as a
 * grey box, however nicely it is tinted. `GlassPanel` paints them in order and nothing animates,
 * so the whole material is a one-off paint rather than something paid on each frame the map
 * moves.
 *
 * **No backdrop blur, and this is the load-bearing decision.** `expo-blur` would have to
 * re-capture its backdrop, and the backdrop here is a map that never holds still — the blur
 * would be recomputed on every frame the driver moves, the single most expensive thing on this
 * screen. It is also not the sacrifice it sounds like: on Android `BlurView` defaults to
 * `BlurMethod.NONE`, which paints a flat tint instead of blurring at all. The glass is *built*
 * instead, which is why it can afford to be convincing.
 *
 * The layers, in the order they are painted:
 *
 * 1. **Body** — a diagonal gradient, not a flat colour. Three stops give the panel a mass that
 *    a single fill cannot: light corner, mid body, dark corner. The stops sit high in opacity
 *    because the panel is legible or it is useless, and a translucent panel over pale map tiles
 *    turns to mud long before it turns to glass.
 * 2. **Sheen** — concentrated at the top and gone by halfway down, because light arriving from
 *    above leaves a highlight on the near edge, not an even veil across the face.
 * 3. **Specular rim** — the bright top-left arc against a dimmed bottom-right one. This is what
 *    gives a flat panel a sense of thickness, and replacing it with a uniform border is what
 *    makes the same panel read as a box. Named for their role, not their position, so a call
 *    site cannot pair `top` with `bottom` and silently lose the effect.
 * 4. **Inner bevel** — a second, inset ring lit on the top edge and shaded on the bottom. The
 *    rim says the panel has an edge; the bevel says it has *thickness*.
 * 5. **Halo** — a faint outer ring, the refraction of the map's own light around the panel.
 *
 * `text` and `textDim` live here too, and that is deliberate: a light material cannot be
 * compared against a dark one while every call site hard-codes white.
 */
export type GlassMaterial = {
  /** Body gradient, diagonal. Three stops: lit corner, mid body, shaded corner. */
  body: readonly [string, string, string];
  bodyStart: { x: number; y: number };
  bodyEnd: { x: number; y: number };
  /**
   * Solid colour under the gradient, and the one Android derives its elevation outline from.
   *
   * The gradient is translucent by design, so without this the shadow would be cast by nothing
   * and `elevation` would have no outline to project.
   */
  bodyBase: string;
  /** Sheen over the body, from the top edge downward. Never a fill on its own. */
  sheen: readonly [string, string, string];
  /** Stops for `sheen`, matched to its length: highlight, fade, gone. */
  sheenLocations: readonly [number, number, number];
  sheenStart: { x: number; y: number };
  sheenEnd: { x: number; y: number };
  /** Lit rim — top-left and bottom-right, the two opposite arcs that carry the reflection. */
  edgeLit: string;
  /** Dimmed rim. Never fully transparent: the panel still needs an outline over dark tiles. */
  edgeDim: string;
  /** Inner bevel: the top edge catches light, the bottom edge falls away from it. */
  bevelTop: string;
  bevelBottom: string;
  /** Outer ring: refraction around the panel, not an outline. Kept very faint. */
  halo: string;
  /** Ambient shadow. Wide and weak rather than tight and dark, which is what glass casts. */
  shadow: { offsetY: number; radius: number; opacity: number };
  /** Primary type on the panel. */
  text: string;
  /** Supporting type: addresses, hints, the distance beside the clock. */
  textDim: string;
  /**
   * Alpha appended to an accent colour for the icon chips, as in `${accent}${chipTintAlpha}`.
   *
   * A tint of the accent rather than a flat grey chip, so the glyph carries the stage's colour
   * without a second colour entering the palette. It has to differ per material: the same alpha
   * that reads as a tint on charcoal washes out completely on a pale body.
   */
  chipTintAlpha: string;
};

/**
 * The two materials, side by side so they can be compared on a device.
 *
 * Both are *used* values — `useGlassMaterial` resolves to one of them, and the profile row lets
 * the driver switch — so neither is dead code while the choice is open. Once it is settled the
 * losing entry goes, and so does the row: the pair exists to make the comparison possible, not
 * to become a setting.
 */
export const GLASS_MATERIALS = {
  /**
   * Charcoal glass. Sits with the offer card, which is opaque `#141414` with the same diagonal
   * gradient — the two read as one material, which a translucent panel never did.
   */
  dark: {
    body: [
      'rgba(40, 40, 44, 0.90)',
      'rgba(20, 20, 23, 0.94)',
      'rgba(10, 10, 12, 0.96)',
    ],
    bodyStart: { x: 0.15, y: 0 },
    bodyEnd: { x: 0.85, y: 1 },
    bodyBase: '#121214',
    sheen: [
      'rgba(255, 255, 255, 0.14)',
      'rgba(255, 255, 255, 0.035)',
      'rgba(255, 255, 255, 0)',
    ],
    sheenLocations: [0, 0.22, 0.55],
    sheenStart: { x: 0.5, y: 0 },
    sheenEnd: { x: 0.5, y: 1 },
    edgeLit: 'rgba(255, 255, 255, 0.42)',
    edgeDim: 'rgba(255, 255, 255, 0.08)',
    bevelTop: 'rgba(255, 255, 255, 0.20)',
    bevelBottom: 'rgba(0, 0, 0, 0.35)',
    halo: 'rgba(255, 255, 255, 0.10)',
    shadow: { offsetY: 4, radius: 20, opacity: 0.24 },
    text: '#ffffff',
    textDim: 'rgba(255, 255, 255, 0.62)',
    chipTintAlpha: '2e',
  },
  /**
   * Frosted white glass, the closer reading of the reference.
   *
   * Its risk is stated rather than hidden: on pale map tiles a light panel with dark type needs
   * a *more* opaque body than the dark one, and the more opaque it gets the closer it comes to
   * the flat white card this is meant not to be. Whether it clears that bar is a question for a
   * real screen, which is why it ships as a switch and not as the default.
   */
  light: {
    body: [
      'rgba(252, 253, 255, 0.88)',
      'rgba(240, 243, 248, 0.92)',
      'rgba(228, 233, 241, 0.95)',
    ],
    bodyStart: { x: 0.15, y: 0 },
    bodyEnd: { x: 0.85, y: 1 },
    bodyBase: '#eef2f7',
    sheen: [
      'rgba(255, 255, 255, 0.70)',
      'rgba(255, 255, 255, 0.18)',
      'rgba(255, 255, 255, 0)',
    ],
    sheenLocations: [0, 0.22, 0.55],
    sheenStart: { x: 0.5, y: 0 },
    sheenEnd: { x: 0.5, y: 1 },
    edgeLit: 'rgba(255, 255, 255, 0.90)',
    edgeDim: 'rgba(15, 20, 30, 0.10)',
    bevelTop: 'rgba(255, 255, 255, 0.85)',
    bevelBottom: 'rgba(15, 20, 30, 0.08)',
    halo: 'rgba(255, 255, 255, 0.45)',
    shadow: { offsetY: 4, radius: 18, opacity: 0.16 },
    text: 'rgba(10, 14, 22, 0.92)',
    textDim: 'rgba(10, 14, 22, 0.60)',
    chipTintAlpha: '33',
  },
} as const satisfies Record<string, GlassMaterial>;

export type GlassMaterialName = keyof typeof GLASS_MATERIALS;

/** Charcoal: it sits with the opaque offer card, which is what the overlays belong beside. */
export const DEFAULT_GLASS_MATERIAL: GlassMaterialName = 'dark';
