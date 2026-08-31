import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import {
  buildDocumentChecklistItems,
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

interface DriverDocumentsStatusListProps {
  input: DossierChecklistInput;
}

export const DriverDocumentsStatusList: React.FC<
  Readonly<DriverDocumentsStatusListProps>
> = ({ input }) => {
  const { t } = useTranslation();
  const items = buildDocumentChecklistItems(input).filter(
    (item) => item.status === 'missing' || item.status === 'rejected',
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <View className="rounded-xl border border-white/15 bg-white/5 p-4 mb-2">
      <Text className="text-sm font-semibold text-white mb-3">
        {t('profile.checklist.documentsSection')}
      </Text>
      {items.map((item) => (
        <View key={item.id} className="flex-row items-center mb-2 last:mb-0">
          <Feather
            name={STATUS_ICON[item.status]}
            size={18}
            color={STATUS_COLOR[item.status]}
          />
          <Text
            className={`ml-3 flex-1 text-sm ${
              item.status === 'missing' ? 'text-slate-400' : 'text-white'
            }`}
          >
            {t(item.labelKey)}
          </Text>
          <Text className="text-xs" style={{ color: STATUS_COLOR[item.status] }}>
            {item.status === 'rejected'
              ? t('documents.status.rejected')
              : t('documents.missingDocument')}
          </Text>
        </View>
      ))}
    </View>
  );
};
