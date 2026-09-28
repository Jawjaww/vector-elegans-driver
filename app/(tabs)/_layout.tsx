import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { DriverTabBar } from '../../src/components/DriverTabBar';
import { DriverTabBarIcon } from '../../src/components/DriverTabBarIcon';

type TabBarIconProps = Readonly<{ focused: boolean; color: string; size?: number }>;

function HomeTabIcon({ focused }: TabBarIconProps) {
  return <DriverTabBarIcon name="home" focused={focused} />;
}

function RidesTabIcon({ focused }: TabBarIconProps) {
  return <DriverTabBarIcon name="navigation" focused={focused} />;
}

function EarningsTabIcon({ focused }: TabBarIconProps) {
  return <DriverTabBarIcon name="trending-up" focused={focused} />;
}

function ProfileTabIcon({ focused }: TabBarIconProps) {
  return <DriverTabBarIcon name="user" focused={focused} />;
}

function TabsTabBar(props: Readonly<BottomTabBarProps>) {
  return <DriverTabBar {...props} />;
}

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      tabBar={TabsTabBar}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: 80,
          elevation: 0,
        },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.48)',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('navigation.home'),
          tabBarIcon: HomeTabIcon,
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: t('navigation.rides'),
          tabBarIcon: RidesTabIcon,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: t('navigation.earnings'),
          tabBarIcon: EarningsTabIcon,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('navigation.profile'),
          tabBarIcon: ProfileTabIcon,
        }}
      />
    </Tabs>
  );
}
