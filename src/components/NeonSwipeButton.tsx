import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const BUTTON_HEIGHT = 56;
const FALLBACK_WIDTH = 280;

export type SwipeVariant = 'emerald' | 'amber' | 'indigo';

/**
 * Visual chrome clones the login Sign In pill:
 * vibrant 3-stop gradient + left white glass sheen + soft glow.
 * Only colors / label change per variant.
 */
const VARIANT: Record<
  SwipeVariant,
  {
    track: [string, string, string];
    glow: string;
    knobIcon: string;
  }
> = {
  emerald: {
    track: ['#10b981', '#4ade80', '#2dd4bf'],
    glow: '#22c55e',
    knobIcon: '#059669',
  },
  amber: {
    track: ['#f59e0b', '#fbbf24', '#fb923c'],
    glow: '#f59e0b',
    knobIcon: '#d97706',
  },
  indigo: {
    track: ['#6366f1', '#818cf8', '#22d3ee'],
    glow: '#6366f1',
    knobIcon: '#4f46e5',
  },
};

type NeonSwipeButtonProps = Readonly<{
  onConfirm: () => void;
  label?: string;
  variant?: SwipeVariant;
  resetKey?: string;
}>;

export const NeonSwipeButton = ({
  onConfirm,
  label,
  variant = 'emerald',
  resetKey,
}: NeonSwipeButtonProps) => {
  const colors = VARIANT[variant];
  const translateX = useSharedValue(0);
  const context = useSharedValue({ x: 0 });
  const [swiped, setSwiped] = useState(false);
  const [trackWidth, setTrackWidth] = useState(FALLBACK_WIDTH);
  const arrowTranslateX = useSharedValue(0);

  const maxTravel = Math.max(trackWidth - BUTTON_HEIGHT - 8, 0);
  const swipeThreshold = maxTravel * 0.6;

  useEffect(() => {
    arrowTranslateX.value = withRepeat(
      withSequence(
        withTiming(4, { duration: 750 }),
        withTiming(0, { duration: 750 }),
      ),
      -1,
      true,
    );
  }, [arrowTranslateX]);

  useEffect(() => {
    setSwiped(false);
    translateX.value = withSpring(0);
  }, [resetKey, translateX]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          context.value = { x: translateX.value };
        })
        .onUpdate((event) => {
          if (swiped) return;
          const newValue = context.value.x + event.translationX;
          translateX.value = Math.min(Math.max(newValue, 0), maxTravel);
        })
        .onEnd(() => {
          if (swiped) return;
          if (translateX.value > swipeThreshold) {
            translateX.value = withSpring(maxTravel);
            scheduleOnRN(setSwiped, true);
            scheduleOnRN(onConfirm);
          } else {
            translateX.value = withSpring(0);
          }
        }),
    [swiped, maxTravel, swipeThreshold, onConfirm, context, translateX],
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, swipeThreshold / 2],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateX: arrowTranslateX.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - trackWidth) > 1) {
      setTrackWidth(w);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          shadowColor: colors.glow,
        },
      ]}
      onLayout={onLayout}
    >
      {/* Sign In base gradient */}
      <LinearGradient
        colors={colors.track}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Sign In white glass sheen (left band) */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.35)',
          'rgba(255,255,255,0.15)',
          'rgba(255,255,255,0)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.sheen}
        pointerEvents="none"
      />

      <View style={styles.labelContainer} pointerEvents="none">
        {label ? (
          <Animated.Text style={[styles.label, contentStyle]} numberOfLines={1}>
            {label}
          </Animated.Text>
        ) : (
          <Animated.View style={[styles.arrowsContainer, contentStyle]}>
            <Feather
              name="chevrons-right"
              size={22}
              color="rgba(255,255,255,0.95)"
            />
            <Feather
              name="chevrons-right"
              size={22}
              color="rgba(255,255,255,0.65)"
              style={{ marginLeft: -10 }}
            />
            <Feather
              name="chevrons-right"
              size={22}
              color="rgba(255,255,255,0.35)"
              style={{ marginLeft: -10 }}
            />
          </Animated.View>
        )}
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.knobContainer, knobStyle]}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.55)', 'rgba(241, 245, 249, 0.35)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.knob}
          >
            <Feather name="chevron-right" size={26} color={colors.knobIcon} />
          </LinearGradient>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_HEIGHT / 2,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  sheen: {
    position: 'absolute',
    left: 4,
    right: '30%',
    top: 4,
    bottom: 4,
    borderRadius: 9999,
  },
  labelContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: BUTTON_HEIGHT,
    zIndex: 0,
  },
  label: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.3,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  arrowsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobContainer: {
    position: 'absolute',
    left: 4,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  knob: {
    width: BUTTON_HEIGHT - 8,
    height: BUTTON_HEIGHT - 8,
    borderRadius: (BUTTON_HEIGHT - 8) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.45)',
  },
});
