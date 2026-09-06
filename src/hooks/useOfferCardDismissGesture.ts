/**
 * Optional vertical-handle pan (does not fight a horizontal list).
 * Front-card swipe uses `useOfferDismissGesture` in OfferRideCarousel (cycle, not decline).
 */
import type { SharedValue } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Dimensions } from 'react-native';
import {
  computeDismissExitTarget,
  shouldCompleteDismiss,
} from '../lib/utils/offerDismissGesture';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type UseOfferCardDismissGestureArgs = {
  enabled: boolean;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  onDismiss: () => void;
};

/** Pan gesture for the dismiss handle — does not compete with carousel horizontal scroll. */
export function useOfferCardDismissGesture({
  enabled,
  translateX,
  translateY,
  onDismiss,
}: UseOfferCardDismissGestureArgs) {
  return Gesture.Pan()
    .enabled(enabled)
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      'worklet';
      const complete = shouldCompleteDismiss(
        event.translationX,
        event.translationY,
        event.velocityX,
        event.velocityY,
        SCREEN_WIDTH,
        SCREEN_HEIGHT,
      );

      if (!complete) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        return;
      }

      const target = computeDismissExitTarget(
        event.translationX,
        event.translationY,
        event.velocityX,
        event.velocityY,
        SCREEN_WIDTH,
        SCREEN_HEIGHT,
      );
      translateX.value = withSpring(target.x, {
        damping: 20,
        stiffness: 100,
        velocity: event.velocityX,
      });
      translateY.value = withSpring(target.y, {
        damping: 20,
        stiffness: 100,
        velocity: event.velocityY,
      });
      scheduleOnRN(onDismiss);
    });
}
