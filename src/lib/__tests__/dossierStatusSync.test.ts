import {
  createDossierStatusSync,
  decideOnlineToggle,
  shouldApplyFetchedDriverStatus,
  shouldForceOfflineForStatus,
  shouldSyncDriverStatus,
} from '../utils/dossierStatusSync';

describe('shouldApplyFetchedDriverStatus', () => {
  it('applies when this fetch is still the latest and realtime did not win', () => {
    expect(
      shouldApplyFetchedDriverStatus({
        startedAtGeneration: 1,
        latestFetchGeneration: 1,
        realtimeAppliedAfterFetchStart: false,
      }),
    ).toBe(true);
  });

  it('drops a fetch that a newer fetch superseded', () => {
    expect(
      shouldApplyFetchedDriverStatus({
        startedAtGeneration: 1,
        latestFetchGeneration: 2,
        realtimeAppliedAfterFetchStart: false,
      }),
    ).toBe(false);
  });

  it('drops a fetch when realtime already applied a fresher status', () => {
    expect(
      shouldApplyFetchedDriverStatus({
        startedAtGeneration: 1,
        latestFetchGeneration: 1,
        realtimeAppliedAfterFetchStart: true,
      }),
    ).toBe(false);
  });
});

describe('createDossierStatusSync', () => {
  it('does not let a pending_review fetch overwrite a realtime active', () => {
    const sync = createDossierStatusSync();
    const gen = sync.beginFetch();
    sync.noteRealtime();
    expect(sync.shouldApplyFetch(gen)).toBe(false);
  });

  it('applies the latest fetch when realtime is quiet', () => {
    const sync = createDossierStatusSync();
    const gen = sync.beginFetch();
    expect(sync.shouldApplyFetch(gen)).toBe(true);
  });
});

describe('shouldForceOfflineForStatus', () => {
  it('forces offline when status is not active', () => {
    expect(shouldForceOfflineForStatus('pending_review')).toBe(true);
    expect(shouldForceOfflineForStatus('suspended')).toBe(true);
    expect(shouldForceOfflineForStatus(null)).toBe(true);
  });

  it('stays online-eligible when status is active', () => {
    expect(shouldForceOfflineForStatus('active')).toBe(false);
  });
});

describe('shouldSyncDriverStatus', () => {
  it('syncs when the server status differs from local', () => {
    expect(shouldSyncDriverStatus('active', 'pending_review')).toBe(true);
  });

  it('skips when status is unchanged or missing', () => {
    expect(shouldSyncDriverStatus('active', 'active')).toBe(false);
    expect(shouldSyncDriverStatus('active', null)).toBe(false);
  });
});

describe('decideOnlineToggle', () => {
  it('goes offline without hitting the server', async () => {
    const fetchFreshStatus = jest.fn();
    await expect(
      decideOnlineToggle({
        isOnline: true,
        localStatus: 'pending_review',
        fetchFreshStatus,
      }),
    ).resolves.toEqual({ action: 'go-offline' });
    expect(fetchFreshStatus).not.toHaveBeenCalled();
  });

  it('allows going online after a fresh active status even if local was stale', async () => {
    await expect(
      decideOnlineToggle({
        isOnline: false,
        localStatus: 'pending_review',
        fetchFreshStatus: async () => 'active',
      }),
    ).resolves.toEqual({ action: 'go-online', status: 'active' });
  });

  it('refuses when the server still says the dossier is not active', async () => {
    await expect(
      decideOnlineToggle({
        isOnline: false,
        localStatus: 'pending_review',
        fetchFreshStatus: async () => 'pending_review',
      }),
    ).resolves.toEqual({ action: 'refuse' });
  });
});
