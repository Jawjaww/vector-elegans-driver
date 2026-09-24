import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GlassPanel } from './GlassPanel';
import { GLASS_MATERIAL } from '../lib/theme';
import {
  LIFT_OVER_INSTRUCTION,
  MAP_CONTROL_SIZE,
} from '../lib/utils/overlayLane';
import {
  GUIDANCE_EMERGE_MS,
  GUIDANCE_RETRACT_MS,
} from '../lib/utils/tripGuidancePeek';

/** The face inside the rim, so the panel keeps the footprint rather than growing by two points. */
const FACE = MAP_CONTROL_SIZE - 2;

type MapRecenterButtonProps = Readonly<{
  visible: boolean;
  bottom: number;
  navigationMode?: boolean;
  /**
   * Rise above the instruction bar while it is on screen.
   *
   * Not a nicety. This control and the bar occupy the same strip above the sheet, and the control
   * is the one that takes touches, so without the lift it is drawn straight across the sentence
   * the driver is reading — which is what it used to do. Animated rather than jumped for the same
   * reason the arrival chip animates: the bar leaves on its own once the driver is moving, and a
   * control left behind would be floating over an empty slot.
   */
  aboveGuidanceBar?: boolean;
  onPress: () => void;
}>;

/**
 * Uber-like “my location” control when map follow is paused.
 *
 * Drawn on the same `GlassPanel` as every other overlay above the map, with the panel's blue
 * accent for the glyph. It used to be an opaque white disc with a dark teal icon — a second
 * material invented for one button, which is why it looked like a stray widget next to the
 * panels it floats between.
 */
export function MapRecenterButton({
  visible,
  bottom,
  navigationMode = false,
  aboveGuidanceBar = false,
  onPress,
}: MapRecenterButtonProps) {
  const lift = useRef(new Animated.Value(aboveGuidanceBar ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(lift, {
      toValue: aboveGuidanceBar ? 1 : 0,
      duration: aboveGuidanceBar ? GUIDANCE_EMERGE_MS : GUIDANCE_RETRACT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [lift, aboveGuidanceBar]);

  // After the hook, never before: an early return above it would change the hook count between a
  // visible and a hidden control.
  if (!visible) return null;

  return (
    <Animated.View
      // The anchor spans the lane; only the control itself is touchable.
      pointerEvents="box-none"
      className="absolute right-4"
      style={{
        bottom,
        // Layer scale on the home scene (see BottomSheet.styles.sceneFill):
        // map 0 → trip HUDs 15 → offer stack 30 → this control 35 → sheet 40/41.
        // It must stay UNDER the sheet so a raised sheet covers it, and above the
        // HUDs so it stays tappable when they are visible.
        zIndex: 35,
        transform: [
          {
            translateY: lift.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -LIFT_OVER_INSTRUCTION],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Recentrer sur ma position"
        hitSlop={8}
      >
        <GlassPanel radius={MAP_CONTROL_SIZE / 2}>
          <View
            className="items-center justify-center"
            style={{ width: FACE, height: FACE }}
          >
            <Feather
              name={navigationMode ? 'navigation' : 'crosshair'}
              size={22}
              color={GLASS_MATERIAL.accentStrong}
            />
          </View>
        </GlassPanel>
      </Pressable>
    </Animated.View>
  );
}
