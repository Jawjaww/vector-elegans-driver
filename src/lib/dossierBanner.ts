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
  | 'suspended'
  | 'on_vacation'
  | 'incomplete'
  | 'validated'
  | null;

export type DossierBannerSlot = 'status' | 'document';

export type DossierBannerIcon =
  | 'alert-triangle'
  | 'file-text'
  | 'clock'
  | 'check-circle';

export type DossierBannerCopy = {
  title: string;
  subtitle: string;
  accent: string;
  icon: DossierBannerIcon;
};

export type DossierBannerInput = {
  expiredTypes: string[];
  expiring: ExpiringDocument[];
  rejectedTypes: string[];
  driverStatus: string | null;
  /** When status is active but ops completeness is false, still show incomplete. */
  isComplete?: boolean | null;
  /** One-shot after admin validation (realtime / focus transition). */
  justValidated?: boolean;
};

export type DossierBannerHit = {
  kind: NonNullable<BannerKind>;
  slot: DossierBannerSlot;
  expiring?: ExpiringDocument;
};

export type DossierBannerStackSlice = {
  visible: DossierBannerHit[];
  overflowCount: number;
};

const CONSULT_TITLE = 'Consultez votre dossier';
const REJECTED_FALLBACK =
  'Un document doit être renvoyé. Ouvrez la page de validation pour le détail.';
const DOSSIER_REJECTED_SUBTITLE =
  'Votre dossier a été rejeté. Ouvrez votre profil pour corriger.';

const REVIEW_STATUSES = new Set([
  'pending_review',
  'pending_validation',
  'submitted',
]);
const INCOMPLETE_STATUSES = new Set(['draft', 'incomplete']);

/** Visible cards in the bottomsheet (extra hits collapse to +N). */
export const MAX_VISIBLE_DOSSIER_BANNERS = 2;

/** Snap body heights: 1 card ~100, 2 ~188, +counter ~220. */
export const NOTICES_HEIGHT_ONE = 100;
export const NOTICES_HEIGHT_TWO = 188;
export const NOTICES_HEIGHT_OVERFLOW = 220;

function resolveStatusBanner(
  input: DossierBannerInput,
): DossierBannerHit | null {
  if (
    input.justValidated &&
    input.driverStatus === 'active' &&
    input.isComplete !== false
  ) {
    return { kind: 'validated', slot: 'status' };
  }

  if (input.driverStatus === 'suspended') {
    return { kind: 'suspended', slot: 'status' };
  }

  if (input.driverStatus === 'on_vacation') {
    return { kind: 'on_vacation', slot: 'status' };
  }

  if (input.driverStatus && REVIEW_STATUSES.has(input.driverStatus)) {
    return { kind: 'pending_review', slot: 'status' };
  }

  if (input.driverStatus === 'rejected') {
    return { kind: 'rejected', slot: 'status' };
  }

  if (input.driverStatus && INCOMPLETE_STATUSES.has(input.driverStatus)) {
    return { kind: 'incomplete', slot: 'status' };
  }

  if (input.driverStatus === 'active' && input.isComplete === false) {
    return { kind: 'incomplete', slot: 'status' };
  }

  return null;
}

function resolveDocumentBanner(
  input: DossierBannerInput,
): DossierBannerHit | null {
  if (input.expiredTypes.length > 0) {
    return { kind: 'expired', slot: 'document' };
  }

  const sorted = [...input.expiring].sort(
    (a, b) => a.days_remaining - b.days_remaining,
  );
  if (sorted.length > 0) {
    return { kind: 'expiring', slot: 'document', expiring: sorted[0] };
  }

  if (input.rejectedTypes.length > 0) {
    return { kind: 'rejected', slot: 'document' };
  }

  return null;
}

/** Status card then one document card (expired > expiring > rejected). */
export function resolveDossierBanners(
  input: DossierBannerInput,
): DossierBannerHit[] {
  const stack: DossierBannerHit[] = [];
  const status = resolveStatusBanner(input);
  if (status) stack.push(status);
  const document = resolveDocumentBanner(input);
  if (document) stack.push(document);
  return stack;
}

export function sliceDossierBannerStack(
  stack: DossierBannerHit[],
  maxVisible = MAX_VISIBLE_DOSSIER_BANNERS,
): DossierBannerStackSlice {
  return {
    visible: stack.slice(0, maxVisible),
    overflowCount: Math.max(0, stack.length - maxVisible),
  };
}

/** First card of the stack (legacy single-banner callers). */
export function resolveDossierBanner(input: DossierBannerInput): {
  kind: BannerKind;
  expiring?: ExpiringDocument;
} {
  const first = resolveDossierBanners(input)[0];
  if (!first) return { kind: null };
  return { kind: first.kind, expiring: first.expiring };
}

/** Bottomsheet `notices` body height from stack length. */
export function noticesBodyHeight(stackLength: number): number {
  if (stackLength <= 0) return 0;
  if (stackLength === 1) return NOTICES_HEIGHT_ONE;
  if (stackLength === 2) return NOTICES_HEIGHT_TWO;
  return NOTICES_HEIGHT_OVERFLOW;
}

/** Copy for the home bottomsheet banner (pure, testable). */
export function buildDossierBannerCopy(input: {
  kind: NonNullable<BannerKind>;
  slot?: DossierBannerSlot;
  expiring?: ExpiringDocument;
  expiredLabels: string[];
  expiringLabel?: string;
  rejectedReason: string | null;
}): DossierBannerCopy {
  switch (input.kind) {
    case 'expired': {
      const labels = input.expiredLabels;
      return {
        title: labels.length > 1 ? 'Documents expirés' : 'Document expiré',
        subtitle: `Remplacez : ${labels.join(', ')}`,
        accent: '#fb7185',
        icon: 'file-text',
      };
    }
    case 'expiring': {
      const days = input.expiring?.days_remaining ?? 0;
      let title = 'Rappel de validité';
      let accent = '#fbbf24';
      if (days <= 7) {
        title = 'Expiration imminente';
        accent = '#fb7185';
      } else if (days <= 30) {
        title = 'À renouveler bientôt';
      }
      return {
        title,
        subtitle: `${input.expiringLabel ?? ''} expire dans ${days} jour(s) (${input.expiring?.expiry_date ?? ''})`,
        accent,
        icon: 'clock',
      };
    }
    case 'rejected':
      if (input.slot === 'status') {
        return {
          title: 'Dossier rejeté',
          subtitle: DOSSIER_REJECTED_SUBTITLE,
          accent: '#fb7185',
          icon: 'file-text',
        };
      }
      return {
        title: CONSULT_TITLE,
        subtitle: input.rejectedReason?.trim() || REJECTED_FALLBACK,
        accent: '#fb7185',
        icon: 'file-text',
      };
    case 'pending_review':
      return {
        title: 'Dossier en cours de vérification',
        subtitle:
          'Vous ne pouvez pas recevoir de nouvelles courses tant que le dossier n’est pas validé.',
        accent: '#fbbf24',
        icon: 'alert-triangle',
      };
    case 'suspended':
      return {
        title: 'Compte suspendu',
        subtitle: 'Vous ne pouvez plus recevoir de courses.',
        accent: '#fb7185',
        icon: 'alert-triangle',
      };
    case 'on_vacation':
      return {
        title: 'En congé',
        subtitle: 'Réactivation nécessaire pour recevoir des courses.',
        accent: '#fbbf24',
        icon: 'clock',
      };
    case 'validated':
      return {
        title: 'Dossier validé',
        subtitle:
          'Vous pouvez désormais passer en ligne et accepter des courses.',
        accent: '#34d399',
        icon: 'check-circle',
      };
    default:
      return {
        title: 'Profil incomplet',
        subtitle: 'Complétez votre profil pour commencer.',
        accent: '#fbbf24',
        icon: 'alert-triangle',
      };
  }
}
