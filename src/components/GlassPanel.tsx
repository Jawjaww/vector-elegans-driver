import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GLASS_MATERIAL } from '../lib/theme';
import { clearFrostRect, publishFrostRect } from '../map/frostRects';

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
 * The view itself is clear. The frost (a blurred copy of the map, then a thin white wash)
 * is painted in the map document, aligned to this frame. A native blur samples the window
 * behind the WebView and then covers it with an opaque tint, so the map never shows through.
 *
 * Android `elevation` stays off: a shadow on a clear view composites as a second plate.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  const id = useId();
  const ref = useRef<View>(null);
  const material = GLASS_MATERIAL;

  const report = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      publishFrostRect({ id, x, y, width, height, radius });
    });
  }, [id, radius]);

  useEffect(() => {
    report();
    return () => clearFrostRect(id);
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
