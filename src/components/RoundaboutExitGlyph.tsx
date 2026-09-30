import { View } from 'react-native';

type RoundaboutExitGlyphProps = Readonly<{
  /** 1-based OSRM exit. */
  exit: number;
  color: string;
  trackColor: string;
  /** Box the glyph is drawn in. Everything inside scales with it. */
  size?: number;
}>;

/**
 * The glyph's own design size, and the unit every measurement below is written in.
 *
 * The geometry is authored on a 40 pt box — radii, stroke widths, the hub — so scaling is a
 * multiplication rather than a second set of numbers to keep in step. The instruction card asks
 * for a larger one: this is read at a glance from a mounted phone, and the arrow it replaces there
 * was the smallest thing on the screen.
 */
const DESIGN_SIZE = 40;

/**
 * Which way the driver leaves a roundabout, seen from above.
 *
 * Entry is the grey stroke at the bottom. On a right-hand roundabout the first
 * exit is to the right, then further exits continue counter-clockwise. The
 * taken exit is the accent stroke.
 */
function exitAngle(index: number, total: number): number {
  const entry = Math.PI / 2;
  const step = (2 * Math.PI) / (total + 1);
  return entry - index * step;
}

function pointOnCircle(angle: number, radius: number, center: number) {
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
}

function Spoke({
  angle,
  inner,
  outer,
  thickness,
  color,
  center,
}: Readonly<{
  angle: number;
  inner: number;
  outer: number;
  thickness: number;
  color: string;
  center: number;
}>) {
  const length = outer - inner;
  const mid = pointOnCircle(angle, inner + length / 2, center);
  const rotation = (angle * 180) / Math.PI;
  return (
    <View
      style={{
        position: 'absolute',
        left: mid.x - length / 2,
        top: mid.y - thickness / 2,
        width: length,
        height: thickness,
        borderRadius: thickness,
        backgroundColor: color,
        transform: [{ rotate: `${rotation}deg` }],
      }}
    />
  );
}

export function RoundaboutExitGlyph({
  exit,
  color,
  trackColor,
  size = DESIGN_SIZE,
}: RoundaboutExitGlyphProps) {
  const taken = Math.max(1, Math.round(exit));
  const total = Math.max(taken, 4);
  const scale = size / DESIGN_SIZE;
  const center = size / 2;
  /** One authored measurement, at the requested size. */
  const at = (value: number) => value * scale;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: center - at(7),
          top: center - at(7),
          width: at(14),
          height: at(14),
          borderRadius: at(7),
          borderWidth: at(1.5),
          borderColor: trackColor,
        }}
      />
      <Spoke
        angle={Math.PI / 2}
        inner={at(8)}
        outer={at(18)}
        thickness={at(2.5)}
        color={trackColor}
        center={center}
      />
      {Array.from({ length: total }, (_, offset) => {
        const index = offset + 1;
        const isTaken = index === taken;
        return (
          <Spoke
            key={index}
            angle={exitAngle(index, total)}
            inner={at(8)}
            outer={at(isTaken ? 19 : 16)}
            thickness={at(isTaken ? 3.5 : 2)}
            color={isTaken ? color : trackColor}
            center={center}
          />
        );
      })}
    </View>
  );
}
