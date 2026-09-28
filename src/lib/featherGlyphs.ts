/**
 * The Feather glyphs this app draws itself.
 *
 * Feather reaches the app as a *font* through `@expo/vector-icons`, and a font glyph takes a
 * single flat colour. That is fine for most of the icons here — but the accent ones are painted
 * with a gradient, and a gradient through a font glyph needs a masking module, which is native, so
 * a gradient shipped that way would not reach the drivers already on the current APK: OTA updates
 * carry JavaScript only. React Native SVG is linked already (`VGpsLoader` draws its road with it),
 * so these glyphs are drawn as paths and the gradient lands on the stroke.
 *
 * Transcribed from `feather-icons@4.29.2` rather than redrawn: an approximation of a 2 px stroke
 * is exactly how an icon set starts to drift from the one it claims to be. Only the glyphs that
 * have to carry the gradient are listed — everything else stays on the font, where it costs a
 * lookup instead of a tree of views.
 *
 * Kept out of the component as plain data: a table of coordinates has no business being wrapped in
 * JSX, and `featherGlyph.test.ts` reads it directly instead of parsing a component.
 */

/** Every vendored glyph, named exactly as Feather names it. */
export type FeatherGlyphName =
  | 'home'
  | 'navigation'
  | 'trending-up'
  | 'user'
  | 'file-text'
  | 'truck'
  | 'download-cloud'
  | 'volume-2'
  | 'help-circle'
  | 'tool';

export type GlyphShape =
  | Readonly<{ kind: 'path'; d: string }>
  | Readonly<{ kind: 'polyline' | 'polygon'; points: string }>
  | Readonly<{ kind: 'line'; x1: number; y1: number; x2: number; y2: number }>
  | Readonly<{ kind: 'circle'; cx: number; cy: number; r: number }>
  | Readonly<{ kind: 'rect'; x: number; y: number; width: number; height: number }>;

export const FEATHER_GLYPHS: Readonly<
  Record<FeatherGlyphName, readonly GlyphShape[]>
> = {
  /* The four tab routes, in the order `app/(tabs)/_layout.tsx` declares them. */
  home: [
    { kind: 'path', d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { kind: 'polyline', points: '9 22 9 12 15 12 15 22' },
  ],
  navigation: [{ kind: 'polygon', points: '3 11 22 2 13 21 11 13 3 11' }],
  'trending-up': [
    { kind: 'polyline', points: '23 6 13.5 15.5 8.5 10.5 1 18' },
    { kind: 'polyline', points: '17 6 23 6 23 12' },
  ],
  user: [
    { kind: 'path', d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
    { kind: 'circle', cx: 12, cy: 7, r: 4 },
  ],

  /* The profile rows. Each one heads a chip that has to carry the accent. */
  'file-text': [
    { kind: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { kind: 'polyline', points: '14 2 14 8 20 8' },
    { kind: 'line', x1: 16, y1: 13, x2: 8, y2: 13 },
    { kind: 'line', x1: 16, y1: 17, x2: 8, y2: 17 },
    { kind: 'polyline', points: '10 9 9 9 8 9' },
  ],
  truck: [
    { kind: 'rect', x: 1, y: 3, width: 15, height: 13 },
    { kind: 'polygon', points: '16 8 20 8 23 11 23 16 16 16 16 8' },
    { kind: 'circle', cx: 5.5, cy: 18.5, r: 2.5 },
    { kind: 'circle', cx: 18.5, cy: 18.5, r: 2.5 },
  ],
  'download-cloud': [
    { kind: 'polyline', points: '8 17 12 21 16 17' },
    { kind: 'line', x1: 12, y1: 12, x2: 12, y2: 21 },
    { kind: 'path', d: 'M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29' },
  ],
  'volume-2': [
    { kind: 'polygon', points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' },
    { kind: 'path', d: 'M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07' },
  ],
  'help-circle': [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'path', d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' },
    { kind: 'line', x1: 12, y1: 17, x2: 12.01, y2: 17 },
  ],
  tool: [
    {
      kind: 'path',
      d:
        'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 ' +
        '6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    },
  ],
};
