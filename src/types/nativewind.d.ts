import 'nativewind';
import type { ViewStyle, TextStyle, ImageStyle, TextInputProps, PressableProps, ScrollViewProps, KeyboardAvoidingViewProps, ActivityIndicatorProps, TouchableOpacityProps, SwitchProps, FlatListProps, SectionListProps, TextProps, ViewProps, ImageProps } from 'react-native';

declare module 'nativewind' {
  interface NativeWindProps<T> {
    className?: string;
    style?: T;
  }
  
  interface ViewProps extends NativeWindProps<ViewStyle> {}
  interface TextProps extends NativeWindProps<TextStyle> {}
  interface ImageProps extends NativeWindProps<ImageStyle> {}
  interface TextInputProps extends NativeWindProps<TextInputProps> {}
  interface PressableProps extends NativeWindProps<PressableProps> {}
  interface ScrollViewProps extends NativeWindProps<ScrollViewProps> {}
  interface KeyboardAvoidingViewProps extends NativeWindProps<KeyboardAvoidingViewProps> {}
  interface ActivityIndicatorProps extends NativeWindProps<ActivityIndicatorProps> {}
  interface TouchableOpacityProps extends NativeWindProps<TouchableOpacityProps> {}
  interface SwitchProps extends NativeWindProps<SwitchProps> {}
}

declare global {
  namespace JSX {
    interface IntrinsicAttributes {
      className?: string;
    }
  }
}

export {};
