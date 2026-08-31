import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DossierChecklistInput } from '../lib/dossierChecklist';
import { DriverDocumentsStatusList } from './DriverDocumentsStatusList';

interface DossierValidationChecklistProps {
  input: DossierChecklistInput;
}

export const DossierValidationChecklist: React.FC<
  Readonly<DossierValidationChecklistProps>
> = ({ input }) => {
  const { t } = useTranslation();

  return (
    <View>
      <Text className="text-xs text-slate-400 mb-3">{t('profile.checklistHint')}</Text>
      <DriverDocumentsStatusList input={input} />
    </View>
  );
};
