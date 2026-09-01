import React, { useEffect, useRef } from 'react';
import {
  DOCUMENT_CHECKLIST_ITEMS,
  hasDocumentFile,
  isValidDocumentExpiry,
  type DocumentTypeKey,
  type DossierChecklistInput,
} from '../lib/dossierChecklist';
import { updateOwnDocumentExpiry } from '../lib/services/documentService';
import type { TFunction } from 'i18next';
import { showAppAlert } from '../components/AppDialog';

const FORM_EXPIRY_BY_DOC: Record<string, string> = {
  driving_license: 'driving_license_expiry_date',
  vtc_card: 'vtc_card_expiry_date',
};

export function getFormExpiryFieldForDocument(
  documentType: string,
): string | undefined {
  return FORM_EXPIRY_BY_DOC[documentType];
}

export async function persistDocumentExpiryIfNeeded(
  t: TFunction,
  params: {
    driverId: string;
    documentType: string;
    expiryDate: string;
    hasDocument: boolean;
  },
): Promise<boolean> {
  const trimmed = params.expiryDate.trim().slice(0, 10);
  if (!params.hasDocument || !isValidDocumentExpiry(trimmed)) {
    return true;
  }

  const result = await updateOwnDocumentExpiry(
    params.driverId,
    params.documentType,
    trimmed,
  );

  if (!result.success) {
    showAppAlert(
      t('documents.error'),
      result.error === 'expiry_date must be in the future'
        ? t('documents.expiryMustBeFuture')
        : (result.error ?? t('documents.failedToUpload')),
    );
    return false;
  }

  return true;
}

/** Push form/meta expiry dates onto uploaded driver_documents rows (and drivers via RPC). */
export async function syncUploadedDocumentExpiries(
  t: TFunction,
  driverId: string,
  input: Pick<DossierChecklistInput, 'formData' | 'documents' | 'documentMeta'>,
): Promise<boolean> {
  let allOk = true;

  for (const item of DOCUMENT_CHECKLIST_ITEMS) {
    const docType = item.id as DocumentTypeKey;
    const formField = getFormExpiryFieldForDocument(docType);
    const fromForm = formField
      ? String(input.formData[formField as keyof typeof input.formData] ?? '')
      : '';
    const fromMeta = input.documentMeta[docType]?.expiryDate ?? '';
    const expiryDate = (fromForm.trim() || fromMeta.trim()).slice(0, 10);
    if (expiryDate.length < 10) continue;
    if (!hasDocumentFile(docType, input.documents, input.documentMeta)) continue;

    const ok = await persistDocumentExpiryIfNeeded(t, {
      driverId,
      documentType: docType,
      expiryDate,
      hasDocument: true,
    });
    if (!ok) allOk = false;
  }

  return allOk;
}

/** Debounce expiry persistence while the user edits the date field. */
export function useDebouncedExpiryPersist(
  delayMs: number,
): (fn: () => void) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (fn: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, delayMs);
  };
}
