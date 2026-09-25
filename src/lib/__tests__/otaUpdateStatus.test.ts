import {
  deriveOtaUiPhase,
  formatUpdateId,
} from '../updates/otaUpdateStatus';

describe('formatUpdateId', () => {
  it('returns a dash when missing', () => {
    expect(formatUpdateId(undefined)).toBe('—');
    expect(formatUpdateId(null)).toBe('—');
  });

  it('shortens canonical UUIDs', () => {
    expect(
      formatUpdateId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    ).toBe('aaaaaaaa…eeee');
  });
});

describe('deriveOtaUiPhase', () => {
  const enabled = {
    isEnabled: true,
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    isUpdatePending: false,
  };

  it('reports disabled when updates are off', () => {
    expect(deriveOtaUiPhase({ ...enabled, isEnabled: false })).toBe('disabled');
  });

  it('prioritises checking and downloading', () => {
    expect(
      deriveOtaUiPhase({
        ...enabled,
        isChecking: true,
        isUpdateAvailable: true,
      }),
    ).toBe('checking');
    expect(
      deriveOtaUiPhase({
        ...enabled,
        isDownloading: true,
        isUpdatePending: true,
      }),
    ).toBe('downloading');
  });

  it('surfaces pending and available', () => {
    expect(deriveOtaUiPhase({ ...enabled, isUpdatePending: true })).toBe(
      'pending',
    );
    expect(deriveOtaUiPhase({ ...enabled, isUpdateAvailable: true })).toBe(
      'available',
    );
  });

  it('shows errors when idle', () => {
    expect(
      deriveOtaUiPhase({
        ...enabled,
        checkError: new Error('network'),
      }),
    ).toBe('error');
  });

  it('defaults to idle', () => {
    expect(deriveOtaUiPhase(enabled)).toBe('idle');
  });
});
