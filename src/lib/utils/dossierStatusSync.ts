import { canDriverGoOnline } from './driverDuty';

/**
 * Prevents a slow home-tab SELECT from overwriting a fresher realtime
 * drivers.status (admin just validated → toast, then stale pending_review).
 */
export function createDossierStatusSync() {
  let fetchGeneration = 0;
  let realtimeSeq = 0;
  let realtimeSeqAtFetchStart = 0;

  return {
    beginFetch(): number {
      fetchGeneration += 1;
      realtimeSeqAtFetchStart = realtimeSeq;
      return fetchGeneration;
    },
    noteRealtime(): void {
      realtimeSeq += 1;
    },
    shouldApplyFetch(startedAtGeneration: number): boolean {
      return shouldApplyFetchedDriverStatus({
        startedAtGeneration,
        latestFetchGeneration: fetchGeneration,
        realtimeAppliedAfterFetchStart: realtimeSeq > realtimeSeqAtFetchStart,
      });
    },
  };
}

/** Local switch + matching must drop when the dossier is no longer active. */
export function shouldForceOfflineForStatus(status: string | null): boolean {
  return !canDriverGoOnline(status);
}

/** Lightweight poll: only refetch dossier meta when status actually changed. */
export function shouldSyncDriverStatus(
  local: string | null,
  fresh: string | null,
): boolean {
  return fresh != null && fresh !== local;
}

export function shouldApplyFetchedDriverStatus(input: {
  startedAtGeneration: number;
  latestFetchGeneration: number;
  realtimeAppliedAfterFetchStart: boolean;
}): boolean {
  if (input.startedAtGeneration !== input.latestFetchGeneration) {
    return false;
  }
  if (input.realtimeAppliedAfterFetchStart) {
    return false;
  }
  return true;
}

export type OnlineToggleDecision =
  | { action: 'go-offline' }
  | { action: 'go-online'; status: string }
  | { action: 'refuse' };

/** Always re-read status when going online so a stale local pending_review cannot block. */
export async function decideOnlineToggle(input: {
  isOnline: boolean;
  localStatus: string | null;
  fetchFreshStatus: () => Promise<string | null>;
}): Promise<OnlineToggleDecision> {
  if (input.isOnline) {
    return { action: 'go-offline' };
  }
  const fresh = await input.fetchFreshStatus();
  const status = fresh ?? input.localStatus;
  if (!canDriverGoOnline(status) || !status) {
    return { action: 'refuse' };
  }
  return { action: 'go-online', status };
}
