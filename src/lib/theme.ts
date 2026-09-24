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
 * Vector Elegans blue — the identity the Next.js client portal already carries.
 *
 * `blue-500` is the trip route and the pickup marker on the driver map, the primary gradient in
 * the portal's buttons, and the accent on the client account cards. Naming it once here keeps the
 * driver overlays inside that family instead of inventing a second blue to sit beside it.
 */
export const VE_BLUE = {
  /** blue-500 — the route, the pickup marker, the primary accent. */
  base: '#3b82f6',
  /** blue-400 — a glyph on a tinted chip, readable where blue-500 is too deep. */
  light: '#60a5fa',
  /** blue-500 at 16 %: the hairline the portal's cards carry (`border-blue-500/15`). */
  rim: 'rgba(59, 130, 246, 0.16)',
  /**
   * blue-500 at 12 %, as a bare alpha for the `${accent}${alpha}` chip tint.
   *
   * The tint of the accent rather than a flat grey chip, so a glyph carries the colour it names
   * without a second colour entering the palette.
   */
  tintAlpha: '1f',
  /** slate-950 — what the portal's cards cast, and what reads as shade under glass. */
  shadow: '#020617',
} as const;

/**
 * The glass the panels above the live map are made of — one material, described layer by layer.
 *
 * **The face is a slate blue, not charcoal, and deliberately mid-dark.** The first version was
 * near-black, which read as a hole cut out of the map. The correction is not to go pale either:
 * a light panel over light tiles needs so much opacity to stay legible that it becomes the flat
 * white card it was meant not to be. Slate sits between the two — unmistakably a surface,
 * unmistakably darker than the map beneath it, and cool enough to belong with the blue the
 * portal already uses everywhere.
 *
 * **No backdrop blur, and this is the load-bearing decision.** `expo-blur` would have to
 * re-capture its backdrop, and the backdrop here is a map that never holds still — the blur
 * would be recomputed on every frame the driver moves, the single most expensive thing on this
 * screen. It is also not the sacrifice it sounds like: on Android `BlurView` defaults to
 * `BlurMethod.NONE` and paints a flat tint instead of blurring at all. The glass is *built*
 * instead, which is why it can afford to be convincing.
 *
 * The layers, in the order they are painted:
 *
 * 1. **Body** — a diagonal gradient at three stops, so the panel has mass rather than a fill.
 * 2. **Sheen** — a soft wash from the top edge that is gone by the middle. Light arrives from
 *    above, so the near edge catches it and the far one does not.
 * 3. **Directional edge glows** — an ultra-fine bar along the top edge and another down the left,
 *    each fading out well before it reaches the far end.
 * 4. **Rim** — a uniform hairline in the portal's blue, so the panel is outlined on every side
 *    without that outline becoming a high-contrast decoration.
 *
 * Layer 3 is the whole border treatment and it is deliberately *not* four lit corners. A panel
 * whose corners glow on every side reads as a bevelled box from an older toolkit, which is
 * precisely what it looked like: bright arcs at opposite corners are a graphic flourish, where
 * two thin bars from one origin say the same thing — the light comes from up and to the left —
 * and say it quietly. The Next.js cards reached the same conclusion, and their comment says so.
 *
 * `text`, `textDim`, `accent` and `chipTintAlpha` live here too, and that is what makes these
 * overlays one material rather than three panels that happen to share a background.
 */
export type GlassMaterial = {
  /** Body gradient, diagonal. Three stops: lit edge, mid body, shaded edge. */
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
  /** Soft wash over the body, from the top edge downward. Never a fill on its own. */
  sheen: readonly [string, string];
  /** Stops for `sheen`, matched to its length: present at the top edge, gone by this point. */
  sheenLocations: readonly [number, number];
  sheenStart: { x: number; y: number };
  sheenEnd: { x: number; y: number };
  /**
   * Colour of each edge glow at its origin, the top-left corner.
   *
   * Cool rather than white, and this is where the blue identity reads most clearly: a bare white
   * highlight on a slate face is the one thing that looks like a scuff on a screen.
   */
  edgeGlow: string;
  /** Where an edge glow has faded to nothing, as a fraction of the edge it runs along. */
  edgeFade: number;
  /** Thickness of an edge glow, in points. A hairline: this is a reflection, not a border. */
  edgeThickness: number;
  /** Uniform hairline outline, in the portal's blue. */
  rim: string;
  /** Ambient shade. Wide and soft, and tinted slate rather than pure black. */
  shadow: { offsetY: number; radius: number; opacity: number; color: string };
  /** Primary type on the panel. A light grey, never pure white. */
  text: string;
  /** Supporting type: addresses, hints, the distance beside the clock. */
  textDim: string;
  /** The panel's own accent, for the glyphs that belong to no trip stage. */
  accent: string;
  /** The accent's lighter step, for a glyph drawn straight on the body. */
  accentLight: string;
  /** Bare alpha appended to an accent for a chip tint: `${accent}${chipTintAlpha}`. */
  chipTintAlpha: string;
};

export const GLASS_MATERIAL: GlassMaterial = {
  body: [
    'rgba(51, 65, 85, 0.92)',
    'rgba(33, 45, 63, 0.93)',
    'rgba(23, 32, 46, 0.95)',
  ],
  bodyStart: { x: 0.15, y: 0 },
  bodyEnd: { x: 0.85, y: 1 },
  bodyBase: '#1b2432',
  sheen: ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0)'],
  sheenLocations: [0, 0.55],
  sheenStart: { x: 0.5, y: 0 },
  sheenEnd: { x: 0.5, y: 1 },
  edgeGlow: 'rgba(190, 219, 255, 0.30)',
  edgeFade: 0.38,
  edgeThickness: 1,
  rim: VE_BLUE.rim,
  shadow: { offsetY: 6, radius: 22, opacity: 0.34, color: VE_BLUE.shadow },
  text: '#e2e8f0',
  textDim: '#94a3b8',
  accent: VE_BLUE.base,
  accentLight: VE_BLUE.light,
  chipTintAlpha: VE_BLUE.tintAlpha,
};
