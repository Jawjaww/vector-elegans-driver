import React from 'react';
import { Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
} from 'react-native-reanimated';
import { DriverDocumentUploader } from '../DriverDocumentUploader';
import { translateDocumentType } from '../../lib/documentTypeLabels';
import {
  hasDocumentFile,
  type DocumentTypeKey,
} from '../../lib/dossierChecklist';
import { canReplaceDocument, type DossierEditMode } from '../../lib/dossierEditMode';
import type { DocumentMetaMap, DocumentStatus } from './dossierWizardTypes';

export const REQUIRED_DOCUMENTS: DocumentTypeKey[] = [
  'driving_license',
  'vtc_card',
  'insurance',
  'id_card',
  'proof_of_address',
];

export function DossierDocumentsSection({
  animatedContentStyle,
  documents,
  documentMeta,
  documentsLoading,
  documentsLoadError,
  driverId,
  submitting,
  editMode,
  rejectedDocumentTypes,
  onUploadComplete,
  onExpiryDateChange,
}: Readonly<{
  animatedContentStyle: StyleProp<ViewStyle>;
  documents: DocumentStatus;
  documentMeta: DocumentMetaMap;
  documentsLoading: boolean;
  documentsLoadError: string | null;
  driverId: string | null;
  submitting: boolean;
  editMode: DossierEditMode;
  rejectedDocumentTypes: string[];
  onUploadComplete: (documentType: string, fileUrl: string, expiryDate?: string) => void;
  onExpiryDateChange: (documentType: string, expiryDate: string) => void;
}>) {
  const { t } = useTranslation();

  return (
    <Animated.View
      entering={FadeInRight.duration(300)}
      exiting={FadeOutLeft.duration(300)}
      style={animatedContentStyle}
      className="space-y-6"
    >
      <Text className="text-xl font-bold text-white mb-4">
        {t('profile.requiredDocuments')}
      </Text>
      <Text className="text-sm text-slate-400 mb-2">
        {t('profile.documentsSectionHint')}
      </Text>

      {documentsLoading ? (
        <Text className="text-xs text-slate-400 mb-2">
          {t('documents.loadingDocuments')}
        </Text>
      ) : null}
      {documentsLoadError ? (
        <Text className="text-xs text-amber-300 mb-2">{documentsLoadError}</Text>
      ) : null}

      {REQUIRED_DOCUMENTS.map((docType, index) => {
        const meta = documentMeta[docType];
        const isRejected = meta?.status === 'rejected';
        const filePresent = hasDocumentFile(docType, documents, documentMeta);
        const canReplace =
          !submitting &&
          canReplaceDocument(editMode, docType, meta?.status, rejectedDocumentTypes);
        const docValidationStatus = (meta?.status ?? 'pending') as
          | 'pending'
          | 'approved'
          | 'rejected';

        return (
          <Animated.View
            key={docType}
            entering={FadeInDown.duration(400).delay(index * 150)}
            className="mb-4"
          >
            <Animated.View
              entering={FadeInRight.duration(400).delay(index * 150 + 50)}
              className="flex-row items-center justify-between mb-2"
            >
              <Animated.Text
                entering={FadeInDown.duration(400).delay(index * 150 + 25)}
                className="text-sm text-white font-medium"
              >
                {translateDocumentType(t, docType)}
              </Animated.Text>
              {isRejected ? (
                <Text className="text-xs text-rose-400 font-medium">
                  {t('documents.status.rejected')}
                </Text>
              ) : null}
            </Animated.View>
            {isRejected && meta?.rejectionReason ? (
              <Text className="text-xs text-rose-300 mb-2">
                {t('documents.rejectionReason')}: {meta.rejectionReason}
              </Text>
            ) : null}
            {isRejected && !meta?.rejectionReason ? (
              <Text className="text-xs text-rose-300 mb-2">
                {t('documents.replaceRejectedHint')}
              </Text>
            ) : null}
            <Animated.View entering={FadeInRight.duration(400).delay(index * 150 + 100)}>
              <DriverDocumentUploader
                documentType={docType}
                onUploadComplete={(fileUrl, expiry) =>
                  onUploadComplete(docType, fileUrl, expiry)
                }
                onExpiryDateChange={(expiry) => onExpiryDateChange(docType, expiry)}
                driverId={driverId ?? undefined}
                currentUrl={documents[docType] || undefined}
                currentExpiry={meta?.expiryDate}
                documentStatus={docValidationStatus}
                canReplace={canReplace}
                hasFile={filePresent}
                editMode={editMode}
              />
            </Animated.View>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}
