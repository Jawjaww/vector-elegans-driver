import React, { useEffect, useRef } from 'react';
import {
  DOCUMENT_CHECKLIST_ITEMS,
  hasDocumentFile,
  isValidDocumentExpiry,
  type DocumentTypeKey,
  type DossierChecklistInput,
} from '../lib/dossierChecklist';
import {
  canUpdateDocumentExpiry,
  type DossierEditMode,
} from '../lib/dossierEditMode';
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

export function formatDocumentExpiryRpcError(
  t: TFunction,
  error?: string | null,
): string {
  if (!error) {
    return t('documents.failedToUpload');
  }
  const lower = error.toLowerCase();
  if (lower.includes('expiry_date must be in the future')) {
    return t('documents.expiryMustBeFuture');
  }
  if (
    lower.includes('can only update expiry on rejected documents') ||
    lower.includes('dossier not editable') ||
    lower.includes('dossier locked')
  ) {
    return t('documents.expiryLockedPendingReview');
  }
  if (lower.includes('not authenticated') || lower.includes('not authorized')) {
    return t('documents.notAuthenticated');
  }
  return t('documents.failedToUpload');
}

export async function persistDocumentExpiryIfNeeded(
  t: TFunction,
  params: {
    driverId: string;
    documentType: string;
    expiryDate: string;
    hasDocument: boolean;
    editMode: DossierEditMode;
    validationStatus?: string | null;
    rejectedDocumentTypes?: string[];
    serverExpiryDate?: string | null;
    silent?: boolean;
  },
): Promise<boolean> {
  const trimmed = params.expiryDate.trim().slice(0, 10);
  if (!params.hasDocument || !isValidDocumentExpiry(trimmed)) {
    return true;
  }

  if (
    !canUpdateDocumentExpiry(
      params.editMode,
      params.documentType,
      params.validationStatus,
      params.rejectedDocumentTypes ?? [],
    )
  ) {
    return true;
  }

  const serverYmd = (params.serverExpiryDate ?? '').trim().slice(0, 10);
  if (serverYmd.length >= 10 && serverYmd === trimmed) {
    return true;
  }

  const result = await updateOwnDocumentExpiry(
    params.driverId,
    params.documentType,
    trimmed,
  );

  if (!result.success) {
    if (!params.silent) {
      showAppAlert(
        t('documents.error'),
        formatDocumentExpiryRpcError(t, result.error),
      );
    }
    return false;
  }

  return true;
}

/** Push form/meta expiry dates onto uploaded driver_documents rows (and drivers via RPC). */
export async function syncUploadedDocumentExpiries(
  t: TFunction,
  driverId: string,
  input: Pick<DossierChecklistInput, 'formData' | 'documents' | 'documentMeta'>,
  options?: {
    editMode: DossierEditMode;
    rejectedDocumentTypes?: string[];
    silent?: boolean;
  },
): Promise<boolean> {
  if (!options || options.editMode === 'locked') {
    return true;
  }

  let allOk = true;
  const rejectedTypes = options.rejectedDocumentTypes ?? [];

  for (const item of DOCUMENT_CHECKLIST_ITEMS) {
    const docType = item.id as DocumentTypeKey;
    const meta = input.documentMeta[docType];
    const formField = getFormExpiryFieldForDocument(docType);
    const fromForm = formField
      ? String(input.formData[formField as keyof typeof input.formData] ?? '')
      : '';
    const fromMeta = meta?.expiryDate ?? '';
    const expiryDate = (fromForm.trim() || fromMeta.trim()).slice(0, 10);
    if (expiryDate.length < 10) continue;
    if (!hasDocumentFile(docType, input.documents, input.documentMeta)) continue;

    const ok = await persistDocumentExpiryIfNeeded(t, {
      driverId,
      documentType: docType,
      expiryDate,
      hasDocument: true,
      editMode: options.editMode,
      validationStatus: meta?.status,
      rejectedDocumentTypes: rejectedTypes,
      serverExpiryDate: meta?.expiryDate,
      silent: options.silent,
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
