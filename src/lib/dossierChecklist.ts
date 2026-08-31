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

export interface DossierChecklistInput {
  formData: Record<string, string | undefined>;
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

const FIELD_ITEMS: { id: string; labelKey: string; field: string }[] = [
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

const DOCUMENT_ITEMS: { id: DocumentTypeKey; labelKey: string; missingLabel: string }[] = [
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

function isFilled(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed !== '' && trimmed !== 'À compléter';
}

function fieldStatus(
  field: string,
  formData: Record<string, string | undefined>,
  missingForSubmit: string[],
): ChecklistItemStatus {
  if (isFilled(formData[field])) return 'provided';
  return 'missing';
}

function documentStatus(
  docType: DocumentTypeKey,
  documents: Partial<Record<DocumentTypeKey, string | null>>,
  documentMeta: DossierChecklistInput['documentMeta'],
  missingForSubmit: string[],
  missingLabel: string,
): ChecklistItemStatus {
  const meta = documentMeta[docType];
  if (meta?.status === 'rejected') return 'rejected';
  if (documents[docType]) return 'provided';
  if (missingForSubmit.some((m) => m.includes(missingLabel) || m.toLowerCase().includes(docType.replace('_', ' ')))) {
    return 'missing';
  }
  return 'missing';
}

export function buildChecklistItems(input: DossierChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  for (const { id, labelKey, field } of FIELD_ITEMS) {
    items.push({
      id,
      labelKey,
      status: fieldStatus(field, input.formData, input.missingForSubmit),
    });
  }

  items.push({
    id: 'avatar',
    labelKey: 'profile.checklist.avatar',
    status: input.avatarUrl?.trim() ? 'provided' : 'missing',
  });

  for (const doc of DOCUMENT_ITEMS) {
    items.push({
      id: doc.id,
      labelKey: doc.labelKey,
      status: documentStatus(
        doc.id,
        input.documents,
        input.documentMeta,
        input.missingForSubmit,
        doc.missingLabel,
      ),
    });
  }

  return items;
}
