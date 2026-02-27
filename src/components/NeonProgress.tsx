import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

interface NeonProgressProps {
  durationMs: number;
  startKey: number;
  onExpire?: () => void;
}

// Worklet function must be defined outside or with 'worklet' directive
function getProgressColor(p: number) {
  'worklet';
  if (p > 0.5) return '#10ff8c';
  if (p > 0.25) return '#fbbf24';
  return '#f43f5e';
}

export function NeonProgress({ durationMs, startKey, onExpire }: NeonProgressProps) {
  const progress = useSharedValue(1);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    progress.value = 1;
    colorProgress.value = 0;

    progress.value = withTiming(0, {
      duration: durationMs,
      easing: Easing.linear,
    }, (finished) => {
      if (finished && onExpire) {
        runOnJS(onExpire)();
      }
    });

    const colorDuration = durationMs * 0.75;
    colorProgress.value = withTiming(1, {
      duration: colorDuration,
      easing: Easing.linear,
    });
  }, [startKey, durationMs]);

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${progress.value * 100}%`,
      backgroundColor: getProgressColor(progress.value),
    };
  });

  const shimmerStyle = useAnimatedStyle(() => {
    return {
      opacity: 0.4 + (1 - progress.value) * 0.4,
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <Animated.View style={[styles.progress, progressStyle]}>
          <Animated.View style={[styles.shimmer, shimmerStyle]} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progress: {
    height: '100%',
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});
