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
  /**
   * blue-700 — a glyph drawn straight on the face.
   *
   * Darker than the accent rather than lighter, and the inversion follows the face: on a dark
   * pane a glyph had to come *up* in value to be seen, on a light one it has to come *down*. It
   * is also what the map outlines its markers with (`MAP_PALETTE.departureEdge`), so the
   * instruction and the pin it names keep agreeing.
   */
  edge: '#1d4ed8',
  /**
   * blue-500 at 12 %, as a bare alpha for the `${accent}${alpha}` chip tint.
   *
   * The tint of the accent rather than a flat grey chip, so a glyph carries the colour it names
   * without a second colour entering the palette. Kept low, and lower still than it looks: a
   * tint that reads as a tone on a dark face reads as a stain on a light one.
   */
  tintAlpha: '1f',
  /** slate-950 — what the portal's cards cast, and what reads as shade under glass. */
  shadow: '#020617',
} as const;

/**
 * The glass the panels above the live map are made of — one material, described layer by layer.
 *
 * **The face is a light frost, between light and medium, and neutral.** Two rejections led here.
 * The first face was near-black, which read as a hole cut out of the map. The second was a slate
 * blue, which read as a colour that had been *chosen*: the panels looked tinted rather than
 * frosted. The face is now neither dark nor tinted — a pale neutral veil, which is what makes it
 * read as glass over a map instead of paint laid on it.
 *
 * **The frost is faked, and that is the load-bearing decision.** `expo-blur` would have to
 * re-capture its backdrop, and the backdrop here is a map that never holds still — the blur would
 * be recomputed on every frame the driver moves, the single most expensive thing on this screen.
 * It is also not the sacrifice it sounds like: on Android `BlurView` defaults to
 * `BlurMethod.NONE` and paints a flat tint instead of blurring at all. A translucent neutral veil
 * gets most of the way there for none of the cost, because the map underneath is pale and busy
 * and flattening it *is* the effect. Measured on the guidance bar, roughly a quarter of the map's
 * own detail survives behind the veil: a real blur leaves none, clear glass leaves all of it, and
 * a frosted pane occupies the range in between.
 *
 * The layers, in the order they are painted:
 *
 * 1. **Body** — a diagonal gradient at three stops, lighter at the top. Translucent, so the map
 *    crosses it; that show-through is the whole trick. It carries the pane's top as the *range*
 *    between its own stops, and that is the correction: a highlight painted as its own band over
 *    a short bar lands across a line of type and reads as a lighter box drawn behind it, which is
 *    exactly what it was reported as.
 * 2. **Directional edge glows** — an ultra-fine white bar along the top edge and another down the
 *    left, each fading out well before it reaches the far end. This is the arête, the highlight a
 *    pane's corner leaves.
 * 3. **Rim** — a uniform hairline, and on a light face it is *dark*. That inversion is forced by
 *    the light direction: on a slate pane the outline was a glow, because anything darker than
 *    the face vanished into it; on a pale pane the light hairline is what vanishes, so the
 *    boundary has to come from below. Without it a pale panel over pale tiles has no edge at all.
 *
 * Layer 2 is the whole border treatment and it is deliberately *not* four lit corners. A panel
 * whose corners glow on every side reads as a bevelled box from an older toolkit, which is
 * precisely what it looked like: bright arcs at opposite corners are a graphic flourish, where
 * two thin bars from one origin say the same thing — the light comes from up and to the left —
 * and say it quietly. The Next.js cards reached the same conclusion, and their comment says so.
 *
 * `text`, `textDim`, `accent`, `accentStrong` and `chipTintAlpha` live here too, and that is what
 * makes these overlays one material rather than several panels that happen to share a background.
 * The type is dark for the same reason the rim is: the face inverted, so everything on it did.
 */
export type GlassMaterial = {
  /** Body gradient, diagonal. Three stops: lit edge, mid body, shaded edge. */
  body: readonly [string, string, string];
  bodyStart: { x: number; y: number };
  bodyEnd: { x: number; y: number };
  /**
   * Colour under the gradient, and the one Android derives its elevation outline from.
   *
   * Kept translucent rather than solid, because the show-through is the effect: an opaque base
   * would hide the map behind the gradient and turn the pane back into a painted slab.
   */
  bodyBase: string;
  /**
   * Colour of each edge glow at its origin, the top-left corner.
   *
   * White, and not the scuff it would be on a dark face: this is the lit edge of the pane, and
   * its brightness is relative to a face that is already pale.
   */
  edgeGlow: string;
  /** Where an edge glow has faded to nothing, as a fraction of the edge it runs along. */
  edgeFade: number;
  /** Thickness of an edge glow, in points. A hairline: this is a reflection, not a border. */
  edgeThickness: number;
  /**
   * Uniform hairline outline, and dark.
   *
   * The one thing that gives a pale pane an edge over pale map tiles. A rim in the accent colour
   * would decorate the panel; a dark one bounds it, which is what a light face needs.
   */
  rim: string;
  /** Ambient shade. Wide and soft, and restrained: a pale pane casts less than a dark one. */
  shadow: { offsetY: number; radius: number; opacity: number; color: string };
  /** Primary type on the panel. Near-black, because the face is pale. */
  text: string;
  /** Supporting type: addresses, hints, the distance beside the clock. A grey, never a whisper. */
  textDim: string;
  /** The panel's own accent, for the glyphs that belong to no trip stage. */
  accent: string;
  /**
   * A deeper step of the accent, for a glyph drawn straight on the face.
   *
   * Darker than `accent`, not lighter — the same inversion as the type and the rim.
   */
  accentStrong: string;
  /** Bare alpha appended to an accent for a chip tint: `${accent}${chipTintAlpha}`. */
  chipTintAlpha: string;
};

export const GLASS_MATERIAL: GlassMaterial = {
  body: [
    'rgba(250, 251, 253, 0.60)',
    'rgba(233, 238, 245, 0.66)',
    'rgba(214, 222, 233, 0.72)',
  ],
  bodyStart: { x: 0.15, y: 0 },
  bodyEnd: { x: 0.85, y: 1 },
  bodyBase: 'rgba(255, 255, 255, 0.30)',
  edgeGlow: 'rgba(255, 255, 255, 0.85)',
  edgeFade: 0.42,
  edgeThickness: 1,
  rim: 'rgba(15, 23, 42, 0.14)',
  shadow: { offsetY: 8, radius: 24, opacity: 0.18, color: VE_BLUE.shadow },
  text: '#111827',
  textDim: '#4b5563',
  accent: VE_BLUE.base,
  accentStrong: VE_BLUE.edge,
  chipTintAlpha: VE_BLUE.tintAlpha,
};
