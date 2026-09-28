import React from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
} from 'react-native-reanimated';
import { DriverAvatar } from '../DriverAvatar';
import { FeatherGlyph } from '../FeatherGlyph';
import { NativeDateField } from '../NativeDateField';
import { VE_BLUE } from '../../lib/theme';
import type { DriverProfileData } from './dossierWizardTypes';

const AVATAR_CHIP_BG = `${VE_BLUE.base}${VE_BLUE.tintAlpha}`;

function avatarButtonLabel(
  uploading: boolean,
  hasAvatar: boolean,
  labels: { uploading: string; ready: string; upload: string },
): string {
  if (uploading) return labels.uploading;
  if (hasAvatar) return labels.ready;
  return labels.upload;
}

export function DossierProfilSection({
  formData,
  onChange,
  fieldsEditable,
  animatedContentStyle,
  animatedFieldStyle,
  avatarPreviewUri,
  avatarUrl,
  uploadingAvatar,
  onUploadAvatar,
}: Readonly<{
  formData: DriverProfileData;
  onChange: (field: keyof DriverProfileData, value: string) => void;
  fieldsEditable: boolean;
  animatedContentStyle: StyleProp<ViewStyle>;
  animatedFieldStyle: StyleProp<ViewStyle>;
  avatarPreviewUri: string | null;
  avatarUrl: string | null;
  uploadingAvatar: boolean;
  onUploadAvatar: () => void;
}>) {
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInRight.duration(400).springify()}
      exiting={FadeOutLeft.duration(300)}
      style={animatedContentStyle}
      className="space-y-6"
    >
      <Animated.Text
        entering={FadeInDown.duration(500).delay(100)}
        className="text-xl font-bold text-white mb-4"
      >
        {t('profile.personalInfo')}
      </Animated.Text>

      <Animated.View entering={FadeInDown.duration(400).delay(120)} className="mb-4">
        <Text className="text-sm text-white font-medium mb-2">
          {t('profile.avatar')} *
        </Text>
        <Pressable
          onPress={onUploadAvatar}
          disabled={!fieldsEditable || uploadingAvatar}
          className="flex-row items-center bg-white/10 rounded-lg px-4 py-3 border border-white/20"
        >
          <DriverAvatar
            uri={avatarPreviewUri}
            size={48}
            fallback="camera"
            className="mr-3"
            style={{ backgroundColor: AVATAR_CHIP_BG }}
          />
          <View className="flex-1">
            <Text className="text-white font-medium">
              {avatarButtonLabel(uploadingAvatar, Boolean(avatarUrl), {
                uploading: t('documents.uploading'),
                ready: t('profile.avatarReady'),
                upload: t('profile.avatarUpload'),
              })}
            </Text>
            <Text className="text-slate-400 text-xs mt-0.5">
              {t('profile.avatarHint')}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color="#64748b" />
        </Pressable>
      </Animated.View>

      <Animated.View style={animatedFieldStyle}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(200)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.firstName')} *
        </Animated.Text>
        <Animated.View
          entering={FadeInRight.duration(400).delay(300)}
          className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
        >
          <FeatherGlyph name="user" size={20} />
          <TextInput
            className="flex-1 text-white ml-3 text-base"
            placeholder={t('profile.firstNamePlaceholder')}
            placeholderTextColor="#6b7280"
            value={formData.first_name}
            onChangeText={(text) => onChange('first_name', text)}
            autoCapitalize="words"
            editable={fieldsEditable}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View style={animatedFieldStyle}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(400)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.lastName')} *
        </Animated.Text>
        <Animated.View
          entering={FadeInRight.duration(400).delay(500)}
          className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
        >
          <FeatherGlyph name="user" size={20} />
          <TextInput
            className="flex-1 text-white ml-3 text-base"
            placeholder={t('profile.lastNamePlaceholder')}
            placeholderTextColor="#6b7280"
            value={formData.last_name}
            onChangeText={(text) => onChange('last_name', text)}
            autoCapitalize="words"
          />
        </Animated.View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(700)}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(600)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.phone')} *
        </Animated.Text>
        <Animated.View
          entering={FadeInRight.duration(400).delay(700)}
          className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
        >
          <FeatherGlyph name="phone" size={20} />
          <TextInput
            className="flex-1 text-white ml-3 text-base"
            placeholder={t('profile.phonePlaceholder')}
            placeholderTextColor="#6b7280"
            value={formData.phone}
            onChangeText={(text) => onChange('phone', text)}
            keyboardType="phone-pad"
          />
        </Animated.View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(900)}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(800)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.dateOfBirth')}
        </Animated.Text>
        <Animated.View entering={FadeInRight.duration(400).delay(900)} className="mt-0">
          <NativeDateField
            value={(formData.date_of_birth || '').slice(0, 10)}
            onChange={(ymd) => onChange('date_of_birth', ymd)}
            placeholder={t('profile.dateOfBirthPlaceholder')}
            editable={fieldsEditable}
            maximumDate={new Date()}
          />
        </Animated.View>
      </Animated.View>

      <View className="pt-4 border-t border-white/10">
        <Text className="text-lg font-bold text-white mb-4">{t('profile.address')}</Text>

        <Animated.View className="mb-4" entering={FadeInDown.duration(400).delay(1100)}>
          <Animated.Text
            entering={FadeInDown.duration(400).delay(1000)}
            className="text-sm text-white font-medium mb-2"
          >
            {t('profile.address')} *
          </Animated.Text>
          <Animated.View
            entering={FadeInRight.duration(400).delay(1100)}
            className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
          >
            <FeatherGlyph name="map-pin" size={20} />
            <TextInput
              className="flex-1 text-white ml-3 text-base"
              placeholder={t('profile.addressPlaceholder')}
              placeholderTextColor="#6b7280"
              value={formData.address}
              onChangeText={(text) => onChange('address', text)}
            />
          </Animated.View>
        </Animated.View>

        <Animated.View className="mb-4" entering={FadeInDown.duration(400).delay(1300)}>
          <Animated.Text
            entering={FadeInDown.duration(400).delay(1200)}
            className="text-sm text-white font-medium mb-2"
          >
            {t('profile.city')} *
          </Animated.Text>
          <Animated.View
            entering={FadeInRight.duration(400).delay(1300)}
            className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
          >
            <FeatherGlyph name="home" size={20} />
            <TextInput
              className="flex-1 text-white ml-3 text-base"
              placeholder={t('profile.cityPlaceholder')}
              placeholderTextColor="#6b7280"
              value={formData.city}
              onChangeText={(text) => onChange('city', text)}
            />
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(1500)}>
          <Animated.Text
            entering={FadeInDown.duration(400).delay(1400)}
            className="text-sm text-white font-medium mb-2"
          >
            {t('profile.postalCode')} *
          </Animated.Text>
          <Animated.View
            entering={FadeInRight.duration(400).delay(1500)}
            className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
          >
            <FeatherGlyph name="hash" size={20} />
            <TextInput
              className="flex-1 text-white ml-3 text-base"
              placeholder={t('profile.postalCodePlaceholder')}
              placeholderTextColor="#6b7280"
              value={formData.postal_code}
              onChangeText={(text) => onChange('postal_code', text)}
              editable={fieldsEditable}
            />
          </Animated.View>
        </Animated.View>
      </View>

      <View className="pt-4 border-t border-white/10">
        <Text className="text-lg font-bold text-white mb-4">
          {t('profile.emergencyContact')}
        </Text>

        <Animated.View className="mb-4" entering={FadeInDown.duration(400).delay(1600)}>
          <Text className="text-sm text-white font-medium mb-2">
            {t('profile.emergencyContactName')} *
          </Text>
          <View className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20">
            <FeatherGlyph name="users" size={20} />
            <TextInput
              className="flex-1 text-white ml-3 text-base"
              placeholder={t('profile.emergencyContactNamePlaceholder')}
              placeholderTextColor="#6b7280"
              value={formData.emergency_contact_name}
              onChangeText={(text) => onChange('emergency_contact_name', text)}
              autoCapitalize="words"
              editable={fieldsEditable}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(1700)}>
          <Text className="text-sm text-white font-medium mb-2">
            {t('profile.emergencyContactPhone')} *
          </Text>
          <View className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20">
            <FeatherGlyph name="phone-call" size={20} />
            <TextInput
              className="flex-1 text-white ml-3 text-base"
              placeholder={t('profile.emergencyContactPhonePlaceholder')}
              placeholderTextColor="#6b7280"
              value={formData.emergency_contact_phone}
              onChangeText={(text) => onChange('emergency_contact_phone', text)}
              keyboardType="phone-pad"
              editable={fieldsEditable}
            />
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
