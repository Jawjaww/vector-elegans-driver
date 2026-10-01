import React, { useEffect, useRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { SheetBodyLevel } from '../lib/utils/homeSheetSnap';

/**
 * What a measured section reports: the bottom edge of a palier, in the sheet's content space.
 *
 * The bottom edge and not the height, because that is the number the sheet needs — a palier ends
 * where its last section ends, and the section knows it without anyone having to add up the
 * heights and margins above it.
 */
export type SheetSectionMeasure = (
  level: SheetBodyLevel,
  bottom: number | null,
) => void;

/**
 * One section of the bottom sheet, measured so its palier can stop cutting through it.
 *
 * The sheet snapped on a constant per palier until now. Each constant described a component that
 * was free to change without it — the deferred ride card grew a bonus line, the day-stats cards
 * grew a second line of type — and the palier then ended *inside* the content it exists to
 * reveal: the bottom of the card, and the earnings under it. A wrapper cannot drift from the
 * thing inside it.
 *
 * `y + height`, not `height`: `onLayout` gives the frame relative to the parent, which **must
 * be** the scroll content container — so the sum is a position in the same space the sheet's snap
 * offsets are built from, and the padding the content carries is already counted in it. An extra
 * native wrapper around this component would make `y` relative to that wrapper instead: the palier
 * would stop at the section's own height and cut through everything below the fold, which is how
 * the trip snap clipped « Je suis arrivé ». The dashboard fragment does not create a native parent;
 * a `View` does.
 */
export const SheetSection = ({
  level,
  onMeasure,
  children,
}: Readonly<{
  level: SheetBodyLevel;
  onMeasure: SheetSectionMeasure;
  children: React.ReactNode;
}>) => {
  // Held in a ref so the unmount cleanup below cannot depend on the callback's identity: with an
  // inline arrow in the deps, every parent render would run the cleanup, clear a measurement that
  // is still true, and leave the palier on the guess — `onLayout` does not fire again for a layout
  // that did not change, so nothing would put it back.
  const measureRef = useRef(onMeasure);
  measureRef.current = onMeasure;

  useEffect(() => () => measureRef.current(level, null), [level]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    measureRef.current(level, y + height);
  };

  // `collapsable` false because a view whose only job is `onLayout` is exactly what Android's
  // view flattening removes, and a removed view reports nothing.
  return (
    <View collapsable={false} onLayout={handleLayout}>
      {children}
    </View>
  );
};
