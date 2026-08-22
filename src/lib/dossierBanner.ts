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
  | null;

/** Priority helper for bottom-sheet banner (pure, testable). */
export function resolveDossierBanner(input: {
  expiredTypes: string[];
  expiring: ExpiringDocument[];
  rejectedTypes: string[];
  driverStatus: string | null;
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

  return { kind: null };
}
