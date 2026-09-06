import { Tabs } from 'expo-router';
import { Text } from 'react-native';

type TabBarIconProps = Readonly<{ color: string; focused?: boolean; size?: number }>;

function TabIcon({
  icon,
  color,
}: Readonly<{ icon: string; color: string }>) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}

function HomeTabIcon({ color }: TabBarIconProps) {
  return <TabIcon icon="🏠" color={color} />;
}

function RidesTabIcon({ color }: TabBarIconProps) {
  return <TabIcon icon="🚗" color={color} />;
}

function EarningsTabIcon({ color }: TabBarIconProps) {
  return <TabIcon icon="💰" color={color} />;
}

function ProfileTabIcon({ color }: TabBarIconProps) {
  return <TabIcon icon="👤" color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: '#161616',
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 20,
          paddingTop: 10,
        },
        tabBarActiveTintColor: '#10b981',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: HomeTabIcon,
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: 'Rides',
          tabBarIcon: RidesTabIcon,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: EarningsTabIcon,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ProfileTabIcon,
        }}
      />
    </Tabs>
  );
}
