export type OtaUiPhase =
  | 'disabled'
  | 'checking'
  | 'downloading'
  | 'available'
  | 'pending'
  | 'error'
  | 'idle';

export type OtaPhaseInput = {
  isEnabled: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean;
  checkError?: Error;
  downloadError?: Error;
};

export type OtaActionResult =
  | { ok: true }
  | { ok: false; message: string };

/** Short label for logs and the profile screen. */
export function formatUpdateId(id: string | undefined | null): string {
  if (!id) return '—';
  const trimmed = id.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

/**
 * Maps `useUpdates()` flags to a single phase for copy and button visibility.
 * Active operations win over stale errors.
 */
export function deriveOtaUiPhase(input: OtaPhaseInput): OtaUiPhase {
  if (!input.isEnabled) return 'disabled';
  if (input.isChecking) return 'checking';
  if (input.isDownloading) return 'downloading';
  if (input.isUpdatePending) return 'pending';
  if (input.isUpdateAvailable) return 'available';
  if (input.checkError || input.downloadError) return 'error';
  return 'idle';
}
