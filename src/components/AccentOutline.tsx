import React, { useCallback, useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { VE_BLUE } from '../lib/theme';

type AccentOutlineProps = Readonly<{
  /** Corner radius of the control being outlined. Clamped to half the shorter side, so a pill
   *  is asked for by passing something large rather than by computing its height. */
  radius: number;
  /** In points. A small chip takes a hairline; a button can carry a little more. */
  thickness?: number;
}>;

/**
 * An accent gradient, stroked around whatever it is placed in.
 *
 * Stroked, not inset, and that is the whole reason this exists. React Native has no gradient
 * border, and the usual stand-in — lay a gradient down and cover it with an inset face — needs
 * that face to be **opaque**. The controls that wanted an outline here have translucent faces:
 * the option chips are glass over a blurred map, so an inset would let the gradient show through
 * their middle and stop being an outline at all. A stroke covers nothing, so the face keeps its
 * translucency and the gradient lands on the edge.
 *
 * It measures itself rather than taking a width, because its callers are a pill sized by its own
 * label and chips that grow when an option expands. An absolutely filled wrapper *is* its
 * parent's box, so `onLayout` on it reports exactly the geometry to stroke — no width to thread
 * through the call sites, and the outline follows a chip that resizes itself.
 *
 * The first frame has no geometry to stroke, so nothing is drawn; the outline appears as soon as
 * the parent has been laid out. On every control that uses it the parent is also moving — a card
 * fading in, a chip expanding — so the missing frame is not visible in practice.
 *
 * Decoration only, hence `pointerEvents="none"`: the press has to keep reaching the `Pressable`
 * underneath, which is the parent.
 */
export function AccentOutline({ radius, thickness = 1 }: AccentOutlineProps) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  // Per instance: a screen carries several of these at once, and a repeated id resolves to
  // whichever declaration was read last. Sanitised because the id becomes part of `url(#…)` and
  // `useId` returns `:r0:`, whose colons are not valid in a CSS url reference.
  const gradientId = `ve-outline-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const measure = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    // Guarded, so a re-layout that changes nothing does not re-render every chip in the row.
    setBox((current) =>
      current && current.width === width && current.height === height
        ? current
        : { width, height },
    );
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={measure}>
      {box && box.width > 0 && box.height > 0 ? (
        <Svg width={box.width} height={box.height} fill="none">
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={VE_BLUE.glyphGradient[0]} />
              <Stop offset="100%" stopColor={VE_BLUE.glyphGradient[1]} />
            </LinearGradient>
          </Defs>
          {/* Inset by half the stroke, so the stroke sits *within* the control's box and the shape
              keeps the footprint it already had. A rounded rect whose radius is half its height is
              a pill, which is why `radius` can simply be clamped. */}
          <Rect
            x={thickness / 2}
            y={thickness / 2}
            width={Math.max(0, box.width - thickness)}
            height={Math.max(0, box.height - thickness)}
            rx={Math.min(radius, Math.min(box.width, box.height) / 2)}
            stroke={`url(#${gradientId})`}
            strokeWidth={thickness}
          />
        </Svg>
      ) : null}
    </View>
  );
}
