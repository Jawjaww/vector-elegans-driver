import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppChromeBackground } from './AppChromeBackground';

type ProfileSheetModalProps = Readonly<{
  title: string;
  onClose: () => void;
  children: ReactNode;
}>;

/** Full-screen sheet over profile tabs — same chrome as earnings / account screens. */
export function ProfileSheetModal({
  title,
  onClose,
  children,
}: ProfileSheetModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute inset-0 z-50 bg-black/80">
      <View
        className="flex-1 overflow-hidden rounded-2xl border border-white/5"
        style={{ marginTop: insets.top + 8, marginBottom: insets.bottom + 8, marginHorizontal: 16 }}
      >
        <AppChromeBackground />
        <View className="flex-1">
          <View className="flex-row items-center justify-between border-b border-white/5 px-5 py-4">
            <Text className="text-lg font-black uppercase tracking-tighter text-white">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-10 w-10 items-center justify-center rounded-full border border-white/10 active:bg-white/5"
            >
              <Feather name="x" size={22} color="#e2e8f0" />
            </Pressable>
          </View>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
