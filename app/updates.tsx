import { useCallback } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { OtaUpdatePanel } from '../src/components/OtaUpdatePanel';

/**
 * OTA diagnostics and manual update flow — same chrome and rhythm as the profile tab.
 */
export default function UpdatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.back();
        return true;
      });
      return () => sub.remove();
    }, [router]),
  );

  return (
    <View className="flex-1 bg-transparent">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 40,
          paddingHorizontal: 20,
          paddingTop: insets.top + 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="mb-6 flex-row items-center self-start active:opacity-70"
        >
          <Feather name="arrow-left" size={20} color="#94a3b8" />
          <Text className="ml-2 text-sm font-bold uppercase tracking-wider text-slate-400">
            {t('profile.title')}
          </Text>
        </Pressable>

        <View className="pb-6">
          <Text className="mb-1 text-3xl font-black uppercase tracking-tighter text-white">
            {t('profile.updates.title')}
          </Text>
          <Text className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
            {t('profile.updates.subtitle')}
          </Text>
        </View>

        <OtaUpdatePanel />
      </ScrollView>
    </View>
  );
}
