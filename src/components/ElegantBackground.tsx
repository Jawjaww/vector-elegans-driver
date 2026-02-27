import React from 'react';
import { View, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface ElegantBackgroundProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function ElegantBackground({ children, className = '', ...props }: ElegantBackgroundProps) {
  return (
    <View className={`flex-1 bg-black ${className}`} {...props}>
      <LinearGradient
        colors={['#2c2c2e', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
      {children}
    </View>
  );
}
