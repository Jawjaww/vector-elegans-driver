export type ChecklistItemStatus = 'missing' | 'provided' | 'rejected';

export interface ChecklistItem {
  id: string;
  labelKey: string;
  status: ChecklistItemStatus;
}

export type DocumentTypeKey =
  | 'driving_license'
  | 'vtc_card'
  | 'insurance'
  | 'id_card'
  | 'proof_of_address';

/** Form fields used by the dossier checklist (matches DriverProfileSetup). */
export interface DossierFormFields {
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  license_number: string;
  driving_license_expiry_date: string;
  vtc_card_number: string;
  vtc_card_expiry_date: string;
  insurance_number: string;
  company_siret: string;
  address: string;
  city: string;
  postal_code: string;
}

export interface DossierChecklistInput {
  formData: DossierFormFields;
  avatarUrl: string | null;
  documents: Partial<Record<DocumentTypeKey, string | null>>;
  documentMeta: Partial<
    Record<
      DocumentTypeKey,
      { status: string; rejectionReason: string | null; expiryDate: string | null }
    >
  >;
  missingForSubmit: string[];
}

export const DOCUMENT_CHECKLIST_ITEMS: {
  id: DocumentTypeKey;
  labelKey: string;
  missingLabel: string;
}[] = [
  {
    id: 'driving_license',
    labelKey: 'documents.driving_license',
    missingLabel: 'Document permis (avec date)',
  },
  {
    id: 'vtc_card',
    labelKey: 'documents.vtc_card',
    missingLabel: 'Document carte VTC (avec date)',
  },
  {
    id: 'insurance',
    labelKey: 'documents.insurance',
    missingLabel: 'Document assurance (avec date)',
  },
  {
    id: 'id_card',
    labelKey: 'documents.id_card',
    missingLabel: "Pièce d'identité (avec date)",
  },
  {
    id: 'proof_of_address',
    labelKey: 'documents.proof_of_address',
    missingLabel: 'Justificatif de domicile (avec date)',
  },
];

const FIELD_ITEMS: { id: string; labelKey: string; field: keyof DossierFormFields }[] = [
  { id: 'first_name', labelKey: 'profile.checklist.firstName', field: 'first_name' },
  { id: 'last_name', labelKey: 'profile.checklist.lastName', field: 'last_name' },
  { id: 'phone', labelKey: 'profile.checklist.phone', field: 'phone' },
  { id: 'date_of_birth', labelKey: 'profile.checklist.dateOfBirth', field: 'date_of_birth' },
  { id: 'address', labelKey: 'profile.checklist.address', field: 'address' },
  { id: 'city', labelKey: 'profile.checklist.city', field: 'city' },
  { id: 'postal_code', labelKey: 'profile.checklist.postalCode', field: 'postal_code' },
  {
    id: 'emergency_contact_name',
    labelKey: 'profile.checklist.emergencyName',
    field: 'emergency_contact_name',
  },
  {
    id: 'emergency_contact_phone',
    labelKey: 'profile.checklist.emergencyPhone',
    field: 'emergency_contact_phone',
  },
  {
    id: 'license_number',
    labelKey: 'profile.checklist.licenseNumber',
    field: 'license_number',
  },
  {
    id: 'driving_license_expiry_date',
    labelKey: 'profile.checklist.licenseExpiry',
    field: 'driving_license_expiry_date',
  },
  { id: 'vtc_card_number', labelKey: 'profile.checklist.vtcNumber', field: 'vtc_card_number' },
  {
    id: 'vtc_card_expiry_date',
    labelKey: 'profile.checklist.vtcExpiry',
    field: 'vtc_card_expiry_date',
  },
  {
    id: 'insurance_number',
    labelKey: 'profile.checklist.insuranceNumber',
    field: 'insurance_number',
  },
  { id: 'company_siret', labelKey: 'profile.checklist.siret', field: 'company_siret' },
];

function isFilled(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed !== '' && trimmed !== 'À compléter';
}

function isDocMissingInRpc(missingForSubmit: string[], missingLabel: string, docType: DocumentTypeKey): boolean {
  return missingForSubmit.some(
    (m) =>
      m.includes(missingLabel) ||
      m.toLowerCase().includes(docType.replaceAll('_', ' ')),
  );
}

export function resolveDocumentChecklistStatus(
  docType: DocumentTypeKey,
  documents: Partial<Record<DocumentTypeKey, string | null>>,
  documentMeta: DossierChecklistInput['documentMeta'],
  missingForSubmit: string[],
  missingLabel: string,
): ChecklistItemStatus {
  const meta = documentMeta[docType];
  if (meta?.status === 'rejected') return 'rejected';
  if (documents[docType]) return 'provided';
  if (meta && (meta.status === 'pending' || meta.status === 'approved')) {
    return 'provided';
  }
  if (missingForSubmit.length > 0 && !isDocMissingInRpc(missingForSubmit, missingLabel, docType)) {
    return 'provided';
  }
  return 'missing';
}

function fieldStatus(field: keyof DossierFormFields, formData: DossierFormFields): ChecklistItemStatus {
  if (isFilled(formData[field])) return 'provided';
  return 'missing';
}

export function buildDocumentChecklistItems(input: DossierChecklistInput): ChecklistItem[] {
  return DOCUMENT_CHECKLIST_ITEMS.map((doc) => ({
    id: doc.id,
    labelKey: doc.labelKey,
    status: resolveDocumentChecklistStatus(
      doc.id,
      input.documents,
      input.documentMeta,
      input.missingForSubmit,
      doc.missingLabel,
    ),
  }));
}

export function buildProfileChecklistItems(input: DossierChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = FIELD_ITEMS.map(({ id, labelKey, field }) => ({
    id,
    labelKey,
    status: fieldStatus(field, input.formData),
  }));

  items.push({
    id: 'avatar',
    labelKey: 'profile.checklist.avatar',
    status: input.avatarUrl?.trim() ? 'provided' : 'missing',
  });

  return items;
}

export function buildChecklistItems(input: DossierChecklistInput): ChecklistItem[] {
  return [...buildProfileChecklistItems(input), ...buildDocumentChecklistItems(input)];
}

export function isDocumentUploaded(
  docType: DocumentTypeKey,
  documents: Partial<Record<DocumentTypeKey, string | null>>,
  documentMeta: DossierChecklistInput['documentMeta'],
  missingForSubmit: string[],
): boolean {
  const item = DOCUMENT_CHECKLIST_ITEMS.find((d) => d.id === docType);
  if (!item) return false;
  const status = resolveDocumentChecklistStatus(
    docType,
    documents,
    documentMeta,
    missingForSubmit,
    item.missingLabel,
  );
  return status === 'provided' || status === 'rejected';
}
