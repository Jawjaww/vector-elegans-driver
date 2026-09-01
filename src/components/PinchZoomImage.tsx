import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const MIN_SCALE = 0.4;
const MAX_SCALE = 6;
const PREVIEW_MAX_SCALE = 10;
const PREVIEW_DOUBLE_TAP_SCALE = 3;

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
  /** crop = document framing; preview = full-screen viewer */
  mode?: 'crop' | 'preview';
  onPreviewBackgroundTap?: () => void;
};

const SPRING_CONFIG = { damping: 22, stiffness: 280, mass: 0.7 };

export const PinchZoomImage = forwardRef<
  PinchZoomImageHandle,
  PinchZoomImageProps
>(function PinchZoomImage(
  {
    uri,
    onImageSize,
    minScale = 1,
    mode = 'crop',
    onPreviewBackgroundTap,
  },
  ref,
) {
  const isPreview = mode === 'preview';
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const minScaleRef = useSharedValue(Math.max(minScale, MIN_SCALE));
  const maxScaleRef = useSharedValue(isPreview ? PREVIEW_MAX_SCALE : MAX_SCALE);

  const applyMinScale = (value: number) => {
    const next = Math.max(value, MIN_SCALE);
    minScaleRef.value = next;
    if (scale.value < next) {
      scale.value = next;
      savedScale.value = next;
    }
  };

  const resetTransform = (animated: boolean) => {
    const next = minScaleRef.value;
    if (animated) {
      scale.value = withSpring(next, SPRING_CONFIG);
      translateX.value = withSpring(0, SPRING_CONFIG);
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      scale.value = next;
      translateX.value = 0;
      translateY.value = 0;
    }
    savedScale.value = next;
    savedX.value = 0;
    savedY.value = 0;
  };

  useEffect(() => {
    applyMinScale(minScale);
    maxScaleRef.value = isPreview ? PREVIEW_MAX_SCALE : MAX_SCALE;
  }, [minScale, isPreview]);

  useImperativeHandle(ref, () => ({
    getTransform: () => ({
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    }),
    reset: () => {
      resetTransform(true);
    },
    setMinScale: applyMinScale,
  }));

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      const sensitivity = isPreview ? 1.45 : 1;
      const nextScale = savedScale.value * event.scale ** sensitivity;
      scale.value = clamp(nextScale, minScaleRef.value, maxScaleRef.value);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .averageTouches(true)
    .onBegin(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (isPreview && scale.value <= minScaleRef.value + 0.02) {
        return;
      }
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd(() => {
      if (isPreview) {
        const zoomedIn = scale.value > minScaleRef.value + 0.08;
        const target = zoomedIn
          ? minScaleRef.value
          : Math.min(PREVIEW_DOUBLE_TAP_SCALE, maxScaleRef.value);
        scale.value = withSpring(target, SPRING_CONFIG);
        savedScale.value = target;
        if (zoomedIn) {
          translateX.value = withSpring(0, SPRING_CONFIG);
          translateY.value = withSpring(0, SPRING_CONFIG);
          savedX.value = 0;
          savedY.value = 0;
        }
        return;
      }

      resetTransform(true);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .maxDistance(14)
    .onEnd(() => {
      if (
        isPreview &&
        onPreviewBackgroundTap &&
        scale.value <= minScaleRef.value + 0.05
      ) {
        runOnJS(onPreviewBackgroundTap)();
      }
    });

  const composed = isPreview
    ? Gesture.Simultaneous(
        pinch,
        pan,
        Gesture.Exclusive(doubleTap, singleTap),
      )
    : Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

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
    overflow: 'visible',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
