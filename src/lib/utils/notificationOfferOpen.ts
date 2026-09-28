import { rideService } from '../../services/rideService';
import { logOfferStage } from '../notifications/offerPipelineDiag';
import { dismissOfferNotification } from '../notifications/offerNotification';
import type { OfferNotificationAction, Ride } from '../stores/driverStore';
import { useDriverStore } from '../stores/driverStore';
import { acceptTrackedRide } from './acceptTrackedRide';
import {
  resolveOfferOpenOutcome,
  takeReadyOfferOpen,
  type OfferNotice,
} from './offerOpenOutcome';
import { isRideStillOfferable } from './ridePickup';
import { consumePendingOfferOpen } from '../notifications/pushOpen';

export type PendingNotificationOfferOpenArgs = {
  pendingOfferOpen: { rideId: string; action: OfferNotificationAction | null } | null;
  driverStatus: string | null;
  driverId: string | null;
  storeHydrated: boolean;
  deferredRides: Ride[];
  availableRides: Ride[];
  isOnline: boolean;
  activeRideId: string | null;
  acceptingRideIds: Set<string>;
  promoteDeferredRide: (rideId: string) => void;
  promoteTrackedRideToFront: (ride: Ride) => void;
  onUnavailable: () => void;
  setOfferNotice: (notice: OfferNotice | null) => void;
};

async function takeTrayAction(
  rideId: string,
  action: OfferNotificationAction | null,
  driverStatus: string | null,
  acceptingRideIds: Set<string>,
  onUnavailable: () => void,
): Promise<void> {
  const store = useDriverStore.getState();
  void dismissOfferNotification(rideId);
  if (action === 'accept') {
    logOfferStage('accept_tapped', { source: 'notification_action' }, rideId);
    await acceptTrackedRide({
      rideId,
      driverStatus,
      isOnline: store.isOnline,
      setIsOnline: store.setIsOnline,
      availableRides: store.availableRides,
      deferredRides: store.deferredRides,
      availableRide: store.availableRide,
      setActiveRide: store.setActiveRide,
      removeAvailableRide: store.removeAvailableRide,
      suppressRide: store.suppressRide,
      promoteTrackedRideToFront: store.promoteTrackedRideToFront,
      onUnavailable,
      acceptingRideIds,
    });
    return;
  }
  if (action === 'decline') {
    store.deferAvailableRide(rideId);
    await rideService.respondOffer(rideId, 'declined');
  }
}

function handleDeadDeferredOffer(
  rideId: string,
  deferred: Ride,
  setOfferNotice: (notice: OfferNotice | null) => void,
): void {
  useDriverStore.getState().clearProvisionalOffer(rideId);
  const refused = (useDriverStore.getState().declinedOfferIds ?? []).includes(
    rideId,
  );
  logOfferStage(
    'notice',
    {
      reason: refused ? 'offer_declined' : 'matching_closed',
      source: 'deferred',
    },
    rideId,
  );
  setOfferNotice({
    reason: refused ? 'offer_declined' : 'matching_closed',
    ride: deferred,
  });
}

async function confirmOfferFromServer(
  rideId: string,
  alreadyShown: boolean,
  action: OfferNotificationAction | null,
  ctx: {
    driverStatus: string | null;
    driverId: string | null;
    isOnline: boolean;
    activeRideId: string | null;
    acceptingRideIds: Set<string>;
    promoteTrackedRideToFront: (ride: Ride) => void;
    onUnavailable: () => void;
    setOfferNotice: (notice: OfferNotice | null) => void;
  },
): Promise<void> {
  logOfferStage('fetch_started', { already_shown: alreadyShown }, rideId);
  const fetchStartedAt = Date.now();
  const fetched = await rideService.fetchDriverOfferRide(rideId);
  const outcome = resolveOfferOpenOutcome(fetched, {
    driverStatus: ctx.driverStatus,
    activeRideId: ctx.activeRideId,
    isOnline: ctx.isOnline,
    myDriverId: ctx.driverId,
  });
  logOfferStage(
    'fetch_result',
    {
      duration_ms: Date.now() - fetchStartedAt,
      kind: outcome.kind,
      already_shown: alreadyShown,
      ...(fetched.ok
        ? { offer_status: fetched.offer.status, alive: fetched.offer.alive }
        : { fetch_reason: fetched.reason }),
    },
    rideId,
  );
  if (outcome.kind === 'overlay' && isRideStillOfferable(outcome.ride)) {
    ctx.setOfferNotice(null);
    ctx.promoteTrackedRideToFront({
      ...outcome.ride,
      offerUnconfirmed: false,
    });
    logOfferStage('promoted', { source: 'fetch' }, rideId);
    if (!alreadyShown) {
      await takeTrayAction(
        rideId,
        action,
        ctx.driverStatus,
        ctx.acceptingRideIds,
        ctx.onUnavailable,
      );
    }
    return;
  }
  useDriverStore.getState().clearProvisionalOffer(rideId);
  if (alreadyShown) {
    useDriverStore.getState().removeAvailableRide(rideId);
  }
  const notice =
    outcome.kind === 'notice'
      ? outcome.notice
      : { reason: 'matching_closed' as const, ride: outcome.ride };
  logOfferStage('notice', { reason: notice.reason, source: 'fetch' }, rideId);
  ctx.setOfferNotice(notice);
}

/**
 * Promote or explain a ride opened from a ride_offer notification once identity is ready.
 */
export async function runPendingNotificationOfferOpen(
  args: PendingNotificationOfferOpenArgs,
): Promise<void> {
  const readyOpen = takeReadyOfferOpen({
    pendingOfferOpen: args.pendingOfferOpen,
    driverStatus: args.driverStatus,
    driverId: args.driverId,
    storeHydrated: args.storeHydrated,
  });
  if (!readyOpen) return;

  const { rideId, action } = readyOpen;
  consumePendingOfferOpen();
  logOfferStage('boot_ready', { action: action ?? 'open' }, rideId);

  const confirmCtx = {
    driverStatus: args.driverStatus,
    driverId: args.driverId,
    isOnline: args.isOnline,
    activeRideId: args.activeRideId,
    acceptingRideIds: args.acceptingRideIds,
    promoteTrackedRideToFront: args.promoteTrackedRideToFront,
    onUnavailable: args.onUnavailable,
    setOfferNotice: args.setOfferNotice,
  };

  const deferred = args.deferredRides.find((ride) => ride.id === rideId);
  if (deferred) {
    if (isRideStillOfferable(deferred)) {
      args.promoteDeferredRide(rideId);
      logOfferStage('promoted', { source: 'deferred' }, rideId);
      await takeTrayAction(
        rideId,
        action,
        args.driverStatus,
        args.acceptingRideIds,
        args.onUnavailable,
      );
    } else {
      handleDeadDeferredOffer(rideId, deferred, args.setOfferNotice);
    }
    return;
  }

  const stacked = args.availableRides.find((ride) => ride.id === rideId);
  if (stacked) {
    if (isRideStillOfferable(stacked)) {
      args.promoteTrackedRideToFront(stacked);
      logOfferStage('promoted', { source: 'stack' }, rideId);
      await takeTrayAction(
        rideId,
        action,
        args.driverStatus,
        args.acceptingRideIds,
        args.onUnavailable,
      );
      if (stacked.offerUnconfirmed) {
        await confirmOfferFromServer(rideId, true, action, confirmCtx);
      }
    } else {
      useDriverStore.getState().clearProvisionalOffer(rideId);
      useDriverStore.getState().removeAvailableRide(rideId);
      logOfferStage(
        'notice',
        { reason: 'matching_closed', source: 'stack' },
        rideId,
      );
      args.setOfferNotice({ reason: 'matching_closed', ride: stacked });
    }
    return;
  }

  await confirmOfferFromServer(rideId, false, action, confirmCtx);
}
