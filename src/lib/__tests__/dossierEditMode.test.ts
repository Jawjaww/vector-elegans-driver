import {
  canReplaceDocument,
  canUpdateDocumentExpiry,
  isProfileEditable,
  resolveDossierEditMode,
} from '../dossierEditMode';

describe('resolveDossierEditMode', () => {
  it('returns full for draft and rejected', () => {
    expect(
      resolveDossierEditMode({
        status: 'draft',
        dossierUpdateRequested: false,
        rejectedDocumentTypes: [],
      }),
    ).toBe('full');
    expect(
      resolveDossierEditMode({
        status: 'rejected',
        dossierUpdateRequested: false,
        rejectedDocumentTypes: [],
      }),
    ).toBe('full');
  });

  it('returns full when admin requested an update', () => {
    expect(
      resolveDossierEditMode({
        status: 'pending_review',
        dossierUpdateRequested: true,
        rejectedDocumentTypes: [],
      }),
    ).toBe('full');
  });

  it('returns rejected_only when a document was rejected', () => {
    expect(
      resolveDossierEditMode({
        status: 'pending_review',
        dossierUpdateRequested: false,
        rejectedDocumentTypes: ['driving_license'],
      }),
    ).toBe('rejected_only');
  });

  it('returns locked for pending_review queue', () => {
    expect(
      resolveDossierEditMode({
        status: 'pending_review',
        dossierUpdateRequested: false,
        rejectedDocumentTypes: [],
      }),
    ).toBe('locked');
  });

  it('returns locked for active and ops drivers', () => {
    expect(
      resolveDossierEditMode({
        status: 'active',
        dossierUpdateRequested: false,
        rejectedDocumentTypes: [],
      }),
    ).toBe('locked');
    expect(
      resolveDossierEditMode({
        status: 'suspended',
        dossierUpdateRequested: false,
        rejectedDocumentTypes: [],
      }),
    ).toBe('locked');
  });
});

describe('canUpdateDocumentExpiry', () => {
  it('allows any document in full mode', () => {
    expect(
      canUpdateDocumentExpiry('full', 'insurance', 'approved'),
    ).toBe(true);
  });

  it('allows only rejected documents in rejected_only mode', () => {
    expect(
      canUpdateDocumentExpiry(
        'rejected_only',
        'driving_license',
        'rejected',
        ['driving_license'],
      ),
    ).toBe(true);
    expect(
      canUpdateDocumentExpiry(
        'rejected_only',
        'insurance',
        'approved',
        ['driving_license'],
      ),
    ).toBe(false);
  });

  it('denies all documents in locked mode', () => {
    expect(
      canUpdateDocumentExpiry('locked', 'driving_license', 'rejected'),
    ).toBe(false);
  });
});

describe('canReplaceDocument', () => {
  it('mirrors expiry rules', () => {
    expect(
      canReplaceDocument('rejected_only', 'vtc_card', 'pending', [
        'driving_license',
      ]),
    ).toBe(false);
  });
});

describe('isProfileEditable', () => {
  it('is true only in full mode', () => {
    expect(isProfileEditable('full')).toBe(true);
    expect(isProfileEditable('rejected_only')).toBe(false);
    expect(isProfileEditable('locked')).toBe(false);
  });
});
