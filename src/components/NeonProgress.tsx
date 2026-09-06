import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** Pill-shaped inset groove (semicircle caps) — glass chrome, no black scrim. */
export const INSET_PROGRESS_HEIGHT = 6;
export const INSET_PROGRESS_RADIUS = INSET_PROGRESS_HEIGHT / 2;

export const NEON_PROGRESS_INSET_GROOVE = {
  height: INSET_PROGRESS_HEIGHT,
  borderRadius: INSET_PROGRESS_RADIUS,
  backgroundColor: 'rgba(255,255,255,0.07)',
  borderWidth: 1,
  borderTopColor: 'rgba(0,0,0,0.12)',
  borderBottomColor: 'rgba(255,255,255,0.14)',
  borderLeftColor: 'rgba(0,0,0,0.08)',
  borderRightColor: 'rgba(255,255,255,0.1)',
  overflow: 'hidden' as const,
} as const;

interface NeonProgressProps {
  durationMs: number;
  startKey: number;
  onExpire?: () => void;
  /** inset = pill groove; band = flush underline under the price row. */
  variant?: 'default' | 'inset' | 'band';
}

// Worklet function must be defined outside or with 'worklet' directive
function getProgressColor(p: number) {
  'worklet';
  if (p > 0.5) return '#10ff8c';
  if (p > 0.25) return '#fbbf24';
  return '#f43f5e';
}

export function NeonProgress({
  durationMs,
  startKey,
  onExpire,
  variant = 'default',
}: Readonly<NeonProgressProps>) {
  const inset = variant === 'inset';
  const band = variant === 'band';
  const progress = useSharedValue(1);
  const colorProgress = useSharedValue(0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    progress.value = 1;
    colorProgress.value = 0;

    progress.value = withTiming(0, {
      duration: durationMs,
      easing: Easing.linear,
    }, (finished) => {
      if (finished && onExpireRef.current) {
        scheduleOnRN(onExpireRef.current);
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
    <View
      style={[
        styles.container,
        inset || band ? styles.containerInset : null,
      ]}
    >
      <View
        style={[
          styles.track,
          inset ? styles.trackInset : null,
          band ? styles.trackBand : null,
        ]}
      >
        <Animated.View
          style={[
            styles.progress,
            inset ? styles.progressInset : null,
            band ? styles.progressBand : null,
            progressStyle,
          ]}
        >
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
  containerInset: {
    height: undefined,
    paddingHorizontal: 0,
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackInset: {
    ...NEON_PROGRESS_INSET_GROOVE,
  },
  trackBand: {
    height: 3,
    borderRadius: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progress: {
    height: '100%',
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  progressInset: {
    borderRadius: INSET_PROGRESS_RADIUS,
  },
  progressBand: {
    borderRadius: 0,
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});
