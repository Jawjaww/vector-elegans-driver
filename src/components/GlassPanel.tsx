import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
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

/** Kept at zero: the bevel is outside the card, so the content is not inset. */
export const GLASS_PANEL_BEVEL_PX = 0;

export const GLASS_PANEL_BEVEL_INSET = GLASS_PANEL_BEVEL_PX * 2;

/**
 * The panel every overlay above the map is drawn on.
 *
 * The view itself is clear, with no border: a hairline is too thin to carry a highlight,
 * and a stroke drawn on this view sits on the face. The frost (a light blur, then a flat
 * white wash) is painted in the map document on this rectangle. The bevel is a separate
 * band outside it. Measured against the map scene — not the window — so the wash cannot
 * slip off the card.
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
          borderWidth: 0,
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
