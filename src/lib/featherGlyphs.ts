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
  | 'tool'
  | 'phone'
  | 'phone-call'
  | 'map-pin'
  | 'map'
  | 'hash'
  | 'users'
  | 'credit-card'
  | 'award'
  | 'shield'
  | 'briefcase'
  | 'info'
  | 'droplet'
  | 'camera'
  | 'calendar'
  | 'upload'
  | 'upload-cloud'
  | 'refresh-cw'
  | 'alert-circle';

export type GlyphShape =
  | Readonly<{ kind: 'path'; d: string }>
  | Readonly<{ kind: 'polyline' | 'polygon'; points: string }>
  | Readonly<{ kind: 'line'; x1: number; y1: number; x2: number; y2: number }>
  | Readonly<{ kind: 'circle'; cx: number; cy: number; r: number }>
  | Readonly<{
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      ry?: number;
    }>;

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

  /* Dossier wizard fields, stepper, avatar camera, date picker, document actions. */
  phone: [
    {
      kind: 'path',
      d:
        'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    },
  ],
  'phone-call': [
    {
      kind: 'path',
      d:
        'M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    },
  ],
  'map-pin': [
    { kind: 'path', d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' },
    { kind: 'circle', cx: 12, cy: 10, r: 3 },
  ],
  map: [
    { kind: 'polygon', points: '1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6' },
    { kind: 'line', x1: 8, y1: 2, x2: 8, y2: 18 },
    { kind: 'line', x1: 16, y1: 6, x2: 16, y2: 22 },
  ],
  hash: [
    { kind: 'line', x1: 4, y1: 9, x2: 20, y2: 9 },
    { kind: 'line', x1: 4, y1: 15, x2: 20, y2: 15 },
    { kind: 'line', x1: 10, y1: 3, x2: 8, y2: 21 },
    { kind: 'line', x1: 16, y1: 3, x2: 14, y2: 21 },
  ],
  users: [
    { kind: 'path', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { kind: 'circle', cx: 9, cy: 7, r: 4 },
    { kind: 'path', d: 'M23 21v-2a4 4 0 0 0-3-3.87' },
    { kind: 'path', d: 'M16 3.13a4 4 0 0 1 0 7.75' },
  ],
  'credit-card': [
    { kind: 'rect', x: 1, y: 4, width: 22, height: 16, rx: 2, ry: 2 },
    { kind: 'line', x1: 1, y1: 10, x2: 23, y2: 10 },
  ],
  award: [
    { kind: 'circle', cx: 12, cy: 8, r: 7 },
    { kind: 'polyline', points: '8.21 13.89 7 23 12 20 17 23 15.79 13.88' },
  ],
  shield: [{ kind: 'path', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }],
  briefcase: [
    { kind: 'rect', x: 2, y: 7, width: 20, height: 14, rx: 2, ry: 2 },
    { kind: 'path', d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' },
  ],
  info: [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'line', x1: 12, y1: 16, x2: 12, y2: 12 },
    { kind: 'line', x1: 12, y1: 8, x2: 12.01, y2: 8 },
  ],
  droplet: [{ kind: 'path', d: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z' }],
  camera: [
    {
      kind: 'path',
      d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z',
    },
    { kind: 'circle', cx: 12, cy: 13, r: 4 },
  ],
  calendar: [
    { kind: 'rect', x: 3, y: 4, width: 18, height: 18, rx: 2, ry: 2 },
    { kind: 'line', x1: 16, y1: 2, x2: 16, y2: 6 },
    { kind: 'line', x1: 8, y1: 2, x2: 8, y2: 6 },
    { kind: 'line', x1: 3, y1: 10, x2: 21, y2: 10 },
  ],
  upload: [
    { kind: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
    { kind: 'polyline', points: '17 8 12 3 7 8' },
    { kind: 'line', x1: 12, y1: 3, x2: 12, y2: 15 },
  ],
  'upload-cloud': [
    { kind: 'polyline', points: '16 16 12 12 8 16' },
    { kind: 'line', x1: 12, y1: 12, x2: 12, y2: 21 },
    { kind: 'path', d: 'M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3' },
  ],
  'refresh-cw': [
    { kind: 'polyline', points: '23 4 23 10 17 10' },
    { kind: 'polyline', points: '1 20 1 14 7 14' },
    {
      kind: 'path',
      d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
    },
  ],
  'alert-circle': [
    { kind: 'circle', cx: 12, cy: 12, r: 10 },
    { kind: 'line', x1: 12, y1: 8, x2: 12, y2: 12 },
    { kind: 'line', x1: 12, y1: 16, x2: 12.01, y2: 16 },
  ],
};
