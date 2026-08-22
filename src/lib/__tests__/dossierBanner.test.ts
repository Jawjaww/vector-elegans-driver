import { resolveDossierBanner, type ExpiringDocument } from '../dossierBanner';

describe('resolveDossierBanner', () => {
  const expiring: ExpiringDocument = {
    document_type: 'vtc_card',
    expiry_date: '2026-09-01',
    days_remaining: 12,
  };

  it('prioritizes expired over expiring and rejected', () => {
    const result = resolveDossierBanner({
      expiredTypes: ['driving_license'],
      expiring: [expiring],
      rejectedTypes: ['insurance'],
      driverStatus: 'active',
    });
    expect(result.kind).toBe('expired');
  });

  it('prioritizes nearest expiring when nothing expired', () => {
    const result = resolveDossierBanner({
      expiredTypes: [],
      expiring: [
        { ...expiring, days_remaining: 40 },
        { ...expiring, document_type: 'insurance', days_remaining: 5 },
      ],
      rejectedTypes: ['id_card'],
      driverStatus: 'active',
    });
    expect(result.kind).toBe('expiring');
    expect(result.expiring?.document_type).toBe('insurance');
    expect(result.expiring?.days_remaining).toBe(5);
  });

  it('shows rejected when no expiry alerts', () => {
    const result = resolveDossierBanner({
      expiredTypes: [],
      expiring: [],
      rejectedTypes: ['proof_of_address'],
      driverStatus: 'pending_review',
    });
    expect(result.kind).toBe('rejected');
  });

  it('falls back to pending_review then incomplete', () => {
    expect(
      resolveDossierBanner({
        expiredTypes: [],
        expiring: [],
        rejectedTypes: [],
        driverStatus: 'pending_review',
      }).kind,
    ).toBe('pending_review');

    expect(
      resolveDossierBanner({
        expiredTypes: [],
        expiring: [],
        rejectedTypes: [],
        driverStatus: 'draft',
      }).kind,
    ).toBe('incomplete');
  });
});
