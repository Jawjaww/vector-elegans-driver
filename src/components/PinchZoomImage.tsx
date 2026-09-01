import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MIN_SCALE = 0.4;
const MAX_SCALE = 6;

export type PinchZoomTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type PinchZoomImageHandle = {
  getTransform: () => PinchZoomTransform;
  reset: () => void;
  setMinScale: (value: number) => void;
};

type PinchZoomImageProps = {
  uri: string;
  onImageSize?: (width: number, height: number) => void;
  minScale?: number;
};

export const PinchZoomImage = forwardRef<
  PinchZoomImageHandle,
  PinchZoomImageProps
>(function PinchZoomImage({ uri, onImageSize, minScale = 1 }, ref) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const minScaleRef = useSharedValue(Math.max(minScale, MIN_SCALE));

  const applyMinScale = (value: number) => {
    const next = Math.max(value, MIN_SCALE);
    minScaleRef.value = next;
    if (scale.value < next) {
      scale.value = next;
      savedScale.value = next;
    }
  };

  useEffect(() => {
    applyMinScale(minScale);
  }, [minScale]);

  useImperativeHandle(ref, () => ({
    getTransform: () => ({
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    }),
    reset: () => {
      const next = minScaleRef.value;
      scale.value = withTiming(next);
      savedScale.value = next;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedX.value = 0;
      savedY.value = 0;
    },
    setMinScale: applyMinScale,
  }));

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clamp(
        savedScale.value * event.scale,
        minScaleRef.value,
        MAX_SCALE,
      );
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onUpdate((event) => {
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = minScaleRef.value;
      scale.value = withTiming(next);
      savedScale.value = next;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedX.value = 0;
      savedY.value = 0;
    });

  const composed = Gesture.Exclusive(
    doubleTap,
    Gesture.Simultaneous(pinch, pan),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={styles.fill}>
        <Animated.Image
          source={{ uri }}
          style={[styles.image, animatedStyle]}
          resizeMode="contain"
          onLoad={(event) => {
            const { width, height } = event.nativeEvent.source;
            onImageSize?.(width, height);
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
