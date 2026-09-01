import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  buildDocumentChecklistItems,
  buildProfileChecklistItems,
  computeWizardCompletion,
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
  const isComplete = progress.missing.length === 0;

  return (
    <View>
      {!isComplete ? (
        <>
          <MissingChecklistCard
            title={t('profile.checklist.fieldsSection')}
            items={profileMissing}
          />
          <DriverDocumentsStatusList items={documentMissing} />
          <Text className="text-sm text-slate-400 mt-2 leading-5">
            {t('profile.checklist.completeToSubmit')}
          </Text>
        </>
      ) : (
        <Text className="text-sm text-emerald-300/90 leading-5">
          {t('profile.checklist.allReady')}
        </Text>
      )}
    </View>
  );
};
