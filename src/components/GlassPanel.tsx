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
 * The same pill as the reservation map on the Next.js client: a pale white veil, a white
 * hairline, dark type, a soft shadow. `TripStatsBadge` can blur the map behind it; this screen
 * cannot — `expo-blur` paints a flat tint on Android and would be recomputed every frame the
 * driver moves — so the veil is a step more opaque than `bg-white/55` and still reads as glass.
 *
 * One fill. A second gradient over the type is what drew the white rectangle. Android
 * `elevation` stays off for the same reason.
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
