import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { type ChecklistItem } from '../lib/dossierChecklist';

function statusDetail(
  item: ChecklistItem,
  t: (key: string) => string,
): string | null {
  if (item.status === 'rejected') {
    return t('documents.status.rejected');
  }
  if (item.status === 'expiry_missing') {
    return t('profile.checklist.expiryMissing');
  }
  return null;
}

export const MissingChecklistCard: React.FC<
  Readonly<{
    title: string;
    items: ChecklistItem[];
  }>
> = ({ title, items }) => {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <View className="rounded-xl border border-white/15 bg-white/5 p-4 mb-2">
      <Text className="text-sm font-semibold text-white mb-2">{title}</Text>
      {items.map((item) => {
        const detail = statusDetail(item, t);
        return (
          <View key={item.id} className="flex-row items-start mb-1.5 last:mb-0">
            <Text className="text-sm text-slate-500 mr-2">•</Text>
            <Text className="flex-1 text-sm text-slate-300">
              {t(item.labelKey)}
              {detail ? (
                <Text className="text-amber-400/90"> — {detail}</Text>
              ) : null}
            </Text>
          </View>
        );
      })}
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
    />
  );
};
