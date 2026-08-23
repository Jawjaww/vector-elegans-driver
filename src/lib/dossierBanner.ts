export type ExpiringDocument = {
  document_type: string;
  expiry_date: string;
  days_remaining: number;
};

export type BannerKind =
  | 'expired'
  | 'expiring'
  | 'rejected'
  | 'pending_review'
  | 'incomplete'
  | 'validated'
  | null;

/** Priority helper for bottom-sheet banner (pure, testable). */
export function resolveDossierBanner(input: {
  expiredTypes: string[];
  expiring: ExpiringDocument[];
  rejectedTypes: string[];
  driverStatus: string | null;
  /** When status is active but ops completeness is false, still show incomplete. */
  isComplete?: boolean | null;
  /** One-shot after admin validation (realtime / focus transition). */
  justValidated?: boolean;
}): { kind: BannerKind; expiring?: ExpiringDocument } {
  if (input.expiredTypes.length > 0) {
    return { kind: 'expired' };
  }

  const sorted = [...input.expiring].sort(
    (a, b) => a.days_remaining - b.days_remaining,
  );
  if (sorted.length > 0) {
    return { kind: 'expiring', expiring: sorted[0] };
  }

  if (input.rejectedTypes.length > 0) {
    return { kind: 'rejected' };
  }

  if (
    input.justValidated &&
    input.driverStatus === 'active' &&
    input.isComplete !== false
  ) {
    return { kind: 'validated' };
  }

  if (
    input.driverStatus &&
    ['pending_review', 'pending_validation', 'submitted'].includes(
      input.driverStatus,
    )
  ) {
    return { kind: 'pending_review' };
  }

  if (
    input.driverStatus &&
    ['draft', 'incomplete', 'rejected'].includes(input.driverStatus)
  ) {
    return { kind: 'incomplete' };
  }

  // Defensive: active but not ops-complete (bad seed / premature admin approve)
  if (input.driverStatus === 'active' && input.isComplete === false) {
    return { kind: 'incomplete' };
  }

  return { kind: null };
}
