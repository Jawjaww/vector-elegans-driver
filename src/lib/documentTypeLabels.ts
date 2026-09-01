import type { TFunction } from 'i18next';

const DOCUMENT_TYPE_KEYS: Record<string, string> = {
  driving_license: 'documents.driving_license',
  vtc_card: 'documents.vtc_card',
  insurance: 'documents.insurance',
  id_card: 'documents.id_card',
  proof_of_address: 'documents.proof_of_address',
};

/** Human-readable document type (handles snake_case RPC values). */
export function translateDocumentType(
  t: TFunction,
  documentType: string | null | undefined,
): string {
  if (!documentType?.trim()) return t('documents.title');
  const key = DOCUMENT_TYPE_KEYS[documentType.trim()];
  if (key) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return documentType.replaceAll('_', ' ');
}
