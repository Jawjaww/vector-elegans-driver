import { MAP_PALETTE } from './mapPalette';
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

/**
 * Where a call to action sends the driver.
 *
 * `home` rather than `rides` for "see my ride": the Courses tab is the completed-ride history and
 * no longer carries the trip, which lives on the Home map — the screen that mounts the active
 * ride's controls. A CTA labelled "see my ride" landing on a list of rides already over would be
 * a wrong destination for a live ride.
 */
export type OfferNoticeCtaTarget = 'profile' | 'home';

export type OfferNoticeCopy = {
  titleKey: string;
  bodyKey: string;
  /**
   * Colour of the glyph, of the title, and of the call to action.
   *
   * A single value, and a step *down* the hue's ramp rather than the marker's own colour: the
   * notice is drawn on the pale glass face every map overlay shares (see `GlassPanel`), where
   * amber-400 or rose-400 at full strength sits under 3:1 contrast. `tripGuidanceAccent` made the
   * same move for the instruction bar, so the amber below is the step it landed on.
   */
  ink: string;
  icon: OfferNoticeIcon;
  /** Present only when the driver can act on the reason. */
  cta?: { labelKey: string; target: OfferNoticeCtaTarget };
};

/** amber-700 — the dark step of the warning hue, shared with the guidance bar's wait ink. */
const AMBER_INK = '#b45309';
/** red-700 — the dark step of the danger hue. */
const DANGER_INK = '#b91c1c';
/** The map's own contrasted outline: the notice's blue and the route's blue are the same blue. */
const INFO_INK = MAP_PALETTE.departureEdge;
/** slate-600 — a neutral step, still readable as body of type on the pale face. */
const MUTED_INK = '#475569';

/**
 * One entry per OfferNoticeReason — the Record type makes a new reason a
 * compile error until copy exists for it.
 */
export const OFFER_NOTICE_COPY: Record<OfferNoticeReason, OfferNoticeCopy> = {
  offer_expired: {
    titleKey: 'ride.offerNotice.offer_expired.title',
    bodyKey: 'ride.offerNotice.offer_expired.body',
    ink: AMBER_INK,
    icon: 'clock',
  },
  offer_declined: {
    titleKey: 'ride.offerNotice.offer_declined.title',
    bodyKey: 'ride.offerNotice.offer_declined.body',
    ink: MUTED_INK,
    icon: 'x-circle',
  },
  ride_taken: {
    titleKey: 'ride.offerNotice.ride_taken.title',
    bodyKey: 'ride.offerNotice.ride_taken.body',
    ink: MUTED_INK,
    icon: 'user-x',
  },
  already_accepted: {
    titleKey: 'ride.offerNotice.already_accepted.title',
    bodyKey: 'ride.offerNotice.already_accepted.body',
    ink: INFO_INK,
    icon: 'check-circle',
    cta: {
      labelKey: 'ride.offerNoticeCta.currentRide',
      target: 'home',
    },
  },
  matching_closed: {
    titleKey: 'ride.offerNotice.matching_closed.title',
    bodyKey: 'ride.offerNotice.matching_closed.body',
    ink: MUTED_INK,
    icon: 'slash',
  },
  dossier_inactive: {
    titleKey: 'ride.offerNotice.dossier_inactive.title',
    bodyKey: 'ride.offerNotice.dossier_inactive.body',
    ink: DANGER_INK,
    icon: 'shield-off',
    cta: {
      labelKey: 'ride.offerNoticeCta.profile',
      target: 'profile',
    },
  },
  already_on_ride: {
    titleKey: 'ride.offerNotice.already_on_ride.title',
    bodyKey: 'ride.offerNotice.already_on_ride.body',
    ink: AMBER_INK,
    icon: 'navigation',
    cta: {
      labelKey: 'ride.offerNoticeCta.currentRide',
      target: 'home',
    },
  },
  not_available: {
    titleKey: 'ride.offerNotice.not_available.title',
    bodyKey: 'ride.offerNotice.not_available.body',
    ink: MUTED_INK,
    icon: 'info',
  },
  unreachable: {
    titleKey: 'ride.offerNotice.unreachable.title',
    bodyKey: 'ride.offerNotice.unreachable.body',
    ink: DANGER_INK,
    icon: 'wifi-off',
  },
};
