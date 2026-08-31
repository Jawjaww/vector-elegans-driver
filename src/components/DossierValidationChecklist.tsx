import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import {
  buildChecklistItems,
  type ChecklistItemStatus,
  type DossierChecklistInput,
} from '../lib/dossierChecklist';

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

export const DossierValidationChecklist: React.FC<
  Readonly<DossierValidationChecklistProps>
> = ({ input }) => {
  const { t } = useTranslation();
  const items = buildChecklistItems(input);

  return (
    <View className="space-y-3">
      <Text className="text-xs text-slate-400 mb-1">{t('profile.checklistHint')}</Text>
      {items.map((item) => (
        <View key={item.id} className="flex-row items-center">
          <Feather
            name={STATUS_ICON[item.status]}
            size={16}
            color={STATUS_COLOR[item.status]}
          />
          <Text
            className={`ml-3 flex-1 ${
              item.status === 'missing' ? 'text-slate-400' : 'text-white'
            }`}
          >
            {t(item.labelKey)}
          </Text>
          {item.status === 'rejected' ? (
            <Text className="text-xs text-amber-400">{t('documents.status.rejected')}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
};
