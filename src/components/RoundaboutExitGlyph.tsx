import { View } from 'react-native';

type RoundaboutExitGlyphProps = Readonly<{
  /** 1-based OSRM exit. */
  exit: number;
  color: string;
  trackColor: string;
}>;

const SIZE = 40;
const CENTER = SIZE / 2;

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

function pointOnCircle(angle: number, radius: number) {
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function Spoke({
  angle,
  inner,
  outer,
  thickness,
  color,
}: Readonly<{
  angle: number;
  inner: number;
  outer: number;
  thickness: number;
  color: string;
}>) {
  const length = outer - inner;
  const mid = pointOnCircle(angle, inner + length / 2);
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
}: RoundaboutExitGlyphProps) {
  const taken = Math.max(1, Math.round(exit));
  const total = Math.max(taken, 4);

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <View
        style={{
          position: 'absolute',
          left: CENTER - 7,
          top: CENTER - 7,
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 1.5,
          borderColor: trackColor,
        }}
      />
      <Spoke
        angle={Math.PI / 2}
        inner={8}
        outer={18}
        thickness={2.5}
        color={trackColor}
      />
      {Array.from({ length: total }, (_, offset) => {
        const index = offset + 1;
        const isTaken = index === taken;
        return (
          <Spoke
            key={index}
            angle={exitAngle(index, total)}
            inner={8}
            outer={isTaken ? 19 : 16}
            thickness={isTaken ? 3.5 : 2}
            color={isTaken ? color : trackColor}
          />
        );
      })}
    </View>
  );
}
