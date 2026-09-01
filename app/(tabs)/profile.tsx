import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useCallback, useState } from 'react';
import { DossierSystemTestRunner } from '../../src/components/DossierSystemTestRunner';
import { DriverAvatar } from '../../src/components/DriverAvatar';
import { resolveAvatarPreviewUrl } from '../../src/lib/avatarPreview';

type ProfileCard = {
  displayName: string;
  email: string;
  avatarUri: string | null;
};

function formatDriverName(
  firstName: string | null,
  lastName: string | null,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || 'Driver';
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showTestRunner, setShowTestRunner] = useState(false);
  const [profile, setProfile] = useState<ProfileCard>({
    displayName: 'Driver',
    email: '',
    avatarUri: null,
  });

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: driver } = await supabase
      .from('drivers')
      .select('first_name, last_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();

    const avatarUri = driver?.avatar_url
      ? await resolveAvatarPreviewUrl(driver.avatar_url)
      : null;

    setProfile({
      displayName: formatDriverName(
        driver?.first_name ?? null,
        driver?.last_name ?? null,
      ),
      email: user.email ?? '',
      avatarUri,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const menuItems = [
    {
      icon: 'file-text',
      label: 'Documents',
      action: () =>
        Alert.alert(
          'Coming Soon',
          'Document management will be available shortly.',
        ),
    },
    {
      icon: 'truck',
      label: 'Vehicle',
      action: () =>
        Alert.alert(
          'Coming Soon',
          'Vehicle management will be available shortly.',
        ),
    },
    { icon: 'settings', label: 'Settings', action: () => {} },
    { icon: 'help-circle', label: 'Help', action: () => {} },
    ...(__DEV__
      ? [
          {
            icon: 'tool' as const,
            label: 'Test Runner',
            action: () => setShowTestRunner(true),
          },
        ]
      : []),
  ];

  return (
    <View className="flex-1 bg-transparent">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 40,
          paddingHorizontal: 20,
          paddingTop: insets.top + 16,
        }}
      >
        <View className="pb-6">
          <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">
            Profile
          </Text>
          <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">
            Driver Account
          </Text>
        </View>

        <View className="overflow-hidden rounded-2xl mb-6">
          <View className="p-6 flex-row items-center">
            <DriverAvatar uri={profile.avatarUri} size={80} className="mr-5" />
            <View className="flex-1">
              <Text className="text-xl font-bold text-white mb-1">
                {profile.displayName}
              </Text>
              {profile.email ? (
                <Text className="text-slate-400 font-medium text-sm mb-3">
                  {profile.email}
                </Text>
              ) : (
                <View className="mb-3" />
              )}

              <Pressable
                className="self-start px-4 py-2 rounded-full border border-white/20 bg-white/5"
                onPress={() => router.push('/(auth)/profile-setup')}
              >
                <Text className="text-white text-xs font-bold uppercase tracking-wider">
                  Edit Profile
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View className="overflow-hidden rounded-2xl mb-8">
          {menuItems.map((item, index) => (
            <Pressable
              key={item.label}
              className={`p-5 flex-row items-center active:bg-white/5 ${index !== menuItems.length - 1 ? 'border-b border-white/5' : ''}`}
              onPress={item.action}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-4">
                <Feather name={item.icon as any} size={20} color="#94a3b8" />
              </View>
              <Text className="flex-1 text-white font-semibold text-base">
                {item.label}
              </Text>
              <Feather name="chevron-right" size={20} color="#475569" />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleSignOut}
          className="rounded-full py-4 items-center shadow-lg overflow-hidden relative"
          style={{
            shadowColor: '#ef4444',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          <LinearGradient
            colors={['#ef4444', '#f87171', '#fca5a5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />

          <LinearGradient
            colors={[
              'rgba(255,255,255,0.35)',
              'rgba(255,255,255,0.15)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              position: 'absolute',
              left: 4,
              right: '30%',
              top: 4,
              bottom: 4,
              borderRadius: 9999,
            }}
          />

          <Text className="text-white text-base font-black uppercase tracking-tighter drop-shadow-md">
            Sign Out
          </Text>
        </Pressable>
      </ScrollView>

      {showTestRunner && (
        <View className="absolute inset-0 bg-black/80 z-50">
          <View className="flex-1 bg-gray-900/95 m-4 rounded-2xl overflow-hidden">
            <View className="flex-row items-center justify-between p-4 border-b border-white/10">
              <Text className="text-white text-lg font-bold">
                Test Runner - Système de Dossiers
              </Text>
              <Pressable onPress={() => setShowTestRunner(false)}>
                <Feather name="x" size={24} color="white" />
              </Pressable>
            </View>
            <ScrollView className="flex-1">
              <DossierSystemTestRunner />
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
