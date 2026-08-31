import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  VEHICLE_TYPES,
  type DriverVehicleForm,
  type VehicleType,
} from '../lib/services/vehicleService';

interface DriverVehicleSectionProps {
  form: DriverVehicleForm;
  editable: boolean;
  onChange: (patch: Partial<DriverVehicleForm>) => void;
  contentStyle: object;
}

const TYPE_LABEL_KEYS: Record<VehicleType, string> = {
  STANDARD: 'profile.vehicleTypeStandard',
  PREMIUM: 'profile.vehicleTypePremium',
  VAN: 'profile.vehicleTypeVan',
  ELECTRIC: 'profile.vehicleTypeElectric',
};

export function DriverVehicleSection({
  form,
  editable,
  onChange,
  contentStyle,
}: Readonly<DriverVehicleSectionProps>) {
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInRight.duration(400).springify()}
      exiting={FadeOutLeft.duration(300)}
      style={contentStyle}
      className="space-y-6"
    >
      <Animated.Text
        entering={FadeInDown.duration(500).delay(100)}
        className="text-xl font-bold text-white mb-4"
      >
        {t('profile.vehicleInfo')}
      </Animated.Text>

      <Field
        delay={200}
        label={`${t('profile.licensePlate')} *`}
        icon="hash"
        placeholder={t('profile.licensePlatePlaceholder')}
        value={form.license_plate}
        editable={editable}
        autoCapitalize="characters"
        onChangeText={(license_plate) => onChange({ license_plate })}
      />
      <Field
        delay={300}
        label={`${t('profile.vehicleMake')} *`}
        icon="truck"
        placeholder={t('profile.vehicleMakePlaceholder')}
        value={form.make}
        editable={editable}
        autoCapitalize="words"
        onChangeText={(make) => onChange({ make })}
      />
      <Field
        delay={400}
        label={`${t('profile.vehicleModel')} *`}
        icon="info"
        placeholder={t('profile.vehicleModelPlaceholder')}
        value={form.model}
        editable={editable}
        autoCapitalize="words"
        onChangeText={(model) => onChange({ model })}
      />
      <Field
        delay={500}
        label={t('profile.vehicleColor')}
        icon="droplet"
        placeholder={t('profile.vehicleColorPlaceholder')}
        value={form.color}
        editable={editable}
        autoCapitalize="words"
        onChangeText={(color) => onChange({ color })}
      />

      <Animated.View entering={FadeInDown.duration(400).delay(600)}>
        <Text className="text-sm text-white font-medium mb-2">
          {t('profile.vehicleType')} *
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {VEHICLE_TYPES.map((type) => {
            const selected = form.vehicle_type === type;
            return (
              <Pressable
                key={type}
                disabled={!editable}
                onPress={() => onChange({ vehicle_type: type })}
                className={`px-3 py-2 rounded-full border ${
                  selected
                    ? 'bg-emerald-500/30 border-emerald-400'
                    : 'bg-white/10 border-white/20'
                }`}
              >
                <Text
                  className={`text-sm ${selected ? 'text-emerald-200' : 'text-white'}`}
                >
                  {t(TYPE_LABEL_KEYS[type])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function Field({
  delay,
  label,
  icon,
  placeholder,
  value,
  editable,
  autoCapitalize,
  onChangeText,
}: Readonly<{
  delay: number;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  placeholder: string;
  value: string;
  editable: boolean;
  autoCapitalize?: 'characters' | 'words' | 'none';
  onChangeText: (value: string) => void;
}>) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(delay)} className="mb-4">
      <Text className="text-sm text-white font-medium mb-2">{label}</Text>
      <View className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20">
        <Feather name={icon} size={20} color="#10b981" />
        <TextInput
          className="flex-1 text-white ml-3 text-base"
          placeholder={placeholder}
          placeholderTextColor="#6b7280"
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </Animated.View>
  );
}
