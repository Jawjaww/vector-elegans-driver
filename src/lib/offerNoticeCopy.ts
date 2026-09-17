import type { OfferNoticeReason } from './utils/offerOpenOutcome';

/** Feather glyph used by the notice card. */
export type OfferNoticeIcon =
  | 'clock'
  | 'x-circle'
  | 'user-x'
  | 'check-circle'
  | 'slash'
  | 'shield-off'
  | 'navigation'
  | 'info'
  | 'wifi-off';

export type OfferNoticeCtaTarget = 'profile' | 'rides';

export type OfferNoticeCopy = {
  titleKey: string;
  bodyKey: string;
  accent: string;
  accentBackground: string;
  icon: OfferNoticeIcon;
  /** Present only when the driver can act on the reason. */
  cta?: { labelKey: string; target: OfferNoticeCtaTarget };
};

const AMBER = '#fbbf24';
const AMBER_BG = 'rgba(251, 191, 36, 0.2)';
const DANGER = '#fb7185';
const DANGER_BG = 'rgba(251, 113, 133, 0.2)';
const INFO = '#60a5fa';
const INFO_BG = 'rgba(96, 165, 250, 0.2)';
const MUTED = '#94a3b8';
const MUTED_BG = 'rgba(148, 163, 184, 0.2)';

/**
 * One entry per OfferNoticeReason — the Record type makes a new reason a
 * compile error until copy exists for it.
 */
export const OFFER_NOTICE_COPY: Record<OfferNoticeReason, OfferNoticeCopy> = {
  offer_expired: {
    titleKey: 'ride.offerNotice.offer_expired.title',
    bodyKey: 'ride.offerNotice.offer_expired.body',
    accent: AMBER,
    accentBackground: AMBER_BG,
    icon: 'clock',
  },
  offer_declined: {
    titleKey: 'ride.offerNotice.offer_declined.title',
    bodyKey: 'ride.offerNotice.offer_declined.body',
    accent: MUTED,
    accentBackground: MUTED_BG,
    icon: 'x-circle',
  },
  ride_taken: {
    titleKey: 'ride.offerNotice.ride_taken.title',
    bodyKey: 'ride.offerNotice.ride_taken.body',
    accent: MUTED,
    accentBackground: MUTED_BG,
    icon: 'user-x',
  },
  already_accepted: {
    titleKey: 'ride.offerNotice.already_accepted.title',
    bodyKey: 'ride.offerNotice.already_accepted.body',
    accent: INFO,
    accentBackground: INFO_BG,
    icon: 'check-circle',
    cta: {
      labelKey: 'ride.offerNoticeCta.currentRide',
      target: 'rides',
    },
  },
  matching_closed: {
    titleKey: 'ride.offerNotice.matching_closed.title',
    bodyKey: 'ride.offerNotice.matching_closed.body',
    accent: MUTED,
    accentBackground: MUTED_BG,
    icon: 'slash',
  },
  dossier_inactive: {
    titleKey: 'ride.offerNotice.dossier_inactive.title',
    bodyKey: 'ride.offerNotice.dossier_inactive.body',
    accent: DANGER,
    accentBackground: DANGER_BG,
    icon: 'shield-off',
    cta: {
      labelKey: 'ride.offerNoticeCta.profile',
      target: 'profile',
    },
  },
  already_on_ride: {
    titleKey: 'ride.offerNotice.already_on_ride.title',
    bodyKey: 'ride.offerNotice.already_on_ride.body',
    accent: AMBER,
    accentBackground: AMBER_BG,
    icon: 'navigation',
    cta: {
      labelKey: 'ride.offerNoticeCta.currentRide',
      target: 'rides',
    },
  },
  not_available: {
    titleKey: 'ride.offerNotice.not_available.title',
    bodyKey: 'ride.offerNotice.not_available.body',
    accent: MUTED,
    accentBackground: MUTED_BG,
    icon: 'info',
  },
  unreachable: {
    titleKey: 'ride.offerNotice.unreachable.title',
    bodyKey: 'ride.offerNotice.unreachable.body',
    accent: DANGER,
    accentBackground: DANGER_BG,
    icon: 'wifi-off',
  },
};
