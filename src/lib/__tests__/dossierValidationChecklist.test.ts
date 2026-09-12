import { resolveValidationChecklistMode } from '../folderStatus';

describe('resolveValidationChecklistMode', () => {
  it('never shows allReady for validated or ops statuses', () => {
    expect(
      resolveValidationChecklistMode({
        status: 'active',
        isComplete: true,
      }),
    ).toBe('validated');
    expect(
      resolveValidationChecklistMode({
        status: 'suspended',
        isComplete: true,
      }),
    ).toBe('ops');
    expect(
      resolveValidationChecklistMode({
        status: 'on_vacation',
        isComplete: true,
      }),
    ).toBe('ops');
  });

  it('shows allReady only when the dossier can still be submitted', () => {
    expect(
      resolveValidationChecklistMode({
        status: 'draft',
        isComplete: true,
      }),
    ).toBe('allReady');
    expect(
      resolveValidationChecklistMode({
        status: 'pending_review',
        dossierUpdateRequested: true,
        isComplete: true,
      }),
    ).toBe('allReady');
  });
});
