import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
  runOnJS,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const BUTTON_HEIGHT = 60;
// We need to account for modal padding and inner padding
// Modal width is 90% of screen width (max 400)
// Content padding is 24
const SCREEN_WIDTH = Dimensions.get('window').width;
const MODAL_WIDTH = Math.min(SCREEN_WIDTH * 0.9, 400);
const CONTENT_PADDING = 24;
const BUTTON_WIDTH = MODAL_WIDTH - (CONTENT_PADDING * 2); 
const SWIPE_THRESHOLD = BUTTON_WIDTH * 0.6;

interface NeonSwipeButtonProps {
  onConfirm: () => void;
  label?: string; // Kept for prop compatibility but unused as per request
}

export const NeonSwipeButton = ({ onConfirm }: NeonSwipeButtonProps) => {
  const translateX = useSharedValue(0);
  const context = useSharedValue({ x: 0 });
  const [swiped, setSwiped] = useState(false);
  const arrowOpacity = useSharedValue(0.8);
  const arrowTranslateX = useSharedValue(0);

  // Animate arrows
  useEffect(() => {
    arrowTranslateX.value = withRepeat(
      withSequence(
        withTiming(4, { duration: 750 }),
        withTiming(0, { duration: 750 })
      ),
      -1,
      true
    );
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { x: translateX.value };
    })
    .onUpdate((event) => {
      if (swiped) return;
      const newValue = context.value.x + event.translationX;
      translateX.value = Math.min(Math.max(newValue, 0), BUTTON_WIDTH - BUTTON_HEIGHT - 8);
    })
    .onEnd(() => {
      if (swiped) return;
      if (translateX.value > SWIPE_THRESHOLD) {
        translateX.value = withSpring(BUTTON_WIDTH - BUTTON_HEIGHT - 8);
        runOnJS(setSwiped)(true);
        runOnJS(onConfirm)();
      } else {
        translateX.value = withSpring(0);
      }
    })
    .runOnJS(true);

  const knobStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const arrowStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateX.value,
        [0, SWIPE_THRESHOLD / 2],
        [0.8, 0],
        Extrapolate.CLAMP
      ),
      transform: [{ translateX: arrowTranslateX.value }],
    };
  });

  const trackStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateX.value,
        [0, SWIPE_THRESHOLD],
        [1, 0.8],
        Extrapolate.CLAMP
      ),
    };
  });

  return (
    <View style={styles.container}>
      {/* Track Background with Neon Glow */}
      <Animated.View style={[StyleSheet.absoluteFill, trackStyle]}>
        <LinearGradient
          colors={['#10b981', '#059669', '#047857']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.trackGradient}
        />
      </Animated.View>
      
      {/* Centered Arrows instead of Text */}
      <View style={styles.labelContainer}>
        <Animated.View style={[styles.arrowsContainer, arrowStyle]}>
          <Feather name="chevrons-right" size={24} color="rgba(255,255,255,0.9)" />
          <Feather name="chevrons-right" size={24} color="rgba(255,255,255,0.6)" style={{ marginLeft: -12 }} />
          <Feather name="chevrons-right" size={24} color="rgba(255,255,255,0.3)" style={{ marginLeft: -12 }} />
        </Animated.View>
      </View>

      {/* Knob with Strong Neon Effect */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.knobContainer, knobStyle]}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.9)', 'rgba(209, 250, 229, 0.8)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.knob}
          >
            <Feather name="chevron-right" size={32} color="#059669" />
          </LinearGradient>
          {/* Knob Glow */}
          <View style={styles.knobGlow} />
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
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#34d399',
    justifyContent: 'center',
    padding: 4,
    overflow: 'visible',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 8,
  },
  trackGradient: {
    flex: 1,
    borderRadius: BUTTON_HEIGHT / 2,
  },
  shineOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderRadius: BUTTON_HEIGHT / 2,
  },
  labelContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
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
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  knobGlow: {
    position: 'absolute',
    width: BUTTON_HEIGHT,
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_HEIGHT / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 1,
  },
});
