import { View, type StyleProp, type ViewStyle } from 'react-native';
import { GLASS_MATERIAL } from '../lib/theme';

type GlassPanelProps = Readonly<{
  children?: React.ReactNode;
  /**
   * Corner radius. A prop rather than a utility class: callers pass 16, 18, 24 and 999, and a
   * static class cannot express a value the caller chooses.
   */
  radius: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * The panel every overlay above the map is drawn on.
 *
 * One fill, one rim. A diagonal gradient, a white edge glow and a second translucent plate under
 * them each painted a lighter rectangle across the type: on a short bar the light stop lands on
 * the first line, which is the band drivers kept reporting. Android `elevation` on a translucent
 * view does the same thing, so the shadow is iOS-only.
 *
 * `expo-blur` stays out. On Android it defaults to `BlurMethod.NONE` and paints a flat tint, and
 * over a map that never holds still a real blur would be recomputed every frame.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  const material = GLASS_MATERIAL;

  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: material.fill,
          borderWidth: 1,
          borderColor: material.rim,
          overflow: 'hidden',
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
