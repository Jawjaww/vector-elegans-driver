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

/** The lit rim is one point; the face sits inside it. */
const RIM_PX = 1;

/**
 * The panel every overlay above the map is drawn on.
 *
 * Two full-height gradients, never a band over the type. The outer one is the bevel: light at the
 * top edge, dark at the bottom, and only a point of it shows because the face is inset by
 * `RIM_PX`. The inner one is the notification wash — a grey that is lighter at the top and a step
 * darker at the bottom, the same on every pixel of a given row, so it cannot draw a rectangle
 * behind the first line.
 *
 * Android `elevation` stays off. A translucent fill plus elevation composites as a lighter plate
 * behind the content. The shadow is iOS-only.
 *
 * `expo-blur` stays out. On Android it defaults to `BlurMethod.NONE` and paints a flat tint, and
 * over a map that never holds still a real blur would be recomputed every frame.
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
        {children}
      </LinearGradient>
    </View>
  );
}
