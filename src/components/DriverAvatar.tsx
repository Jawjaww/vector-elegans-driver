import React from 'react';
import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { FeatherGlyph } from './FeatherGlyph';

type DriverAvatarFallback = 'emoji' | 'camera';

type DriverAvatarProps = Readonly<{
  uri: string | null;
  size: number;
  fallback?: DriverAvatarFallback;
  className?: string;
  style?: StyleProp<ViewStyle>;
}>;

/** Circular driver photo, or emoji/camera placeholder when missing. */
export function DriverAvatar({
  uri,
  size,
  fallback = 'emoji',
  className = '',
  style,
}: DriverAvatarProps) {
  if (uri) {
    return (
      <View
        className={`overflow-hidden rounded-full border border-white/10 ${className}`}
        style={[{ width: size, height: size }, style]}
      >
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  return (
    <View
      className={`items-center justify-center rounded-full border border-white/10 bg-white/5 ${className}`}
      style={[{ width: size, height: size }, style]}
    >
      {fallback === 'camera' ? (
        <FeatherGlyph name="camera" size={Math.round(size * 0.4)} />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.45) }}>👤</Text>
      )}
    </View>
  );
}
