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
  normalizeFolderStatus,
  resolveValidationChecklistMode,
} from '../lib/folderStatus';
import {
  DriverDocumentsStatusList,
  MissingChecklistCard,
} from './DriverDocumentsStatusList';

function opsChecklistCopyKeys(status: string): {
  titleKey: string;
  messageKey: string;
} {
  if (status === 'on_vacation') {
    return {
      titleKey: 'profile.folderStatus.onVacationTitle',
      messageKey: 'profile.folderStatus.onVacationMessage',
    };
  }
  if (status === 'inactive') {
    return {
      titleKey: 'profile.folderStatus.inactiveTitle',
      messageKey: 'profile.folderStatus.inactiveMessage',
    };
  }
  return {
    titleKey: 'profile.folderStatus.suspendedTitle',
    messageKey: 'profile.folderStatus.suspendedMessage',
  };
}

interface DossierValidationChecklistProps {
  input: DossierChecklistInput;
  status?: string | null;
  opsStatusReason?: string | null;
  dossierUpdateRequested?: boolean;
}

export const DossierValidationChecklist: React.FC<
  Readonly<DossierValidationChecklistProps>
> = ({ input, status, opsStatusReason, dossierUpdateRequested }) => {
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
  const mode = resolveValidationChecklistMode({
    status,
    dossierUpdateRequested,
    isComplete,
  });
  const reason = opsStatusReason?.trim() || null;
  const folderStatus = normalizeFolderStatus(status);

  if (mode === 'ops') {
    const { titleKey, messageKey } = opsChecklistCopyKeys(folderStatus);
    return (
      <View>
        <Text className="text-sm text-amber-200/90 leading-5 font-semibold">
          {t(titleKey)}
        </Text>
        <Text className="text-sm text-slate-300 mt-2 leading-5">
          {reason || t(messageKey)}
        </Text>
      </View>
    );
  }

  if (mode === 'validated') {
    return (
      <View>
        <Text className="text-sm text-emerald-300/90 leading-5">
          {t('profile.folderStatus.validatedNoSubmit')}
        </Text>
      </View>
    );
  }

  if (mode === 'missing') {
    return (
      <View>
        <MissingChecklistCard
          title={t('profile.checklist.fieldsSection')}
          items={profileMissing}
        />
        <DriverDocumentsStatusList items={documentMissing} />
        <Text className="text-sm text-slate-400 mt-2 leading-5">
          {t('profile.checklist.completeToSubmit')}
        </Text>
      </View>
    );
  }

  if (mode === 'inReview') {
    return (
      <View>
        <Text className="text-sm text-amber-200/90 leading-5">
          {t('profile.folderStatus.pendingReviewMessage')}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text className="text-sm text-emerald-300/90 leading-5">
        {t('profile.checklist.allReady')}
      </Text>
    </View>
  );
};
