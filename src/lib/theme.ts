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
 * **Frost is blur first, then a translucent white veil.** The blur is painted inside the map
 * document (`backdropBlurPx`), by copying the MapLibre canvas under each card. A native
 * `BlurView` cannot sample the hardware WebView, and its light tint at full intensity paints
 * an opaque white plate over the map. The wash (`fillTop` / `fillBottom`) sits on that copy
 * only, so the map still reads through it.
 *
 * `text`, `textDim`, `accent`, `accentStrong` and `chipTintAlpha` live here too, and that is what
 * makes these overlays one material rather than several panels that happen to share a background.
 * The type is dark for the same reason the rim is: the face inverted, so everything on it did.
 */
export type GlassMaterial = {
  /** Top of the frosted face. A thin white wash over the blur, not a plate. */
  fillTop: string;
  /** Bottom of the frosted face. Slightly more map bleed-through than `fillTop`. */
  fillBottom: string;
  /** One-point light edge around the frost. */
  hairline: string;
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
  /**
   * Blur radius, in CSS pixels, applied to the map copy under each card.
   * Static. Scaled by device pixel ratio when the copy is painted.
   */
  backdropBlurPx: number;
};

export const GLASS_MATERIAL: GlassMaterial = {
  fillTop: 'rgba(255, 255, 255, 0.38)',
  fillBottom: 'rgba(255, 255, 255, 0.28)',
  backdropBlurPx: 12,
  hairline: 'rgba(255, 255, 255, 0.55)',
  shadow: { offsetY: 6, radius: 18, opacity: 0.16, color: '#000000' },
  text: '#111827',
  textDim: '#4b5563',
  accent: VE_BLUE.base,
  accentStrong: VE_BLUE.edge,
  chipTintAlpha: VE_BLUE.tintAlpha,
};
