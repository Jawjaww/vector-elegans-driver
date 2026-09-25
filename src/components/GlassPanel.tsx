import { View, type StyleProp, type ViewStyle } from 'react-native';
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

/** Bevel thickness on the contour. Face is inset by this much. */
export const GLASS_PANEL_BEVEL_PX = 2;

export const GLASS_PANEL_BEVEL_INSET = GLASS_PANEL_BEVEL_PX * 2;

/**
 * The panel every overlay above the map is drawn on.
 *
 * The face stays a flat grey wash. The contour is a separate bevel: a bright rim on top, a dimmer
 * one on the bottom, plus corner glares in the top and bottom corners only — never a band across
 * the type.
 *
 * Android `elevation` stays off: a translucent fill plus elevation composites as a second plate.
 */
export function GlassPanel({ children, radius, style }: GlassPanelProps) {
  const material = GLASS_MATERIAL;
  const faceRadius = Math.max(0, radius - GLASS_PANEL_BEVEL_PX);
  const cornerSize = Math.min(56, Math.max(28, radius * 1.4));

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
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderRadius: radius,
        }}
      />
      <View
        style={{
          margin: GLASS_PANEL_BEVEL_PX,
          borderRadius: faceRadius,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={[material.fillTop, material.fillBottom]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ borderRadius: faceRadius }}
        >
          {children}
        </LinearGradient>
        <LinearGradient
          pointerEvents="none"
          colors={[material.cornerGlowTop, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: cornerSize,
            height: cornerSize,
          }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[material.cornerGlowBottom, 'transparent']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: cornerSize,
            height: cornerSize,
          }}
        />
      </View>
    </View>
  );
}
