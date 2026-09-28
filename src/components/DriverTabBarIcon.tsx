import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { VE_BLUE } from '../lib/theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

const GRADIENT = [VE_BLUE.base, VE_BLUE.edge] as const;
const INACTIVE = 'rgba(255, 255, 255, 0.42)';

type DriverTabBarIconProps = Readonly<{
  name: FeatherName;
  focused: boolean;
  size?: number;
}>;

/**
 * Bottom tab glyph: inactive muted white, active on the brand blue gradient tile.
 */
export function DriverTabBarIcon({
  name,
  focused,
  size = 20,
}: DriverTabBarIconProps) {
  if (!focused) {
    return <Feather name={name} size={size} color={INACTIVE} />;
  }

  const tile = size + 12;
  return (
    <View style={[styles.wrap, { width: tile, height: tile }]}>
      <LinearGradient
        colors={[...GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { width: tile, height: tile, borderRadius: tile * 0.32 }]}
      />
      <Feather name={name} size={size} color="#ffffff" style={styles.icon} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    position: 'absolute',
    opacity: 0.95,
  },
  icon: {
    zIndex: 1,
  },
});
