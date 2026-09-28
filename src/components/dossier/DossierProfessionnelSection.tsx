import React from 'react';
import { Text, TextInput, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
} from 'react-native-reanimated';
import { FeatherGlyph } from '../FeatherGlyph';
import { NativeDateField } from '../NativeDateField';
import type { DriverProfileData } from './dossierWizardTypes';

export function DossierProfessionnelSection({
  formData,
  onChange,
  fieldsEditable,
  animatedContentStyle,
}: Readonly<{
  formData: DriverProfileData;
  onChange: (field: keyof DriverProfileData, value: string) => void;
  fieldsEditable: boolean;
  animatedContentStyle: StyleProp<ViewStyle>;
}>) {
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInRight.duration(300)}
      exiting={FadeOutLeft.duration(300)}
      style={animatedContentStyle}
      className="space-y-6"
    >
      <Text className="text-xl font-bold text-white mb-4">
        {t('profile.professionalInfo')}
      </Text>

      <Animated.View entering={FadeInDown.duration(400).delay(200)}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(100)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.licenseNumber')} *
        </Animated.Text>
        <Animated.View
          entering={FadeInRight.duration(400).delay(200)}
          className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
        >
          <FeatherGlyph name="credit-card" size={20} />
          <TextInput
            className="flex-1 text-white ml-3 text-base"
            placeholder={t('profile.licenseNumberPlaceholder')}
            placeholderTextColor="#6b7280"
            value={formData.license_number}
            onChangeText={(text) => onChange('license_number', text)}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(400)}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(300)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.licenseExpiry')} *
        </Animated.Text>
        <Animated.View entering={FadeInRight.duration(400).delay(400)}>
          <NativeDateField
            value={(formData.driving_license_expiry_date || '').slice(0, 10)}
            onChange={(ymd) => onChange('driving_license_expiry_date', ymd)}
            placeholder="YYYY-MM-DD"
            editable={fieldsEditable}
            minimumDate={new Date()}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(600)}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(500)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.vtcCardNumber')} *
        </Animated.Text>
        <Animated.View
          entering={FadeInRight.duration(400).delay(600)}
          className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
        >
          <FeatherGlyph name="award" size={20} />
          <TextInput
            className="flex-1 text-white ml-3 text-base"
            placeholder={t('profile.vtcCardNumberPlaceholder')}
            placeholderTextColor="#6b7280"
            value={formData.vtc_card_number}
            onChangeText={(text) => onChange('vtc_card_number', text)}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(800)}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(700)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.vtcCardExpiry')} *
        </Animated.Text>
        <Animated.View entering={FadeInRight.duration(400).delay(800)}>
          <NativeDateField
            value={(formData.vtc_card_expiry_date || '').slice(0, 10)}
            onChange={(ymd) => onChange('vtc_card_expiry_date', ymd)}
            placeholder="YYYY-MM-DD"
            editable={fieldsEditable}
            minimumDate={new Date()}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(1000)}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(900)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.insuranceNumber')}
        </Animated.Text>
        <Animated.View
          entering={FadeInRight.duration(400).delay(1000)}
          className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
        >
          <FeatherGlyph name="shield" size={20} />
          <TextInput
            className="flex-1 text-white ml-3 text-base"
            placeholder={t('profile.insuranceNumberPlaceholder')}
            placeholderTextColor="#6b7280"
            value={formData.insurance_number}
            onChangeText={(text) => onChange('insurance_number', text)}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(1200)}>
        <Animated.Text
          entering={FadeInDown.duration(400).delay(1100)}
          className="text-sm text-white font-medium mb-2"
        >
          {t('profile.companySiret')}
        </Animated.Text>
        <Animated.View
          entering={FadeInRight.duration(400).delay(1200)}
          className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
        >
          <FeatherGlyph name="briefcase" size={20} />
          <TextInput
            className="flex-1 text-white ml-3 text-base"
            placeholder={t('profile.companySiretPlaceholder')}
            placeholderTextColor="#6b7280"
            value={formData.company_siret}
            onChangeText={(text) => onChange('company_siret', text)}
            keyboardType="numeric"
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
