import {
  buildChecklistItems,
  computeWizardCompletion,
  driverFacingSubmitGaps,
  resolveDocumentChecklistStatus,
  type DossierChecklistInput,
} from '../dossierChecklist';

const baseInput = (): DossierChecklistInput => ({
  formData: {
    first_name: 'Jean',
    last_name: 'Dupont',
    phone: '+33612345678',
    date_of_birth: '1990-01-01',
    address: '1 rue Test',
    city: 'Paris',
    postal_code: '75001',
    emergency_contact_name: 'Marie',
    emergency_contact_phone: '+33698765432',
    license_number: '123456789012',
    driving_license_expiry_date: '2030-01-01',
    vtc_card_number: 'VTC123',
    vtc_card_expiry_date: '2030-01-01',
    insurance_number: 'ASS123',
    company_siret: '12345678901234',
    license_plate: 'AA-123-BB',
  },
  avatarUrl: 'https://example.com/avatar.jpg',
  documents: {
    driving_license: 'path/license.jpg',
    vtc_card: 'path/vtc.jpg',
    insurance: 'path/insurance.jpg',
    id_card: 'path/id.jpg',
    proof_of_address: 'path/address.jpg',
  },
  documentMeta: {
    driving_license: { status: 'pending', rejectionReason: null, expiryDate: '2030-01-01' },
    vtc_card: { status: 'pending', rejectionReason: null, expiryDate: '2030-01-01' },
    insurance: { status: 'pending', rejectionReason: null, expiryDate: '2030-01-01' },
    id_card: { status: 'pending', rejectionReason: null, expiryDate: '2030-01-01' },
    proof_of_address: { status: 'pending', rejectionReason: null, expiryDate: '2030-01-01' },
  },
  missingForSubmit: [],
});

describe('buildChecklistItems', () => {
  it('marks all items provided when form, avatar and docs are complete', () => {
    const items = buildChecklistItems(baseInput());
    expect(items.every((i) => i.status === 'provided')).toBe(true);
  });

  it('marks rejected document even when URL is present', () => {
    const input = baseInput();
    input.documentMeta.driving_license = {
      status: 'rejected',
      rejectionReason: 'Blurry photo',
      expiryDate: '2030-01-01',
    };
    const items = buildChecklistItems(input);
    const license = items.find((i) => i.id === 'driving_license');
    expect(license?.status).toBe('rejected');
  });

  it('marks missing profile field when empty', () => {
    const input = baseInput();
    input.formData.first_name = '';
    const items = buildChecklistItems(input);
    const firstName = items.find((i) => i.id === 'first_name');
    expect(firstName?.status).toBe('missing');
  });

  it('marks missing document when no URL', () => {
    const input = baseInput();
    input.documents.driving_license = null;
    input.documentMeta.driving_license = undefined;
    input.missingForSubmit = ['Document permis (avec date)'];
    const items = buildChecklistItems(input);
    const license = items.find((i) => i.id === 'driving_license');
    expect(license?.status).toBe('missing');
  });

  it('marks missing document when no URL even if RPC missing list is empty', () => {
    const input = baseInput();
    input.documents.driving_license = null;
    input.documentMeta.driving_license = undefined;
    input.missingForSubmit = [];
    const items = buildChecklistItems(input);
    const license = items.find((i) => i.id === 'driving_license');
    expect(license?.status).toBe('missing');
  });

  it('stays below 100% without a vehicle plate', () => {
    const input = baseInput();
    input.formData.license_plate = '';
    const progress = computeWizardCompletion(input);
    expect(progress.percentage).toBeLessThan(100);
    expect(progress.missing.some((i) => i.id === 'license_plate')).toBe(true);
  });

  it('reaches 100% when wizard fields include a vehicle plate', () => {
    const progress = computeWizardCompletion(baseInput());
    expect(progress.percentage).toBe(100);
    expect(progress.missing).toHaveLength(0);
  });

  it('drops below 100% when a document is missing', () => {
    const input = baseInput();
    input.documents.proof_of_address = null;
    input.documentMeta.proof_of_address = undefined;
    const progress = computeWizardCompletion(input);
    expect(progress.percentage).toBeLessThan(100);
    expect(progress.missing.some((i) => i.id === 'proof_of_address')).toBe(true);
  });

  it('marks document provided when meta pending even without URL', () => {
    const input = baseInput();
    input.documents.driving_license = null;
    input.documentMeta.driving_license = {
      status: 'pending',
      rejectionReason: null,
      expiryDate: '2030-01-01',
    };
    input.missingForSubmit = ['Prénom'];
    const status = resolveDocumentChecklistStatus(
      'driving_license',
      input.documents,
      input.documentMeta,
    );
    expect(status).toBe('provided');
  });
});

describe('driverFacingSubmitGaps', () => {
  it('hides admin-review labels and keeps the vehicle plate', () => {
    const gaps = driverFacingSubmitGaps([
      'Document permis (avec date)',
      'Document permis (approuvé et valide)',
      "Plaque d'immatriculation (véhicule)",
    ]);
    expect(gaps).toEqual([
      'Document permis (avec date)',
      "Plaque d'immatriculation (véhicule)",
    ]);
  });
});
