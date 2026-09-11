import {
  resolveDossierBanner,
  resolveDossierBanners,
  sliceDossierBannerStack,
  noticesBodyHeight,
  buildDossierBannerCopy,
  type ExpiringDocument,
} from '../dossierBanner';

describe('resolveDossierBanner', () => {
  const expiring: ExpiringDocument = {
    document_type: 'vtc_card',
    expiry_date: '2026-09-01',
    days_remaining: 12,
  };

  it('prioritizes expired over expiring and rejected when status is active', () => {
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

  it('shows pending_review first when review is open and a document is rejected', () => {
    const result = resolveDossierBanner({
      expiredTypes: [],
      expiring: [],
      rejectedTypes: ['proof_of_address'],
      driverStatus: 'pending_review',
    });
    expect(result.kind).toBe('pending_review');
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
        driverStatus: 'suspended',
      }).kind,
    ).toBe('suspended');

    expect(
      resolveDossierBanner({
        expiredTypes: [],
        expiring: [],
        rejectedTypes: [],
        driverStatus: 'on_vacation',
      }).kind,
    ).toBe('on_vacation');

    expect(
      resolveDossierBanner({
        expiredTypes: [],
        expiring: [],
        rejectedTypes: [],
        driverStatus: 'draft',
      }).kind,
    ).toBe('incomplete');
  });

  it('shows incomplete when active but not ops-complete', () => {
    expect(
      resolveDossierBanner({
        expiredTypes: [],
        expiring: [],
        rejectedTypes: [],
        driverStatus: 'active',
        isComplete: false,
      }).kind,
    ).toBe('incomplete');
  });

  it('shows validated one-shot when active after admin approval', () => {
    expect(
      resolveDossierBanner({
        expiredTypes: [],
        expiring: [],
        rejectedTypes: [],
        driverStatus: 'active',
        isComplete: true,
        justValidated: true,
      }).kind,
    ).toBe('validated');
  });

  it('hides banner when active and ops-complete', () => {
    expect(
      resolveDossierBanner({
        expiredTypes: [],
        expiring: [],
        rejectedTypes: [],
        driverStatus: 'active',
        isComplete: true,
      }).kind,
    ).toBeNull();
  });
});

describe('resolveDossierBanners', () => {
  it('stacks pending_review with a rejected document as two kinds', () => {
    const stack = resolveDossierBanners({
      expiredTypes: [],
      expiring: [],
      rejectedTypes: ['proof_of_address'],
      driverStatus: 'pending_review',
    });
    expect(stack.map((h) => h.kind)).toEqual(['pending_review', 'rejected']);
    expect(stack.map((h) => h.slot)).toEqual(['status', 'document']);
    expect(resolveDossierBanner({
      expiredTypes: [],
      expiring: [],
      rejectedTypes: ['proof_of_address'],
      driverStatus: 'pending_review',
    }).kind).toBe(stack[0].kind);
  });

  it('keeps validated one-shot at the front of the stack', () => {
    const stack = resolveDossierBanners({
      expiredTypes: ['insurance'],
      expiring: [],
      rejectedTypes: [],
      driverStatus: 'active',
      isComplete: true,
      justValidated: true,
    });
    expect(stack.map((h) => h.kind)).toEqual(['validated', 'expired']);
    expect(
      resolveDossierBanner({
        expiredTypes: ['insurance'],
        expiring: [],
        rejectedTypes: [],
        driverStatus: 'active',
        isComplete: true,
        justValidated: true,
      }).kind,
    ).toBe('validated');
  });

  it('slices to two visible cards and an overflow count', () => {
    const sliced = sliceDossierBannerStack([
      { kind: 'pending_review', slot: 'status' },
      { kind: 'expired', slot: 'document' },
      { kind: 'rejected', slot: 'document' },
    ]);
    expect(sliced.visible.map((h) => h.kind)).toEqual([
      'pending_review',
      'expired',
    ]);
    expect(sliced.overflowCount).toBe(1);
  });
});

describe('noticesBodyHeight', () => {
  it('grows with the number of cards', () => {
    expect(noticesBodyHeight(0)).toBe(0);
    expect(noticesBodyHeight(1)).toBe(100);
    expect(noticesBodyHeight(2)).toBe(188);
    expect(noticesBodyHeight(3)).toBe(220);
  });
});

describe('buildDossierBannerCopy', () => {
  it('asks the driver to consult the dossier when a document is rejected', () => {
    expect(
      buildDossierBannerCopy({
        kind: 'rejected',
        expiredLabels: [],
        rejectedReason: null,
      }),
    ).toMatchObject({
      title: 'Consultez votre dossier',
      subtitle:
        'Un document doit être renvoyé. Ouvrez la page de validation pour le détail.',
    });
  });

  it('uses a dossier-level title when the rejected card is the status slot', () => {
    expect(
      buildDossierBannerCopy({
        kind: 'rejected',
        slot: 'status',
        expiredLabels: [],
        rejectedReason: null,
      }).title,
    ).toBe('Dossier rejeté');
  });

  it('keeps the admin rejection reason as subtitle when present', () => {
    expect(
      buildDossierBannerCopy({
        kind: 'rejected',
        expiredLabels: [],
        rejectedReason: 'Photo illisible',
      }).subtitle,
    ).toBe('Photo illisible');
  });

  it('asks the driver to consult the dossier after a reopen without a targeted document', () => {
    expect(
      buildDossierBannerCopy({
        kind: 'pending_review',
        expiredLabels: [],
        rejectedReason: null,
      }),
    ).toMatchObject({
      title: 'Dossier en cours de vérification',
      subtitle:
        'Vous ne pouvez pas recevoir de nouvelles courses tant que le dossier n’est pas validé.',
    });
  });
});
