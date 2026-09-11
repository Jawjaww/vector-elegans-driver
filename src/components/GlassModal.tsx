import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface GlassModalProps {
  visible: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  fullscreen?: boolean;
}

const SIDE_INSET = 20;
const MAX_CARD_WIDTH = 420;

export function GlassModal({
  visible,
  onClose,
  children,
  style,
  fullscreen = false,
}: Readonly<GlassModalProps>) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardWidth = Math.min(MAX_CARD_WIDTH, Math.max(0, screenWidth - SIDE_INSET * 2));
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.98);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.ease),
      });
      scale.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.ease),
      });
    } else {
      opacity.value = withTiming(0, {
        duration: 180,
        easing: Easing.in(Easing.ease),
      });
      scale.value = withTiming(0.98, {
        duration: 180,
        easing: Easing.in(Easing.ease),
      });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const modalStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={styles.backdropPressable} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.modal,
          fullscreen
            ? styles.modalFullscreen
            : [
                styles.modalDefault,
                { width: cardWidth, maxHeight: screenHeight - 48 },
              ],
          modalStyle,
          style,
        ]}
      >
        <View style={styles.glassOverlay} />
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  backdropPressable: {
    flex: 1,
  },
  modal: {
    overflow: 'hidden',
    position: 'relative',
  },
  modalDefault: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.65,
    shadowRadius: 60,
    elevation: 10,
  },
  modalFullscreen: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 5,
  },
  content: {
    position: 'relative',
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.008)',
    borderRadius: 16,
  },
});
