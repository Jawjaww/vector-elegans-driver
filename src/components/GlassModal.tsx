import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  Pressable,
  Dimensions,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const isShortHeight = SCREEN_HEIGHT <= 700;

export function GlassModal({
  visible,
  onClose,
  children,
  style,
  fullscreen = false,
}: GlassModalProps) {
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
          fullscreen || isShortHeight ? styles.modalFullscreen : styles.modalDefault,
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backdropPressable: {
    flex: 1,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    position: 'relative',
  },
  modalDefault: {
    borderRadius: 12,
    maxHeight: SCREEN_HEIGHT - 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.65,
    shadowRadius: 60,
    elevation: 10,
  },
  modalFullscreen: {
    borderRadius: 0,
    maxHeight: SCREEN_HEIGHT,
    height: '100%',
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
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
    borderRadius: 12,
  },
});
