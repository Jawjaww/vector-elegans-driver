import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  buildDocumentChecklistItems,
  buildProfileChecklistItems,
  computeWizardCompletion,
  filterRpcGapsForChecklist,
  type DossierChecklistInput,
} from '../lib/dossierChecklist';
import {
  DriverDocumentsStatusList,
  MissingChecklistCard,
} from './DriverDocumentsStatusList';

interface DossierValidationChecklistProps {
  input: DossierChecklistInput;
}

export const DossierValidationChecklist: React.FC<
  Readonly<DossierValidationChecklistProps>
> = ({ input }) => {
  const { t } = useTranslation();
  const documentItems = buildDocumentChecklistItems(input);
  const rpcGaps = filterRpcGapsForChecklist(input.missingForSubmit, documentItems);
  const profileMissing = buildProfileChecklistItems(input).filter(
    (item) => item.status !== 'provided',
  );
  const documentMissing = documentItems.filter(
    (item) =>
      item.status === 'missing' ||
      item.status === 'rejected' ||
      item.status === 'expiry_missing',
  );
  const progress = computeWizardCompletion(input);

  return (
    <View>
      <Text className="text-xs text-slate-400 mb-3">{t('profile.checklistHint')}</Text>
      <MissingChecklistCard
        title={t('profile.checklist.fieldsSection')}
        items={profileMissing}
        missingBadge={t('profile.missingFields')}
      />
      <DriverDocumentsStatusList items={documentMissing} />
      {rpcGaps.length > 0 ? (
        <View className="rounded-xl border border-white/15 bg-white/5 p-4 mb-2">
          <Text className="text-sm font-semibold text-white mb-3">
            {t('profile.missingFields')}
          </Text>
          {rpcGaps.map((label) => (
            <Text key={label} className="text-sm text-slate-400 mb-1">
              {label}
            </Text>
          ))}
        </View>
      ) : null}
      {progress.missing.length === 0 && rpcGaps.length === 0 ? (
        <Text className="text-sm text-emerald-300/90">
          {t('profile.checklist.allReady')}
        </Text>
      ) : null}
    </View>
  );
};
