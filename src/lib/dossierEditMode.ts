/** Dossier edit modes — mirrors driver_dossier_edit_mode() in Postgres. */

export type DossierEditMode = 'full' | 'rejected_only' | 'locked';

export function resolveDossierEditMode(input: {
  status: string;
  dossierUpdateRequested: boolean;
  rejectedDocumentTypes: string[];
}): DossierEditMode {
  const status = (input.status || 'draft').toLowerCase();

  if (status === 'draft' || status === 'rejected' || status === 'incomplete') {
    return 'full';
  }

  if (status === 'pending_review' || status === 'submitted') {
    if (input.dossierUpdateRequested) {
      return 'full';
    }
    if (input.rejectedDocumentTypes.length > 0) {
      return 'rejected_only';
    }
    return 'locked';
  }

  return 'locked';
}

export function canUpdateDocumentExpiry(
  mode: DossierEditMode,
  documentType: string,
  validationStatus?: string | null,
  rejectedDocumentTypes: string[] = [],
): boolean {
  if (mode === 'full') {
    return true;
  }
  if (mode === 'rejected_only') {
    if (validationStatus === 'rejected') {
      return true;
    }
    return rejectedDocumentTypes.includes(documentType);
  }
  return false;
}

export function canReplaceDocument(
  mode: DossierEditMode,
  documentType: string,
  validationStatus?: string | null,
  rejectedDocumentTypes: string[] = [],
): boolean {
  return canUpdateDocumentExpiry(
    mode,
    documentType,
    validationStatus,
    rejectedDocumentTypes,
  );
}

export function isProfileEditable(mode: DossierEditMode): boolean {
  return mode === 'full';
}
