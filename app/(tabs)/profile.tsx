import { View, Text, Pressable, Alert, ScrollView, StyleSheet } from 'react-native';
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
import { ACCENT_OUTLINE_WIDTH, VE_BLUE } from '../../src/lib/theme';
import { AccentOutline } from '../../src/components/AccentOutline';
import { FeatherGlyph } from '../../src/components/FeatherGlyph';
import type { FeatherGlyphName } from '../../src/lib/featherGlyphs';
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

  /**
   * The rows, and the glyph each one heads.
   *
   * `FeatherGlyphName` rather than `string` on purpose: these names are drawn from
   * `lib/featherGlyphs.ts`, which only vendors the glyphs that have to carry the gradient. A row
   * asking for a name that is not vendored is a blank chip, and the type is what catches that —
   * the font would have quietly substituted a fallback box instead.
   */
  const menuItems: Array<{
    icon: FeatherGlyphName;
    label: string;
    detail?: string;
    action: () => void;
  }> = [
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
            {t('profile.title')}
          </Text>
          <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">
            {t('profile.screenSubtitle')}
          </Text>
        </View>

        <View
          className="overflow-hidden rounded-2xl mb-6"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* The one block on this screen that would otherwise be pure grey. Corner to corner, and
              fading to the same blue at zero alpha: `transparent` is black at zero alpha, so the
              interpolation would pass through grey on Android and grey the wash out. */}
          <LinearGradient
            colors={[`${VE_BLUE.base}${VE_BLUE.tintAlpha}`, `${VE_BLUE.base}00`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
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

              {/* A neutral face, a gradient hairline, and the light-blue label.

                  The face is opaque because that is what was chosen for it — a recessed well rather
                  than a second card — *not* because the technique needs it. It used to: the hairline
                  was made by laying a gradient down and covering it, so a translucent face would
                  have let the gradient bleed through the middle. The hairline is now stroked over
                  the face by `AccentOutline`, the same one the offer sheet's chips use, so the
                  opacity is a choice that can be revisited rather than a constraint. Kept opaque
                  for now: it is what keeps the control from competing with the blue wash of the card
                  behind it.

                  The hairline takes the *light* pair. The pair the old filled pill used starts where
                  this one ends, so it buys nothing at the near end and loses the far one — its dark
                  stop falls under 3:1 on a face this dark, and the contour would fade out halfway
                  round.

                  The label is a flat light blue rather than a gradient of its own. Painting a
                  gradient through type needs a masking module, which is native — the same constraint
                  that puts the icons beside it in SVG (`featherGlyphs`). A glyph can be drawn; it
                  cannot be *made of* the words "Edit Profile". */}
              <Pressable
                className="self-start"
                onPress={() => router.push('/(auth)/profile-setup')}
              >
                <View
                  className="rounded-full"
                  style={{
                    backgroundColor: VE_BLUE.outlineFill,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                >
                  <AccentOutline radius={999} thickness={ACCENT_OUTLINE_WIDTH} />
                  <Text
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: VE_BLUE.glyphGradient[0] }}
                  >
                    Edit Profile
                  </Text>
                </View>
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
              {/* No disc, no ring: the glyph alone, at the tab bar's own size and in its own
                  gradient — one icon language for the two places the driver looks most often.

                  This row carried a tinted disc and then a ring around that disc. Both are gone
                  because together they made a *ball*: three concentric circles stacked on every
                  line, and a ring whose gradient runs light-to-dark left-to-right drags the eye's
                  centre off the glyph's. The glyphs themselves measure centred to under half a grid
                  unit — a deviation of 0.42 px at this size, guarded in `featherGlyph.test.ts` — so
                  the disc was the whole of the problem.

                  The wrapper is a fixed 22-point column rather than a bare glyph so the labels stay
                  aligned whatever the glyph's own width — Feather's `trending-up` is twice as wide
                  as its `user`, and the boxes must not be. */}
              <View className="w-6 items-center mr-4">
                <FeatherGlyph name={item.icon} size={22} />
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
