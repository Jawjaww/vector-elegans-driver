import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOtaMenuDetail } from '../../src/components/OtaUpdatePanel';
import { ProfileSheetModal } from '../../src/components/ProfileSheetModal';
import { DossierSystemTestRunner } from '../../src/components/DossierSystemTestRunner';
import { DriverAvatar } from '../../src/components/DriverAvatar';
import { resolveAvatarPreviewUrl } from '../../src/lib/avatarPreview';
import {
  getOfferSound,
  isOverlaySupported,
  pickOfferSound,
} from '../../src/lib/overlay/overlayService';
import {
  offerSoundLabel,
  rideChannelSound,
  type OfferSoundState,
} from '../../src/lib/notifications/offerSound';
import { applyRideChannelSound } from '../../src/lib/notifications/pushRegistration';

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
  const { t } = useTranslation();
  const otaMenuDetail = useOtaMenuDetail();
  const [showTestRunner, setShowTestRunner] = useState(false);
  const [profile, setProfile] = useState<ProfileCard>({
    displayName: 'Driver',
    email: '',
    avatarUri: null,
  });
  /**
   * The driver's chosen ringtone.
   *
   * Only meaningful with the native module: the picker and the persisted preference are Android
   * overlay-module features, and the row is hidden entirely when `isOverlaySupported()` is false
   * rather than shown disabled. On iOS the notification sound is a system decision the app
   * cannot offer a choice over.
   */
  const offerSoundSupported = isOverlaySupported();
  const [offerSound, setOfferSound] = useState<OfferSoundState>({ kind: 'default' });

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
      setOfferSound(getOfferSound());
    }, [loadProfile]),
  );

  /**
   * Let the driver pick the sound their offers make.
   *
   * Nothing here blocks on the picker: the row is fire-and-forget and updates only once the
   * answer lands. A picker whose result never arrives (the host Activity is destroyed mid-pick,
   * which expo-modules-core documents as unsupported) must leave the screen usable rather than
   * stuck behind a promise that never settles.
   */
  const handlePickOfferSound = useCallback(async () => {
    const result = await pickOfferSound();
    if (result.outcome === 'unavailable') {
      Alert.alert(
        'Indisponible',
        "Ce téléphone ne propose pas de sélecteur de sonnerie. La sonnerie de notification du système reste utilisée. Vous pouvez la choisir dans les réglages Android.",
      );
      return;
    }
    if (result.outcome === 'cancelled') return;

    const next = getOfferSound();
    setOfferSound(next);
    // The tap path plays through the `rides` channel, which must carry the same sound or the
    // driver would hear different tones depending on how the offer arrived.
    const applied = await applyRideChannelSound(rideChannelSound(next));
    if (applied === 'recreated') {
      Alert.alert(
        'Sonnerie mise à jour',
        "Android a recréé le canal de notification des courses, ce qui réinitialise ses réglages personnalisés (importance, vibration). Le son choisi est bien appliqué.",
      );
    }
  }, []);

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
    {
      icon: 'download-cloud',
      label: t('profile.updates.menu'),
      detail: otaMenuDetail,
      action: () => router.push('/updates'),
    },
    ...(offerSoundSupported
      ? [
          {
            icon: 'volume-2' as const,
            label: "Sonnerie d'offre",
            detail: offerSoundLabel(offerSound),
            action: () => void handlePickOfferSound(),
          },
        ]
      : []),
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
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">
                  {item.label}
                </Text>
                {item.detail ? (
                  <Text className="mt-0.5 text-xs text-slate-400">
                    {item.detail}
                  </Text>
                ) : null}
              </View>
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

      {showTestRunner ? (
        <ProfileSheetModal
          title="Test Runner"
          onClose={() => setShowTestRunner(false)}
        >
          <DossierSystemTestRunner />
        </ProfileSheetModal>
      ) : null}
    </View>
  );
}
