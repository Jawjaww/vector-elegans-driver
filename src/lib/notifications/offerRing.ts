import type { OfferArrivalSource } from '../stores/driverStore';

/**
 * Whether the offer ring may sound, and why not when it may not.
 *
 * The invariant the previous implementation already asserted — "the ring exists only where
 * nothing else will ring" — was right; the *trigger* was wrong. `startOfferRing()` was called
 * from the native `confirmLaunch()`, which proves a launch landed, never that an offer is on
 * screen. Four false positives followed, all of them a sound for a ride the driver cannot see:
 * an offer that died between the push and the resume, a wake slow enough that the fallback
 * notification had already played the channel sound, a pill tap, and the driver opening the app
 * by hand while a launch was in flight.
 *
 * The decision therefore moves here, to JS, where the offer's liveness is actually known, and it
 * is expressed as a pure function so each refusal is testable on its own.
 */

/** The notification-open stages `useNotifications` distinguishes. */
export type OfferOpenStageName = 'tap_received' | 'silent_wake';

/**
 * Which path the arrival came from.
 *
 * A silent wake is the only path with no sound of its own, because the tray entry is withdrawn
 * with the same resume that confirms the wake and the `rides` channel therefore never fires.
 */
export function arrivalSourceFromStage(
  stage: OfferOpenStageName,
): OfferArrivalSource {
  return stage === 'silent_wake' ? 'wake' : 'tap';
}

/**
 * What the dashboard currently knows about the offer the arrival produced.
 *
 * `pending` is the provisional card's state: the payload proved a ride exists, but the server
 * has not yet confirmed it is still offerable. Ringing there would be ringing for a maybe.
 */
export type OfferLiveness = 'live' | 'pending' | 'dead' | 'none';

export function resolveOfferLiveness(args: {
  /** The deck paints a ride the driver can still accept. */
  hasLiveOffer: boolean;
  /** The card drawn from the push payload, not yet confirmed by the server. */
  hasProvisionalCard: boolean;
  /** The server answered and the offer is not presentable. */
  hasNotice: boolean;
}): OfferLiveness {
  if (args.hasLiveOffer) return 'live';
  if (args.hasNotice) return 'dead';
  if (args.hasProvisionalCard) return 'pending';
  return 'none';
}

/** Why the ring was refused. Mirrors the vocabulary documented in AGENTS.md. */
export type OfferRingIdleReason =
  | 'no_arrival'
  | 'tap_origin'
  | 'driver_offline'
  | 'no_offer'
  | 'not_confirmed'
  | 'already_handled';

export type OfferRingAction =
  | { kind: 'ring' }
  | { kind: 'stop'; reason: 'offer_dead' }
  | { kind: 'idle'; reason: OfferRingIdleReason };

/**
 * Decide what the arrival should do to the ring.
 *
 * `handledArrival` is the caller's latch: the decision is re-evaluated on every render while the
 * offer is `pending`, and without a latch the ring would be re-armed on each pass. The latch is
 * what makes the test below possible at all — `already_handled` is only reached once the ring has
 * either sounded or been refused for good.
 */
export function resolveOfferRingAction(input: {
  arrivalSource: OfferArrivalSource | null;
  isOnline: boolean;
  liveness: OfferLiveness;
  handledArrival: boolean;
}): OfferRingAction {
  if (input.arrivalSource === null) {
    return { kind: 'idle', reason: 'no_arrival' };
  }
  // Before the latch, and deliberately so: an offer that dies while the ring is playing must
  // stop it, and that is exactly the case where the arrival is already handled. The native stop
  // is idempotent, so this costs nothing when nothing is playing.
  if (input.liveness === 'dead') {
    return { kind: 'stop', reason: 'offer_dead' };
  }
  if (input.handledArrival) {
    return { kind: 'idle', reason: 'already_handled' };
  }
  // A tap already played the `rides` channel: the notification is how the driver was told.
  if (input.arrivalSource === 'tap') {
    return { kind: 'idle', reason: 'tap_origin' };
  }
  if (!input.isOnline) {
    return { kind: 'idle', reason: 'driver_offline' };
  }
  if (input.liveness === 'none') {
    return { kind: 'idle', reason: 'no_offer' };
  }
  if (input.liveness === 'pending') {
    return { kind: 'idle', reason: 'not_confirmed' };
  }
  return { kind: 'ring' };
}

/**
 * Whether a refusal is final for this arrival.
 *
 * `no_offer` and `not_confirmed` are the two states the decision passes *through*: the deck is
 * still loading, or the server has not answered. Latching those would be latching "not yet" as
 * "never", and the offer would arrive on screen in silence.
 */
const TRANSIENT_RING_REFUSALS: ReadonlySet<OfferRingIdleReason> = new Set([
  'no_offer',
  'not_confirmed',
]);

export function isTerminalRingAction(action: OfferRingAction): boolean {
  if (action.kind !== 'idle') return true;
  return !TRANSIENT_RING_REFUSALS.has(action.reason);
}
