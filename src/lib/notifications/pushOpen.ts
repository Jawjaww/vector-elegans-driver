import {
  useDriverStore,
  type OfferNotificationAction,
  type PendingOfferOpen,
  type ProvisionalOffer,
} from '../stores/driverStore';
import { logOfferStage } from './offerPipelineDiag';
import {
  RIDE_OFFER_ACCEPT_ACTION,
  RIDE_OFFER_DECLINE_ACTION,
} from './rideOfferPushContent';

/** Whether a push payload should open the driver home (offer overlay). */
export function shouldOpenHomeFromPushData(
  data: Record<string, unknown>,
): boolean {
  const type = typeof data.type === 'string' ? data.type : null;
  const rideId = typeof data.ride_id === 'string' ? data.ride_id : null;
  return type === 'ride_offer' || Boolean(rideId);
}

/** Ride id carried by a ride_offer push payload, if any. */
export function rideIdFromPushData(
  data: Record<string, unknown>,
): string | null {
  return typeof data.ride_id === 'string' && data.ride_id.length > 0
    ? data.ride_id
    : null;
}

/**
 * Identity of one notification tap event.
 *
 * The identifier alone is `ride-offer-<rideId>` — stable per ride — so it cannot
 * tell a fresh offer from the same ride re-offered 30 minutes later, and the
 * second tap was dropped. Pairing the identifier with the delivery date yields
 * one key per event while still absorbing the double delivery
 * (useLastNotificationResponse plus the response listener).
 */
export function notificationResponseEventKey(response: {
  notification: { date: number; request: { identifier: string } };
}): string {
  return `${response.notification.request.identifier}:${response.notification.date}`;
}

/**
 * Map a notification action identifier to the offer action to queue.
 * A plain tap (DEFAULT_ACTION_IDENTIFIER) maps to null — opening is enough.
 */
export function offerActionFromIdentifier(
  identifier: string,
): OfferNotificationAction | null {
  if (identifier === RIDE_OFFER_ACCEPT_ACTION) return 'accept';
  if (identifier === RIDE_OFFER_DECLINE_ACTION) return 'decline';
  return null;
}

/**
 * Queue the ride opened from a notification, with the tray action if any.
 *
 * Backed by the driver store rather than module scope: the dashboard must react
 * the instant a tap lands, including when it is already mounted behind the
 * notification shade. A module variable changed no dependency, so the promotion
 * effect only fired by luck.
 */
export function queueOfferOpen(
  rideId: string,
  action: OfferNotificationAction | null,
  preview: ProvisionalOffer | null = null,
): void {
  const state = useDriverStore.getState();
  state.setPendingOfferOpen({ rideId, action });
  // The offer now on its way was requested by the driver's own tap: mark the arrival so the
  // dashboard can present it without waiting for the boot and without entry motion.
  state.setOfferArrivalAt(Date.now());
  // Only worth showing when nothing better is already in hand: a ride the dashboard already
  // tracks carries coordinates, distance and approach time, which the payload does not.
  const alreadyTracked =
    state.activeRide?.id === rideId ||
    state.availableRides.some((ride) => ride.id === rideId) ||
    state.deferredRides.some((ride) => ride.id === rideId);
  state.setProvisionalOffer(alreadyTracked ? null : preview);
  // Logged here rather than at the call site so the stage cannot drift from the write it
  // describes. Usually the very first row of a timeline, and usually buffered: a cold start
  // from the tap has no `drivers.id` yet.
  logOfferStage(
    'pending_queued',
    { action: action ?? 'open', provisional: !alreadyTracked && preview !== null },
    rideId,
  );
}

/** Read the queued offer once and clear it. Returns null when nothing is queued. */
export function consumePendingOfferOpen(): PendingOfferOpen | null {
  const state = useDriverStore.getState();
  const pending = state.pendingOfferOpen;
  if (pending === null) return null;
  state.setPendingOfferOpen(null);
  return pending;
}
