import React, { useId } from 'react';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  FEATHER_GLYPHS,
  type FeatherGlyphName,
  type GlyphShape,
} from '../lib/featherGlyphs';
import { VE_BLUE } from '../lib/theme';

/** Feather draws every glyph as an outline: a 2 px stroke on a 24 unit grid, round joined. */
const GLYPH_STROKE = {
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
} as const;

type GlyphShapeViewProps = Readonly<{ shape: GlyphShape; stroke: string }>;

/** A key taken from the shape's own geometry, which is stable and unique within a glyph. */
function glyphShapeKey(shape: GlyphShape): string {
  switch (shape.kind) {
    case 'path':
      return `path:${shape.d}`;
    case 'circle':
      return `circle:${shape.cx},${shape.cy},${shape.r}`;
    case 'rect':
      return `rect:${shape.x},${shape.y},${shape.width},${shape.height}`;
    case 'line':
      return `line:${shape.x1},${shape.y1},${shape.x2},${shape.y2}`;
    case 'polyline':
    case 'polygon':
      return `${shape.kind}:${shape.points}`;
  }
}

function GlyphShapeView({ shape, stroke }: GlyphShapeViewProps) {
  const props = { ...GLYPH_STROKE, stroke };
  switch (shape.kind) {
    case 'path':
      return <Path {...props} d={shape.d} />;
    case 'polyline':
      return <Polyline {...props} points={shape.points} />;
    case 'polygon':
      return <Polygon {...props} points={shape.points} />;
    case 'rect':
      return (
        <Rect {...props} x={shape.x} y={shape.y} width={shape.width} height={shape.height} />
      );
    case 'line':
      return (
        <Line {...props} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
      );
    case 'circle':
      return <Circle {...props} cx={shape.cx} cy={shape.cy} r={shape.r} />;
  }
}

type FeatherGlyphProps = Readonly<{
  name: FeatherGlyphName;
  size?: number;
  /**
   * A flat colour. Left out, the glyph is painted with the app's blue gradient.
   *
   * One prop rather than a `focused` boolean: the tab bar is not the only caller any more, and
   * "which colour" is the question every caller actually has.
   */
  color?: string;
}>;

/**
 * A Feather glyph, painted with the app's blue gradient unless told otherwise.
 *
 * The gradient is the portal's button pair lifted one step along the same ramp, so it survives a
 * near-black floor (`VE_BLUE.glyphGradient`, and the measurement, in the theme). The mechanism —
 * SVG paths instead of the font — is explained in `lib/featherGlyphs.ts`.
 */
export function FeatherGlyph({ name, size = 22, color }: FeatherGlyphProps) {
  // Per instance, because the profile puts six of these on one screen. A fixed id would be
  // declared six times over, and `useId` is the one source of uniqueness React guarantees here.
  // Sanitised because the id becomes part of `url(#…)`, and `useId` returns `:r0:`, whose colons
  // are not valid in a CSS url reference.
  const gradientId = `ve-glyph-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stroke = color ?? `url(#${gradientId})`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {color ? null : (
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={VE_BLUE.glyphGradient[0]} />
            <Stop offset="100%" stopColor={VE_BLUE.glyphGradient[1]} />
          </LinearGradient>
        </Defs>
      )}
      {FEATHER_GLYPHS[name].map((shape) => (
        <GlyphShapeView key={glyphShapeKey(shape)} shape={shape} stroke={stroke} />
      ))}
    </Svg>
  );
}
