import { View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

/** Only this much of the bevel shows. The face covers the rest. */
const RIM_PX = 1;

/**
 * The panel every overlay above the map is drawn on.
 *
 * Liquid glass, built, not blurred. `expo-blur` paints a flat tint on Android and would be
 * recomputed every frame the map moves. The bevel is a vertical gradient that only a point of
 * shows — light along the top edge, dark along the bottom — because the face is inset by
 * `RIM_PX`. The face itself is one colour. A gradient across the face is what drew a white
 * rectangle behind the type.
 *
 * Android `elevation` stays off: a translucent fill plus elevation composites as a second plate.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  const material = GLASS_MATERIAL;
  const faceRadius = Math.max(0, radius - RIM_PX);

  return (
    <View
      style={[
        {
          borderRadius: radius,
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
      <LinearGradient
        colors={[material.rimLight, material.rimShade]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderRadius: radius,
        }}
        pointerEvents="none"
      />
      <View
        style={{
          margin: RIM_PX,
          borderRadius: faceRadius,
          backgroundColor: material.fill,
          overflow: 'hidden',
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: material.rimLight,
          }}
        />
        {children}
      </View>
    </View>
  );
}
