import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GLASS_MATERIAL } from '../lib/theme';

type GlassPanelProps = Readonly<{
  children?: React.ReactNode;
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
 * A maps-style frost: backdrop blur, a thin white wash, a hairline, and a soft shadow.
 * No bevel and no corner glare — those read as a plate and hide the map.
 *
 * Android `elevation` stays off: a translucent fill plus elevation composites as a second plate.
 * `dimezisBlurView` is required or Android paints a flat tint instead of blurring.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  const material = GLASS_MATERIAL;

  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
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
      <BlurView
        intensity={material.blurIntensity}
        tint="light"
        experimentalBlurMethod={
          Platform.OS === 'android' ? 'dimezisBlurView' : undefined
        }
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      <LinearGradient
        colors={[material.fillTop, material.fillBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ borderRadius: radius }}
      >
        {children}
      </LinearGradient>
    </View>
  );
}
