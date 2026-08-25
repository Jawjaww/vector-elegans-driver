import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, type LayoutChangeEvent } from 'react-native';
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

type SwipeVariant = 'emerald' | 'amber' | 'indigo';

const VARIANT_COLORS: Record<
  SwipeVariant,
  { track: [string, string, string]; border: string; bg: string; knobIcon: string }
> = {
  emerald: {
    track: ['#10b981', '#059669', '#047857'],
    border: '#34d399',
    bg: '#064e3b',
    knobIcon: '#059669',
  },
  amber: {
    track: ['#f59e0b', '#d97706', '#b45309'],
    border: '#fbbf24',
    bg: '#78350f',
    knobIcon: '#d97706',
  },
  indigo: {
    track: ['#6366f1', '#4f46e5', '#4338ca'],
    border: '#a5b4fc',
    bg: '#312e81',
    knobIcon: '#4f46e5',
  },
};

type NeonSwipeButtonProps = Readonly<{
  onConfirm: () => void;
  label?: string;
  variant?: SwipeVariant;
  /** Reset knob after confirm so the same button can be reused across phases */
  resetKey?: string;
}>;

export const NeonSwipeButton = ({
  onConfirm,
  label,
  variant = 'emerald',
  resetKey,
}: NeonSwipeButtonProps) => {
  const colors = VARIANT_COLORS[variant];
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

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, swipeThreshold / 2],
      [0.8, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateX: arrowTranslateX.value }],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, swipeThreshold],
      [1, 0.85],
      Extrapolation.CLAMP,
    ),
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
        { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
      onLayout={onLayout}
    >
      <Animated.View style={[StyleSheet.absoluteFill, trackStyle]}>
        <LinearGradient
          colors={colors.track}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.trackGradient}
        />
      </Animated.View>

      <View style={styles.labelContainer} pointerEvents="none">
        {label ? (
          <Animated.Text style={[styles.label, arrowStyle]} numberOfLines={1}>
            {label}
          </Animated.Text>
        ) : (
          <Animated.View style={[styles.arrowsContainer, arrowStyle]}>
            <Feather
              name="chevrons-right"
              size={24}
              color="rgba(255,255,255,0.9)"
            />
            <Feather
              name="chevrons-right"
              size={24}
              color="rgba(255,255,255,0.6)"
              style={{ marginLeft: -12 }}
            />
            <Feather
              name="chevrons-right"
              size={24}
              color="rgba(255,255,255,0.3)"
              style={{ marginLeft: -12 }}
            />
          </Animated.View>
        )}
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.knobContainer, knobStyle]}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(241, 245, 249, 0.85)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.knob}
          >
            <Feather name="chevron-right" size={28} color={colors.knobIcon} />
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
    borderWidth: 1,
    justifyContent: 'center',
    padding: 4,
    overflow: 'hidden',
  },
  trackGradient: {
    flex: 1,
    borderRadius: BUTTON_HEIGHT / 2,
  },
  labelContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: BUTTON_HEIGHT,
    zIndex: 0,
  },
  label: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
  },
});
