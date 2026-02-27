import React from 'react';
import { Pressable, Text, PressableProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

type ButtonVariant = 'primary' | 'secondary' | 'outline';
type ButtonSize = 'small' | 'medium' | 'large';

interface ElegantButtonProps extends PressableProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ElegantButton({ 
  title, 
  onPress, 
  disabled = false, 
  loading = false,
  variant = 'primary',
  size = 'medium',
  className = '',
  ...props 
}: ElegantButtonProps) {
  const { t } = useTranslation();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = pressed.value > 0.5 
      ? '#3a5f88' 
      : '#4a77a8';

    return {
      backgroundColor,
      opacity: disabled ? 0.5 : 1,
      transform: [{ scale: withSpring(pressed.value > 0.5 ? 0.98 : 1) }],
    };
  });

  const sizeStyles = {
    small: 'px-3 py-2',
    medium: 'px-4 py-3',
    large: 'px-6 py-4',
  };

  const variantStyles = {
    primary: 'bg-[#4a77a8] border-[#4a77a8]',
    secondary: 'bg-white/10 border-white/20',
    outline: 'bg-transparent border-white/30',
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || false, busy: loading || false }}
      onPressIn={() => (pressed.value = withTiming(1, { duration: 100 }))}
      onPressOut={() => (pressed.value = withTiming(0, { duration: 150 }))}
      style={animatedStyle}
      className={`rounded-xl border ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      <Animated.Text 
        style={{ color: '#ffffff' }}
        className="text-center font-semibold text-base"
      >
        {loading ? t('common.loading') + '...' : title}
      </Animated.Text>
    </AnimatedPressable>
  );
}
