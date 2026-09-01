import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import {
  type ChecklistItem,
  type ChecklistItemStatus,
} from '../lib/dossierChecklist';

const STATUS_COLOR: Record<ChecklistItemStatus, string> = {
  missing: '#6b7280',
  provided: '#10b981',
  rejected: '#f59e0b',
  expiry_missing: '#f59e0b',
};

const STATUS_ICON: Record<ChecklistItemStatus, keyof typeof Feather.glyphMap> = {
  missing: 'circle',
  provided: 'check-circle',
  rejected: 'alert-circle',
  expiry_missing: 'alert-circle',
};

export const MissingChecklistCard: React.FC<
  Readonly<{
    title: string;
    items: ChecklistItem[];
    missingBadge: string;
  }>
> = ({ title, items, missingBadge }) => {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <View className="rounded-xl border border-white/15 bg-white/5 p-4 mb-2">
      <Text className="text-sm font-semibold text-white mb-3">{title}</Text>
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
              : item.status === 'expiry_missing'
                ? t('profile.checklist.expiryMissing')
                : missingBadge}
          </Text>
        </View>
      ))}
    </View>
  );
};

interface DriverDocumentsStatusListProps {
  items: ChecklistItem[];
}

export const DriverDocumentsStatusList: React.FC<
  Readonly<DriverDocumentsStatusListProps>
> = ({ items }) => {
  const { t } = useTranslation();
  return (
    <MissingChecklistCard
      title={t('profile.checklist.documentsSection')}
      items={items}
      missingBadge={t('documents.missingDocument')}
    />
  );
};
