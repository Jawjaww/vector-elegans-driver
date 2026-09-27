import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GLASS_MATERIAL } from '../lib/theme';
import {
  clearFrostRect,
  getFrostScene,
  publishFrostRect,
} from '../map/frostRects';

type GlassPanelProps = Readonly<{
  children?: ReactNode;
  /**
   * Corner radius. A prop rather than a utility class: callers pass a card radius or a circle,
   * and a static class cannot express a value the caller chooses.
   */
  radius: number;
  style?: StyleProp<ViewStyle>;
  /** When false, map frost is cleared and not republished (hidden overlays must not paint frost). */
  frostEnabled?: boolean;
}>;

/** Kept at zero: the bevel is a light on the map copy, not an inset that shrinks the content. */
export const GLASS_PANEL_BEVEL_PX = 0;

export const GLASS_PANEL_BEVEL_INSET = GLASS_PANEL_BEVEL_PX * 2;

/**
 * The panel every overlay above the map is drawn on.
 *
 * The view itself is clear except for the hairline — the one hard contour. The frost (a
 * light blur of the map, a thin white wash, then a rim blended over that copy) is painted
 * in the map document on this same rectangle, measured against the map scene — not the
 * window — so the wash cannot sit below the border.
 *
 * Android `elevation` stays off: a shadow on a clear view composites as a second plate.
 */
export function GlassPanel({
  children,
  radius,
  style,
  frostEnabled = true,
}: GlassPanelProps) {
  const id = useId();
  const ref = useRef<View>(null);
  const material = GLASS_MATERIAL;

  const report = useCallback(() => {
    if (!frostEnabled) {
      clearFrostRect(id);
      return;
    }
    const node = ref.current;
    const anchor = getFrostScene();
    if (!node || !anchor) return;
    node.measureLayout(
      anchor,
      (x, y, width, height) => {
        if (width <= 0 || height <= 0) return;
        publishFrostRect({ id, x, y, width, height, radius });
      },
      () => {},
    );
  }, [frostEnabled, id, radius]);

  useEffect(() => {
    report();
    return () => clearFrostRect(id);
  }, [frostEnabled, id, report]);

  return (
    <View
      ref={ref}
      onLayout={report}
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: 'transparent',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: material.hairline,
          shadowColor: material.shadow.color,
          shadowOffset: { width: 0, height: material.shadow.offsetY },
          shadowOpacity: material.shadow.opacity,
          shadowRadius: material.shadow.radius,
          elevation: 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
