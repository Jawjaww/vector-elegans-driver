import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GestureDetector } from 'react-native-gesture-handler';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  getBottomSheetTabBarPanGesture,
  subscribeBottomSheetTabBarPan,
} from './bottomSheetGestureBridge';
import { TAB_BAR_HEIGHT } from './BottomSheet';
import { APP_CHROME } from '../lib/theme';

/**
 * Full-width floor under the home sheet.
 *
 * Same flat fill as the sheet, separated by a hairline only. On Home, the
 * upward pan that opens the sheet still covers this band.
 */
export function DriverTabBar(props: Readonly<BottomTabBarProps>) {
  const { state, descriptors, navigation } = props;
  const routeName = state.routes[state.index]?.name;
  const isHome = routeName === 'index';
  const tabBarPan = useSyncExternalStore(
    subscribeBottomSheetTabBarPan,
    getBottomSheetTabBarPanGesture,
    getBottomSheetTabBarPanGesture,
  );
  const pullGesture = isHome ? tabBarPan : null;

  const content = (
    <View style={styles.band}>
      <View style={styles.lip} />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);
          const color = focused ? '#ffffff' : 'rgba(255,255,255,0.38)';

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ?? String(label)
              }
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (focused || event.defaultPrevented) return;
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => {
                navigation.emit({ type: 'tabLongPress', target: route.key });
              }}
              style={styles.item}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text numberOfLines={1} style={[styles.label, { color }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  if (!pullGesture) return content;
  return <GestureDetector gesture={pullGesture}>{content}</GestureDetector>;
}

const styles = StyleSheet.create({
  band: {
    height: TAB_BAR_HEIGHT,
    backgroundColor: APP_CHROME.surface,
  },
  lip: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: APP_CHROME.edge,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});
