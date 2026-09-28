import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { VE_BLUE } from '../../lib/theme';

/** Reanimated NativeWind gradients are ignored — paint the fill with LinearGradient. */
export function DossierProgressFill({
  animatedStyle,
  height,
}: Readonly<{
  animatedStyle: StyleProp<ViewStyle>;
  height: number;
}>) {
  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          height,
          borderRadius: 9999,
          overflow: 'hidden',
          backgroundColor: VE_BLUE.base,
        },
      ]}
    >
      <LinearGradient
        colors={[...VE_BLUE.gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height, width: '100%' }}
      />
    </Animated.View>
  );
}

/** Absolute fill for primary wizard CTAs (next, submit) — same ramp as the progress bar. */
export function DossierAccentGradientFill() {
  return (
    <LinearGradient
      colors={[...VE_BLUE.gradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={StyleSheet.absoluteFill}
    />
  );
}
