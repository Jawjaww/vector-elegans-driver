import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import {
  buildProfileChecklistItems,
  type ChecklistItemStatus,
  type DossierChecklistInput,
} from '../lib/dossierChecklist';
import { DriverDocumentsStatusList } from './DriverDocumentsStatusList';

const STATUS_COLOR: Record<ChecklistItemStatus, string> = {
  missing: '#6b7280',
  provided: '#10b981',
  rejected: '#f59e0b',
};

const STATUS_ICON: Record<ChecklistItemStatus, keyof typeof Feather.glyphMap> = {
  missing: 'circle',
  provided: 'check-circle',
  rejected: 'alert-circle',
};

interface DossierValidationChecklistProps {
  input: DossierChecklistInput;
}

function ChecklistSection({
  title,
  items,
}: Readonly<{
  title: string;
  items: { id: string; labelKey: string; status: ChecklistItemStatus }[];
}>) {
  const { t } = useTranslation();

  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-white mb-2">{title}</Text>
      {items.map((item) => (
        <View key={item.id} className="flex-row items-center mb-2">
          <Feather
            name={STATUS_ICON[item.status]}
            size={16}
            color={STATUS_COLOR[item.status]}
          />
          <Text
            className={`ml-3 flex-1 text-sm ${
              item.status === 'missing' ? 'text-slate-400' : 'text-white'
            }`}
          >
            {t(item.labelKey)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const DossierValidationChecklist: React.FC<
  Readonly<DossierValidationChecklistProps>
> = ({ input }) => {
  const { t } = useTranslation();
  const profileItems = buildProfileChecklistItems(input);
  const personalItems = profileItems.filter((i) =>
    [
      'first_name',
      'last_name',
      'phone',
      'date_of_birth',
      'address',
      'city',
      'postal_code',
      'emergency_contact_name',
      'emergency_contact_phone',
      'avatar',
    ].includes(i.id),
  );
  const proItems = profileItems.filter((i) =>
    [
      'license_number',
      'driving_license_expiry_date',
      'vtc_card_number',
      'vtc_card_expiry_date',
      'insurance_number',
      'company_siret',
    ].includes(i.id),
  );

  return (
    <View>
      <Text className="text-xs text-slate-400 mb-3">{t('profile.checklistHint')}</Text>
      <ChecklistSection title={t('profile.checklist.personalSection')} items={personalItems} />
      <ChecklistSection title={t('profile.checklist.proSection')} items={proItems} />
      <DriverDocumentsStatusList input={input} />
    </View>
  );
};
