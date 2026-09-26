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
}>;

/** Kept at zero: the frost is one sheet, not a beveled inset. */
export const GLASS_PANEL_BEVEL_PX = 0;

export const GLASS_PANEL_BEVEL_INSET = GLASS_PANEL_BEVEL_PX * 2;

/**
 * The panel every overlay above the map is drawn on.
 *
 * The view itself is clear except for the hairline. The frost (a blurred copy of the map,
 * then a thin white wash) is painted in the map document on this same rectangle, measured
 * against the map scene — not the window — so the wash cannot sit below the border.
 *
 * Android `elevation` stays off: a shadow on a clear view composites as a second plate.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  const id = useId();
  const ref = useRef<View>(null);
  const material = GLASS_MATERIAL;

  const report = useCallback(() => {
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
  }, [id, radius]);

  useEffect(() => {
    let alive = true;
    let raf = 0;
    const loop = () => {
      if (!alive) return;
      report();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearFrostRect(id);
    };
  }, [id, report]);

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
