import React from 'react';
import { View, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassCard({ children, className = '', ...props }: GlassCardProps) {
  return (
    <View 
      className={`relative rounded-[14px] overflow-hidden ${className}`}
      style={{
        shadowColor: '#020617',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 36,
        elevation: 8,
      }}
      {...props}
    >
      {/* Background Gradient */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.008)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      {/* Top Border Glow */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.054)', 'rgba(255, 255, 255, 0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 }}
      />

      {/* Left Border Glow */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.049)', 'rgba(255, 255, 255, 0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 1.5 }}
      />

      {/* Content Container */}
      <View 
        className="p-6 border border-white/[0.06] rounded-[14px]"
        style={{
          backgroundColor: 'transparent'
        }}
      >
        {children}
      </View>
    </View>
  );
}
