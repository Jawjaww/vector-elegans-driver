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

/** The white bevel. Two points, so it reads on a pale map. The face covers the rest. */
const RIM_PX = 2;

/**
 * The panel every overlay above the map is drawn on.
 *
 * Liquid glass, built, not blurred. The face is a full-height grey wash, lighter at the top.
 * The contour is white on every side and only brighter along the top, `RIM_PX` thick, because
 * the face is inset by that much. A dark rim on a pale map disappears, and a one-point rim
 * does too.
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
      <LinearGradient
        colors={[material.fillTop, material.fillBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          margin: RIM_PX,
          borderRadius: faceRadius,
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
      </LinearGradient>
    </View>
  );
}
