/**
 * Swipe-to-cycle: pan the front offer like a playing card (translate + rotateZ)
 * then cycleAvailableRideToBack. Decline stays on the Refuser button only.
 *
 * Each stacked card owns this hook so the pan gesture and transform never
 * migrate from one GestureDetector to another (RNGH / first-swipe-only bug).
 *
 * Geometry is inlined in the gesture worklet — importing JS helpers from
 * offerDismissGesture.ts would crash Reanimated / Expo Go on the UI thread.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, Dimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EXIT_MS = 220;
const DRAG_THRESHOLD = SCREEN_WIDTH * 0.28;
const EXIT_X = SCREEN_WIDTH * 0.95;
const DRAG_ROTATE_DEG = 12;
const EXIT_ROTATE_DEG = 14;
const SPRING = { damping: 20, stiffness: 300 };

type UseOfferDismissGestureOptions = {
  enabled: boolean;
  rideId?: string | null;
  onCycle: () => void;
  /** Shared deck lift (0–1). Written only while this card is the front. */
  dragProgress: SharedValue<number>;
};

export function useOfferDismissGesture({
  enabled,
  rideId,
  onCycle,
  dragProgress,
}: UseOfferDismissGestureOptions): {
  animatedStyle: AnimatedStyle<ViewStyle>;
  panGesture: ReturnType<typeof Gesture.Pan>;
  notifyMapInteract: () => void;
  resetTransform: () => void;
} {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotateZ = useSharedValue(0);
  const mapInteracting = useSharedValue(false);
  const mapInteractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCycleRef = useRef(onCycle);
  onCycleRef.current = onCycle;

  const snapToRest = useCallback(() => {
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    cancelAnimation(rotateZ);
    translateX.value = 0;
    translateY.value = 0;
    rotateZ.value = 0;
    if (enabled) {
      cancelAnimation(dragProgress);
      dragProgress.value = 0;
    }
  }, [dragProgress, enabled, rotateZ, translateX, translateY]);

  useEffect(() => {
    snapToRest();
  }, [rideId, enabled, snapToRest]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', () => {
      snapToRest();
    });
    return () => sub.remove();
  }, [snapToRest]);

  const notifyMapInteract = useCallback(() => {
    mapInteracting.value = true;
    if (mapInteractTimerRef.current) {
      clearTimeout(mapInteractTimerRef.current);
    }
    mapInteractTimerRef.current = setTimeout(() => {
      mapInteracting.value = false;
      mapInteractTimerRef.current = null;
    }, 900);
  }, [mapInteracting]);

  const finishCycle = useCallback(() => {
    snapToRest();
    onCycleRef.current();
  }, [snapToRest]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateZ: `${rotateZ.value}deg` },
    ],
  })) as AnimatedStyle<ViewStyle>;

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .maxPointers(1)
        .activeOffsetX([-20, 20])
        .failOffsetY([-56, 56])
        .onUpdate((event) => {
          'worklet';
          if (mapInteracting.value) return;
          translateX.value = event.translationX;
          translateY.value = event.translationY * 0.15;
          rotateZ.value = (event.translationX / SCREEN_WIDTH) * DRAG_ROTATE_DEG;
          const absX = Math.abs(event.translationX);
          dragProgress.value = Math.min(1, absX / DRAG_THRESHOLD);
        })
        .onEnd((event) => {
          'worklet';
          if (mapInteracting.value) {
            translateX.value = withSpring(0, SPRING);
            translateY.value = withSpring(0, SPRING);
            rotateZ.value = withSpring(0, SPRING);
            dragProgress.value = withSpring(0, SPRING);
            return;
          }

          const translationX = event.translationX;
          const complete =
            Math.abs(translationX) > DRAG_THRESHOLD ||
            Math.abs(event.velocityX) > 800;

          if (!complete) {
            translateX.value = withSpring(0, SPRING);
            translateY.value = withSpring(0, SPRING);
            rotateZ.value = withSpring(0, SPRING);
            dragProgress.value = withSpring(0, SPRING);
            return;
          }

          const dir = translationX >= 0 ? 1 : -1;
          const cfg = { duration: EXIT_MS };
          dragProgress.value = withTiming(1, cfg);
          translateX.value = withTiming(dir * EXIT_X, cfg);
          rotateZ.value = withTiming(dir * EXIT_ROTATE_DEG, cfg);
          translateY.value = withTiming(translateY.value, cfg, (finished) => {
            'worklet';
            if (finished) {
              scheduleOnRN(finishCycle);
            }
          });
        }),
    [
      dragProgress,
      enabled,
      finishCycle,
      mapInteracting,
      rideId,
      rotateZ,
      translateX,
      translateY,
    ],
  );

  return {
    animatedStyle,
    panGesture,
    notifyMapInteract,
    resetTransform: snapToRest,
  };
}
