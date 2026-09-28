import type { DocumentTypeKey } from '../../lib/dossierChecklist';

/** Fields the wizard edits on `drivers` (excludes vehicle plate, which lives on the vehicle form). */
export interface DriverProfileData {
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

export type DocumentStatus = Record<DocumentTypeKey, string | null>;

export type DocumentMetaEntry = {
  status: string;
  rejectionReason: string | null;
  expiryDate: string | null;
};

export type DocumentMetaMap = Partial<Record<DocumentTypeKey, DocumentMetaEntry>>;
