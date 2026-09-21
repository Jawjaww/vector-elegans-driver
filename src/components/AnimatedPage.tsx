import React, { useEffect } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AnimatedPageProps {
  children: React.ReactNode;
  style?: ViewStyle;
  delay?: number;
  /**
   * Present without entry motion. Used when the page is the answer to the driver's own
   * gesture — a notification tap: they are already looking at the screen, so a 300 ms fade is
   * not polish, it is latency. The shared values start at their resting position, so nothing
   * is ever painted invisible waiting for an animation to finish.
   */
  instant?: boolean;
}

export function AnimatedPage({
  children,
  style,
  delay = 0,
  instant = false,
}: Readonly<AnimatedPageProps>) {
  const opacity = useSharedValue(instant ? 1 : 0);
  const translateY = useSharedValue(instant ? 0 : 15);

  useEffect(() => {
    if (instant) return undefined;
    const timeout = setTimeout(() => {
      opacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      });
    }, delay);

    return () => clearTimeout(timeout);
  }, [delay, instant]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.container, style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
