import React, { useSyncExternalStore } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  BottomTabBar,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  getBottomSheetTabBarPanGesture,
  subscribeBottomSheetTabBarPan,
} from './bottomSheetGestureBridge';
import { TAB_BAR_HEIGHT } from './BottomSheet';

/**
 * Tab bar with an upward-only pan on Home so the compact sheet handle can be
 * pulled open from the menu area. Taps still win when movement stays small.
 */
export function DriverTabBar(props: Readonly<BottomTabBarProps>) {
  const routeName = props.state.routes[props.state.index]?.name;
  const isHome = routeName === 'index';
  const tabBarPan = useSyncExternalStore(
    subscribeBottomSheetTabBarPan,
    getBottomSheetTabBarPanGesture,
    getBottomSheetTabBarPanGesture,
  );
  const pullGesture = isHome ? tabBarPan : null;

  const content = (
    <View style={styles.container}>
      <BottomTabBar {...props} />
    </View>
  );

  if (!pullGesture) {
    return content;
  }

  return <GestureDetector gesture={pullGesture}>{content}</GestureDetector>;
}

const styles = StyleSheet.create({
  container: {
    height: TAB_BAR_HEIGHT,
    backgroundColor: '#161616',
    borderTopColor: 'rgba(255,255,255,0.06)',
    borderTopWidth: 1,
  },
});
