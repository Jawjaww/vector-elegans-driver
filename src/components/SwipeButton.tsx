import React from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const BUTTON_HEIGHT = 55;
const BUTTON_WIDTH = Dimensions.get('window').width - 60; // Padding from card
const SWIPE_THRESHOLD = BUTTON_WIDTH * 0.6;

interface SwipeButtonProps {
  onSwipeSuccess: () => void;
  label?: string;
}

export const SwipeButton = ({ onSwipeSuccess, label }: SwipeButtonProps) => {
  const { t } = useTranslation();
  const translateX = useSharedValue(0);
  const context = useSharedValue({ x: 0 });
  const [swiped, setSwiped] = React.useState(false);

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { x: translateX.value };
    })
    .onUpdate((event) => {
      if (swiped) return;
      const newValue = context.value.x + event.translationX;
      // Clamp between 0 and max width
      translateX.value = Math.min(Math.max(newValue, 0), BUTTON_WIDTH - BUTTON_HEIGHT - 10);
    })
    .onEnd(() => {
      if (swiped) return;
      if (translateX.value > SWIPE_THRESHOLD) {
        translateX.value = withSpring(BUTTON_WIDTH - BUTTON_HEIGHT - 10);
        runOnJS(setSwiped)(true);
        runOnJS(onSwipeSuccess)();
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const textOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateX.value,
        [0, SWIPE_THRESHOLD],
        [1, 0],
        Extrapolate.CLAMP
      ),
    };
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(16, 185, 129, 0.8)', 'rgba(5, 150, 105, 0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.background}
      />
      
      <Animated.Text style={[styles.text, textOpacityStyle]}>
        {label || t('ride.swipeToAccept')}
      </Animated.Text>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.thumb, animatedStyle]}>
          <Feather name="chevrons-right" size={24} color="#047857" />
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: BUTTON_HEIGHT,
    width: '100%',
    borderRadius: BUTTON_HEIGHT / 2,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(16, 185, 129, 0.2)', // Faint green track
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.2,
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    letterSpacing: 1,
    zIndex: 1,
  },
  thumb: {
    height: BUTTON_HEIGHT - 8,
    width: BUTTON_HEIGHT - 8,
    borderRadius: (BUTTON_HEIGHT - 8) / 2,
    backgroundColor: '#fff',
    position: 'absolute',
    left: 4,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 2,
  },
});
