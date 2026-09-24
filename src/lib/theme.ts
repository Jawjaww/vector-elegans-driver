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
 * Tokens for the panels that float directly above the live map.
 *
 * Two decisions are baked in here rather than repeated at each call site.
 *
 * **No backdrop blur.** `expo-blur` would have to re-capture its backdrop, and the backdrop
 * here is a map that never holds still — the blur would be recomputed on every frame the
 * driver moves, which is the most expensive thing on this screen. The glass is built instead
 * from a static diagonal sheen over a translucent charcoal: one gradient, painted once, no
 * per-frame cost at all.
 *
 * **A specular rim, lit on opposite corners.** The bright top-left arc against a dimmed
 * bottom-right one is what gives a flat panel a sense of thickness: it reads as light arriving
 * from one direction and glancing off an edge. A uniform border gives the same panel the look
 * of a box. The two colours are named for their role rather than for their position, so a
 * call site cannot pair `top` with `bottom` and lose the effect.
 */
export const GLASS_OVERLAY = {
  /** Body. Translucent enough to read as glass, opaque enough to stay legible on pale tiles. */
  body: 'rgba(20, 20, 22, 0.66)',
  /** Sheen painted over the body, top-left toward bottom-right. Never a fill on its own. */
  sheen: ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.015)'] as const,
  sheenStart: { x: 0, y: 0 } as const,
  sheenEnd: { x: 1, y: 1 } as const,
  /** Lit rim — top-left and bottom-right, the two opposite arcs that carry the reflection. */
  edgeLit: 'rgba(255, 255, 255, 0.42)',
  /** Dimmed rim. Never fully transparent: the panel still needs an outline over dark tiles. */
  edgeDim: 'rgba(255, 255, 255, 0.08)',
} as const;
