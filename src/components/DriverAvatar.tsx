import React from 'react';
import { Image, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

type DriverAvatarFallback = 'emoji' | 'camera';

type DriverAvatarProps = Readonly<{
  uri: string | null;
  size: number;
  fallback?: DriverAvatarFallback;
  className?: string;
}>;

/** Circular driver photo, or emoji/camera placeholder when missing. */
export function DriverAvatar({
  uri,
  size,
  fallback = 'emoji',
  className = '',
}: DriverAvatarProps) {
  if (uri) {
    return (
      <View
        className={`overflow-hidden rounded-full border border-white/10 ${className}`}
        style={{ width: size, height: size }}
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
      style={{ width: size, height: size }}
    >
      {fallback === 'camera' ? (
        <Feather name="camera" size={Math.round(size * 0.4)} color="#10b981" />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.45) }}>👤</Text>
      )}
    </View>
  );
}
