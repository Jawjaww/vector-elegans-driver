import type { Ride } from '../stores/driverStore';
import { toAppRide, type RideRow } from './toAppRide';
import { isRideStillOfferable } from './ridePickup';

/**
 * Offer lifecycle state as returned by get_driver_offer_ride.
 * `alive` is the server's verdict: status `offered` and not past `expires_at`.
 */
export type DriverOfferState = {
  status: string;
  waveN: number | null;
  offeredAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
  alive: boolean;
};

/**
 * Why a ride opened from a notification cannot be handed to the driver.
 * Each reason maps to its own message so the failure is never silent.
 */
export type OfferNoticeReason =
  | 'offer_expired'
  | 'offer_declined'
  | 'ride_taken'
  | 'already_accepted'
  | 'matching_closed'
  | 'dossier_inactive'
  | 'already_on_ride'
  | 'not_available'
  | 'unreachable';

export type OfferNotice = {
  reason: OfferNoticeReason;
  /** Present when the ride was readable — lets the notice name the destination. */
  ride: Ride | null;
};

export type OfferOpenOutcome =
  | { kind: 'overlay'; ride: Ride }
  | { kind: 'notice'; notice: OfferNotice };

/** Result of reading the ride behind a tapped notification. */
export type OfferOpenFetch =
  | { ok: true; ride: Ride; offer: DriverOfferState }
  | { ok: false; reason: string };

export type OfferOpenContext = {
  /** drivers.status — only `active` may accept. */
  driverStatus: string | null | undefined;
  activeRideId: string | null;
  /**
   * Driver is online. Accepted but never gating: an offline driver must still be
   * shown the offer and be brought online by accepting it. Pinned by a test so a
   * future gate cannot quietly reintroduce the silence.
   */
  isOnline?: boolean;
  myDriverId?: string | null;
  nowMs?: number;
};

const NETWORK_REASON = 'network';

function notice(reason: OfferNoticeReason, ride: Ride | null): OfferOpenOutcome {
  return { kind: 'notice', notice: { reason, ride } };
}

/**
 * Decide what a tapped ride_offer notification should do.
 *
 * Offline is deliberately NOT a gate: the driver may open an offer while offline
 * and be brought online by accepting it. Only the ability to accept gates here.
 */
export function resolveOfferOpenOutcome(
  fetch: OfferOpenFetch,
  context: OfferOpenContext,
): OfferOpenOutcome {
  if (!fetch.ok) {
    return notice(
      fetch.reason === NETWORK_REASON ? 'unreachable' : 'not_available',
      null,
    );
  }

  const { ride, offer } = fetch;

  if (offer.status === 'accepted') {
    return notice('already_accepted', ride);
  }
  if (ride.driver_id && ride.driver_id !== (context.myDriverId ?? null)) {
    return notice('ride_taken', ride);
  }
  if (offer.status === 'expired_taken') {
    return notice('ride_taken', ride);
  }
  if (offer.status === 'declined') {
    return notice('offer_declined', ride);
  }
  if (!offer.alive) {
    return notice('offer_expired', ride);
  }
  if (!isRideStillOfferable(ride, context.nowMs ?? Date.now())) {
    return notice('matching_closed', ride);
  }
  if ((context.driverStatus ?? '') !== 'active') {
    return notice('dossier_inactive', ride);
  }
  if (context.activeRideId) {
    return notice('already_on_ride', ride);
  }
  return { kind: 'overlay', ride };
}

type RawOfferRidePayload = {
  success?: boolean;
  reason?: string;
  ride?: unknown;
  offer?: {
    status?: string;
    wave_n?: number | null;
    offered_at?: string | null;
    expires_at?: string | null;
    responded_at?: string | null;
    alive?: boolean;
  } | null;
};

/**
 * Normalise the get_driver_offer_ride jsonb payload into the app shape.
 * Anything that is not an explicit success becomes a failure with a reason.
 */
export function toOfferOpenFetch(data: unknown): OfferOpenFetch {
  const raw = (data ?? {}) as RawOfferRidePayload;
  if (raw.success !== true || !raw.ride || typeof raw.ride !== 'object') {
    return { ok: false, reason: raw.reason ?? 'request_failed' };
  }

  const offer = raw.offer ?? {};
  return {
    ok: true,
    ride: toAppRide(raw.ride as Partial<RideRow> & Pick<RideRow, 'id'>),
    offer: {
      status: offer.status ?? '',
      waveN: offer.wave_n ?? null,
      offeredAt: offer.offered_at ?? null,
      expiresAt: offer.expires_at ?? null,
      respondedAt: offer.responded_at ?? null,
      alive: offer.alive === true,
    },
  };
}
