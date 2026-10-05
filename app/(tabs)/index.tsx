import { useState, useEffect, useMemo, useCallback, useReducer, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  StyleSheet,
  Switch,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useDriverStore, Ride, canPresentRideOffer, type DriverStats, type OfferGateState, type ProvisionalOffer } from "../../src/lib/stores/driverStore";
import {
  navPolicyFromSnapshot,
  navPolicyPayload,
} from "../../src/lib/utils/navCatchupPolicy";
import { hydratePendingOffers } from "../../src/lib/utils/offerHydrate";
import { toAppRide, type RideRow } from "../../src/lib/utils/toAppRide";
import { localDayBounds, summarizeHistoryToday } from "../../src/lib/utils/rideHistory";
import {
  OFFER_CATCHUP_INTERVAL_MS,
  OFFER_CHANNEL_RETRY_MS,
  shouldHydrateOffersOnRealtimeStatus,
  shouldRetryPendingRideChannel,
  isOpenRideOffer,
  shouldDropOverlayForOfferStatus,
  type RideOfferRealtimeRow,
} from "../../src/lib/utils/pendingRideChannel";
import { resolveDriverDuty, onlineStatusCopyKeys, shouldForceOnlineOnAssignedHydrate, canDriverGoOnline, shouldHydrateOnlineFromServer, type DriverDuty } from "../../src/lib/utils/driverDuty";
import {
  isActiveRideStatus,
  reconcileAssignedRide,
} from "../../src/lib/utils/assignedRideReconcile";
import {
  createDossierStatusSync,
  decideOnlineToggle,
  shouldForceOfflineForStatus,
  shouldSyncDriverStatus,
} from "../../src/lib/utils/dossierStatusSync";
import { resolvePendingRideRealtimeUpdate } from "../../src/lib/utils/pendingRideRealtime";
import {
  offerSetToken,
  resolveBottomSheetAllowedSnaps,
  resolveDriverHomeSnapLevel,
  resolveSheetSectionBottoms,
  visibleProvisionalOffer,
  type SheetBodyLevel,
  type SheetSectionBottoms,
} from "../../src/lib/utils/homeSheetSnap";
import {
  GUIDANCE_TICK_MS,
  guidancePeekReducer,
  guidancePeekVisible,
  INITIAL_GUIDANCE_PEEK,
} from "../../src/lib/utils/tripGuidancePeek";
import { CONTROL_BASE_OFFSET } from "../../src/lib/utils/overlayLane";
import { VE_BLUE } from "../../src/lib/theme";
import { MAP_PALETTE } from "../../src/lib/mapPalette";
import { useDriverFolderStore } from "../../src/lib/stores/driverFolderStore";
import { normalizeFolderStatus } from "../../src/lib/folderStatus";
import { useDriverLocation } from "../../src/hooks/useDriverLocation";
import { useDriverStoreHydrated } from "../../src/hooks/useDriverStoreHydrated";
import { useOverlayPermissionPrompt } from "../../src/hooks/useOverlayPermissionPrompt";
import { ringOffer, stopOfferRing } from "../../src/lib/overlay/overlayService";
import { dismissOfferNotification } from "../../src/lib/notifications/offerNotification";
import {
  isTerminalRingAction,
  resolveOfferLiveness,
  resolveOfferRingAction,
} from "../../src/lib/notifications/offerRing";
import { AnimatedPage } from "../../src/components/AnimatedPage";
import {
  BottomSheet,
  type SheetSnapLevel,
  sheetVisibleHeight,
} from "../../src/components/BottomSheet";
import {
  SheetSection,
  type SheetSectionMeasure,
} from "../../src/components/SheetSection";
import { OfferRideCarousel } from "../../src/components/OfferRideCarousel";
import { RideOfferExtras } from "../../src/components/RideOfferExtras";
import { VTCMap } from "../../src/map/VTCMap";
import { BASEMAP_CANVAS } from "../../src/map/basemapTone";
import { setFrostScene } from "../../src/map/frostRects";
import type { MapControllerRef, NavManeuverInfo } from "../../src/map/types";
import { rideService } from "../../src/services/rideService";
import { setDriverOffline } from "../../src/lib/services/locationService";
import {
  registerAndUpsertPushToken,
  type PushRegisterResult,
} from "../../src/lib/notifications/pushRegistration";
import {
  logOfferStage,
  setOfferPipelineDriverId,
} from "../../src/lib/notifications/offerPipelineDiag";
import {
  isNotificationArrival,
  PROVISIONAL_OFFER_TTL_MS,
  rideFromPushData,
} from "../../src/lib/notifications/offerPreview";
import { pushRegisterFailureI18n } from "../../src/lib/notifications/pushStatusCopy";
import { usePushRegisterStatus } from "../../src/hooks/usePushRegisterStatus";
import { ActiveTripSheet } from "../../src/components/ActiveTripSheet";
import { TripManeuverHud } from "../../src/components/TripManeuverHud";
import { TripRerouteNotice } from "../../src/components/TripRerouteNotice";
import { TripArrivalHud } from "../../src/components/TripArrivalHud";
import { TripGuidanceBar } from "../../src/components/TripGuidanceBar";
import {
  isParkedStage,
  isWithinDropoffRadius,
  resolveTripStage,
  type TripStage,
} from "../../src/lib/utils/tripGuidance";
import { haversineMeters } from "../../src/lib/utils/gpsThrottle";
import { VGpsLoader } from "../../src/components/VGpsLoader";
import { MapRecenterButton } from "../../src/components/MapRecenterButton";
import {
  type NavProgress,
} from "../../src/lib/utils/navProgress";
import { useActiveTripActions } from "../../src/hooks/useActiveTripActions";
import {
  getDossierStatus,
  resolveDossierBanners,
  sliceDossierBannerStack,
  noticesBodyHeight,
  buildDossierBannerCopy,
  type ExpiringDocument,
  type DossierBannerHit,
} from "../../src/lib/services/dossierService";
import { translateDocumentType } from "../../src/lib/documentTypeLabels";
import { useTranslation } from "react-i18next";
import {
  formatRideDistanceKm,
  formatRideDurationMin,
  formatPickupDateTime,
} from "../../src/lib/utils/rideMetrics";
import {
  isRideStillOfferable,
  getPendingRideDisplayLabel,
  resolveRideOfferPrice,
  shouldShowMatchingFlameBadge,
} from "../../src/lib/utils/ridePickup";
import { RidePriceBonus } from "../../src/components/RidePriceBonus";
import { OfferNoticeOverlay } from "../../src/components/OfferNoticeOverlay";
import {
  canDisplayOffers,
  canReceiveOffers,
  shouldBypassBootGate,
  type OfferNotice,
} from "../../src/lib/utils/offerOpenOutcome";
import { acceptTrackedRide } from "../../src/lib/utils/acceptTrackedRide";
import { runPendingNotificationOfferOpen } from "../../src/lib/utils/notificationOfferOpen";
import { useDashboardNavProgress } from "../../src/hooks/useDashboardNavProgress";
import { useDashboardOfferMap } from "../../src/hooks/useDashboardOfferMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const REVIEW_STATUSES = new Set([
  "pending_review",
  "pending_validation",
  "submitted",
]);

function mapRouteFitPaddingBottom(
  ride: { status: string; driver_arrived_at?: string | null } | null,
): number {
  if (!ride) return 32;
  if (ride.status === "scheduled" && Boolean(ride.driver_arrived_at)) {
    return 200;
  }
  return 72;
}

const DEFAULT_MAP_CENTER = { lat: 48.8566, lng: 2.3522 };

/** How long an offer notice stays on screen before fading out by itself. */
const OFFER_NOTICE_TTL_MS = 25_000;

function mapLoaderHint(mapReady: boolean, hasGpsFix: boolean): string {
  if (!mapReady) return "Préparation de la carte";
  if (!hasGpsFix) return "Localisation en cours";
  return "Centrage…";
}

function bannerAccentBackground(accent: string): string {
  if (accent === "#fb7185") return "rgba(251, 113, 133, 0.2)";
  if (accent === "#34d399") return "rgba(52, 211, 153, 0.2)";
  return "rgba(251, 191, 36, 0.2)";
}

function isDriverBecameActive(
  previous: string | null,
  nextStatus: string,
): boolean {
  if (nextStatus !== "active" || previous == null || previous === "active") {
    return false;
  }
  return (
    REVIEW_STATUSES.has(previous) ||
    previous === "draft" ||
    previous === "rejected"
  );
}

/** Side-effects when driver.status changes (validation / reject / cancel review). */
function notifyDriverStatusTransition(input: {
  previous: string | null;
  nextStatus: string;
  dossierIsComplete: boolean | null | undefined;
  setJustValidated: (v: boolean) => void;
}): void {
  const { previous, nextStatus, dossierIsComplete, setJustValidated } = input;

  if (
    isDriverBecameActive(previous, nextStatus) &&
    dossierIsComplete !== false
  ) {
    setJustValidated(true);
    useDriverFolderStore.setState({
      validatedAt: new Date().toISOString(),
    });
    return;
  }

  if (
    (nextStatus === "rejected" && previous && REVIEW_STATUSES.has(previous)) ||
    (nextStatus === "draft" && previous && REVIEW_STATUSES.has(previous)) ||
    (nextStatus === "pending_review" && previous === "active") ||
    (nextStatus === "suspended" && Boolean(previous)) ||
    (nextStatus === "on_vacation" && Boolean(previous))
  ) {
    setJustValidated(false);
  }
}

function useMapBootSeed(currentLocation: { lat: number; lng: number } | null) {
  const [hasGpsFix, setHasGpsFix] = useState(() =>
    Boolean(useDriverStore.getState().currentLocation),
  );
  const [mapBoot, setMapBoot] = useState<{
    center: { lat: number; lng: number };
    zoom: number;
  }>(() => {
    const loc = useDriverStore.getState().currentLocation;
    return loc
      ? { center: { lat: loc.lat, lng: loc.lng }, zoom: 15 }
      : { center: DEFAULT_MAP_CENTER, zoom: 12 };
  });

  useEffect(() => {
    if (hasGpsFix) return;
    let cancelled = false;

    void (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setHasGpsFix(true);
        setMapBoot({
          center: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
          zoom: 15,
        });
        useDriverStore.getState().setCurrentLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      } catch {
        // Watch / later GPS fix will seed via currentLocation effect below
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasGpsFix]);

  useEffect(() => {
    if (hasGpsFix || !currentLocation) return;
    setHasGpsFix(true);
    setMapBoot({
      center: { lat: currentLocation.lat, lng: currentLocation.lng },
      zoom: 15,
    });
  }, [hasGpsFix, currentLocation]);

  return { mapBoot, hasGpsFix, setHasGpsFix };
}

function handlePendingRideRealtimeUpdate(
  updated: Ride,
  actions: {
    presentOffer: (ride: Ride) => Promise<void>;
    removeAvailableRide: (rideId: string) => void;
    patchTrackedRide: (ride: Ride) => void;
    promoteTrackedRideToFront: (ride: Ride) => void;
    myDriverId: string | null;
    acceptingRideIds: ReadonlySet<string>;
    onUnavailable: () => void;
  },
) {
  const {
    availableRide: current,
    deferredRides: deferred,
    availableRides: queued,
    declinedOfferIds,
    activeRide,
  } = useDriverStore.getState();

  const decision = resolvePendingRideRealtimeUpdate(updated, {
    availableRide: current,
    availableRides: queued,
    deferredRides: deferred,
    declinedOfferIds,
    activeRide,
    myDriverId: actions.myDriverId,
    acceptingRideIds: actions.acceptingRideIds,
  });

  if (decision.action === "present") {
    void actions.presentOffer(updated);
    return;
  }
  if (decision.action === "promote") {
    actions.promoteTrackedRideToFront(updated);
    return;
  }
  if (decision.action === "patch") {
    actions.patchTrackedRide(updated);
    return;
  }
  if (decision.action !== "drop") return;

  actions.removeAvailableRide(updated.id);
  if (deferred.some((r) => r.id === updated.id)) {
    useDriverStore.setState((s) => ({
      deferredRides: s.deferredRides.filter((r) => r.id !== updated.id),
    }));
  }
  if (decision.notifyUnavailable) {
    actions.onUnavailable();
  }
}

function usePendingRideChannel({
  canReceiveOffers,
  isOnline,
  presentOffer,
  removeAvailableRide,
  clearAvailableRide,
  pruneUnofferableRides,
  patchTrackedRide,
  promoteTrackedRideToFront,
  getOfferGateState,
  myDriverId,
  acceptingRideIdsRef,
  onUnavailable,
}: {
  canReceiveOffers: boolean;
  isOnline: boolean;
  presentOffer: (ride: Ride) => Promise<void>;
  removeAvailableRide: (rideId: string) => void;
  clearAvailableRide: () => void;
  pruneUnofferableRides: () => void;
  patchTrackedRide: (ride: Ride) => void;
  promoteTrackedRideToFront: (ride: Ride) => void;
  getOfferGateState: () => OfferGateState;
  myDriverId: string | null;
  acceptingRideIdsRef: { current: Set<string> };
  onUnavailable: () => void;
}) {
  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    if (!canReceiveOffers) {
      if (isOnline) {
        // Inactive dossier or an ongoing ride: nothing in the stack is actionable, so the
        // whole thing goes.
        clearAvailableRide();
      } else {
        // Offline stops *receiving* new offers, never holding one. A ride opened from a
        // notification is shown while offline — accepting it is what comes back online — and
        // wiping here erased the very offer the tap had just surfaced. Only dead ones go.
        pruneUnofferableRides();
      }
      return;
    }

    const fetchExistingRide = async () => {
      const { activeRide: currentActive, addAvailableRide } =
        useDriverStore.getState();
      if (currentActive) return;

      const fromOffers = myDriverId
        ? await rideService.fetchOpenOfferRides(myDriverId)
        : [];
      const pending =
        fromOffers.length > 0
          ? fromOffers
          : await rideService.fetchOfferableRides();
      if (cancelled || pending.length === 0) return;
      const gate = getOfferGateState();
      const stackIdsBefore = gate.availableRides.map((r) => r.id);
      const newStackIds = hydratePendingOffers({
        pending,
        gate,
        stackIdsBefore,
        addAvailableRide,
        getStackIdsAfter: () =>
          useDriverStore.getState().availableRides.map((r) => r.id),
      });
      if (newStackIds.length === 0) return;
      // Reached only when the catch-up poll is what surfaced something: this marker is what
      // separates "Realtime never delivered" from "the offer really never arrived".
      logOfferStage("poll_tick", { count: newStackIds.length }, newStackIds[0]);
    };

    const handleOfferRow = (row: RideOfferRealtimeRow) => {
      if (isOpenRideOffer(row)) {
        void (async () => {
          const fromSnapshot = rideFromPushData(row.snapshot ?? {}, row.ride_id);
          if (fromSnapshot) {
            await presentOffer(fromSnapshot);
            return;
          }
          // Snapshot missing on older rows: a live SELECT is enough to paint. The RPC is
          // reserved for explaining a ride the policy already hides.
          const live = await rideService.fetchRideById(row.ride_id);
          if (cancelled) return;
          if (live) {
            await presentOffer({ ...live, offerUnconfirmed: false });
            return;
          }
          const fetched = await rideService.fetchDriverOfferRide(row.ride_id);
          if (cancelled || !fetched.ok) return;
          if (!fetched.offer.alive || !isRideStillOfferable(fetched.ride)) {
            return;
          }
          await presentOffer({ ...fetched.ride, offerUnconfirmed: false });
        })();
        return;
      }
      if (shouldDropOverlayForOfferStatus(row.status)) {
        removeAvailableRide(row.ride_id);
      }
    };

    const subscribe = () => {
      if (cancelled) return;
      if (channel) {
        void supabase.removeChannel(channel);
        channel = undefined;
      }
      let next = supabase
        .channel(myDriverId ? `driver-matching:${myDriverId}` : "public:rides")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "rides",
          },
          (payload) => {
            const ride = toAppRide(payload.new as RideRow);
            if (!isRideStillOfferable(ride)) return;
            // P1: unassigned rides are offerable only via ride_offers.
            if (!ride.driver_id) return;
            void presentOffer(ride);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rides",
          },
          (payload) => {
            handlePendingRideRealtimeUpdate(toAppRide(payload.new as RideRow), {
              presentOffer,
              removeAvailableRide,
              patchTrackedRide,
              promoteTrackedRideToFront,
              myDriverId,
              acceptingRideIds: acceptingRideIdsRef.current,
              onUnavailable,
            });
          },
        );
      if (myDriverId) {
        const offerFilter = `driver_id=eq.${myDriverId}` as const;
        next = next
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "ride_offers",
              filter: offerFilter,
            },
            (payload) => {
              handleOfferRow(payload.new as RideOfferRealtimeRow);
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "ride_offers",
              filter: offerFilter,
            },
            (payload) => {
              handleOfferRow(payload.new as RideOfferRealtimeRow);
            },
          );
      }
      channel = next.subscribe((status, err) => {
        if (cancelled) return;
        logOfferStage("channel_status", { status }, null);
        if (shouldHydrateOffersOnRealtimeStatus(status)) {
          void fetchExistingRide();
        }
        if (shouldRetryPendingRideChannel(status)) {
          if (__DEV__) {
            console.warn("[pending-rides] realtime", status, err);
          }
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(subscribe, OFFER_CHANNEL_RETRY_MS);
        }
      });
    };

    subscribe();

    const onAppStateChange = (next: string) => {
      if (next === "active") {
        void fetchExistingRide();
      }
    };
    const appSub = AppState.addEventListener("change", onAppStateChange);
    const pollId = setInterval(() => {
      void fetchExistingRide();
    }, OFFER_CATCHUP_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      appSub.remove();
      clearInterval(pollId);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [
    canReceiveOffers,
    isOnline,
    clearAvailableRide,
    pruneUnofferableRides,
    presentOffer,
    removeAvailableRide,
    patchTrackedRide,
    promoteTrackedRideToFront,
    getOfferGateState,
    myDriverId,
    onUnavailable,
  ]);
}

/**
 * Bottom arrival chip, only while the leg still has ground to cover.
 *
 * The gate is the *stage*, not the ride's status, and that is the correction: `scheduled` with
 * `driver_arrived_at` set used to be the only parked case anyone thought of, so the chip stayed
 * up at the drop-off and told a stopped driver that their destination was `0 m` away and that
 * they would arrive at the current minute. A parked stage now covers both arrivals, and both of
 * them have nothing left to count down.
 */
function shouldShowTripNavigationHud(
  stage: TripStage | null,
  progress: NavProgress | null,
): boolean {
  if (stage === null || !progress) return false;
  return !isParkedStage(stage);
}

/**
 * Top maneuver card, whenever the trip is under way.
 *
 * It is no longer gated on a resolved next instruction: the card carries the stage phrase when no
 * step has arrived, so a routing failure can no longer take the whole banner away with it.
 *
 * It *is* gated on the trip still being a drive, which is what `isParkedStage` answers. The card
 * names a waypoint and the distance to it, and a driver who has arrived has neither: the arrival
 * stages are announced by the guidance bar, which owns the instruction the moment there is no
 * route left to describe. Two gates used to re-derive that fact from `status` and
 * `driver_arrived_at` in two different ways, and the copy that missed the drop-off was the one
 * that mattered — a `0 m` card drawn over a stopped vehicle.
 */
function tripManeuverProgress(
  stage: TripStage | null,
  progress: NavProgress | null,
): NavProgress | null {
  if (stage === null || isParkedStage(stage)) return null;
  return progress;
}

function resolveMapRecenterBottomOffset(
  activeRide: Ride | null,
  sheetBodies: Record<SheetBodyLevel, number>,
  sheetLevel: SheetSnapLevel,
): number {
  if (!activeRide) return 56;
  return sheetVisibleHeight(sheetLevel, sheetBodies);
}

/**
 * Steps of the dashboard boot, as published on the offer diagnostic timeline.
 * A single `boot_ready` marker cannot say which round-trip held a notification-opened
 * offer back, and that is the latency under investigation.
 */
type BootStep =
  | "auth"
  | "drivers"
  | "dossier_status"
  | "locations"
  | "assigned_ride";

/** Time one awaited boot step and publish it, whatever its outcome. */
async function timedBootStep<T>(
  step: BootStep,
  run: () => PromiseLike<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    logOfferStage("boot_step", {
      step,
      duration_ms: Date.now() - startedAt,
    });
  }
}

/**
 * Adopt the trip the server still has assigned to this driver.
 *
 * The boot refreshes, it never arbitrates: see `reconcileAssignedRide` for why a failed read and
 * a race with the driver's own Accept must both leave the ride in place. A ride that is really
 * over is released by the driver's own action, or by the terminal-status subscription below.
 */
async function hydrateAssignedRideFromServer(
  driverId: string,
  alreadyHydratedRef: { current: boolean },
  driverStatus: string | null,
) {
  const readStartedAt = Date.now();
  const current = useDriverStore.getState().activeRide;
  const fetched = await rideService.fetchAssignedRide(driverId);
  const { next, action } = reconcileAssignedRide({
    current,
    fetch: fetched,
    readStartedAt,
  });
  const store = useDriverStore.getState();
  const currentId = current?.id ?? null;

  switch (action) {
    case "read_failed":
      logOfferStage(
        "nav_assigned_ride_read_failed",
        { reason: fetched.ok ? "unknown" : fetched.reason, kept_ride_id: currentId },
        currentId,
      );
      return;
    case "kept_accept_race":
      logOfferStage("nav_assigned_ride_kept", { ride_id: currentId }, currentId);
      return;
    case "unchanged":
      return;
    case "released":
      store.setActiveRide(null);
      alreadyHydratedRef.current = false;
      logOfferStage("nav_assigned_ride_released", { ride_id: currentId }, currentId);
      return;
    default: {
      if (!next) return;
      store.setActiveRide(next);
      if (
        canDriverGoOnline(driverStatus) &&
        shouldForceOnlineOnAssignedHydrate(alreadyHydratedRef.current, true)
      ) {
        store.setIsOnline(true);
      }
      alreadyHydratedRef.current = true;
      logOfferStage(
        action === "refreshed"
          ? "nav_assigned_ride_refreshed"
          : "nav_assigned_ride_adopted",
        { ride_id: next.id },
        next.id,
      );
    }
  }
}

/**
 * The part of the dashboard boot that only feeds secondary chrome: the online switch and the
 * assigned-ride sheet.
 *
 * Split out of `fetchDriverStatus` so it can run after the dashboard is already allowed to
 * render. A notification-opened offer is addressable as soon as the driver identity is known,
 * so holding the whole screen on these two reads is exactly the delay being removed. The
 * accepted cost is that the switch may briefly show its previous state.
 */
async function hydrateSecondaryDriverState(
  driverId: string,
  driverStatus: string | null,
  assignedHydratedRef: { current: boolean },
): Promise<void> {
  try {
    if (canDriverGoOnline(driverStatus)) {
      const { data: loc } = await timedBootStep("locations", () =>
        supabase
          .from("driver_locations")
          .select("is_online")
          .eq("driver_id", driverId)
          .maybeSingle(),
      );
      if (shouldHydrateOnlineFromServer(driverStatus, loc?.is_online)) {
        useDriverStore.getState().setIsOnline(true);
      }
    }
    await timedBootStep("assigned_ride", () =>
      hydrateAssignedRideFromServer(driverId, assignedHydratedRef, driverStatus),
    );
  } catch (error) {
    console.error("[Boot] secondary hydration failed:", error);
  }
}

async function toggleDriverOnlineState(args: {
  isOnline: boolean;
  localStatus: string | null;
  fetchFreshStatus: () => Promise<string | null>;
  applyFreshStatus: (status: string) => Promise<void>;
  setIsOnline: (online: boolean) => void;
  setJustValidated: (value: boolean) => void;
  syncPushToken?: () => Promise<PushRegisterResult>;
  onPushRegisterFailed?: (result: Extract<PushRegisterResult, { ok: false }>) => void;
}) {
  const decision = await decideOnlineToggle({
    isOnline: args.isOnline,
    localStatus: args.localStatus,
    fetchFreshStatus: args.fetchFreshStatus,
  });
  if (decision.action === "refuse") {
    const statusLabel = decision.status ?? args.localStatus ?? "inconnu";
    Alert.alert(
      "Indisponible",
      `Votre dossier doit être actif pour passer en ligne (statut actuel : ${statusLabel}).`,
    );
    return;
  }
  if (decision.action === "go-offline") {
    args.setIsOnline(false);
    void setDriverOffline();
    return;
  }
  if (decision.status !== args.localStatus) {
    await args.applyFreshStatus(decision.status);
  }
  // Flip the switch first: awaiting Always location on a fresh APK can stall
  // on Android before the UI ever shows online.
  args.setIsOnline(true);
  args.setJustValidated(false);
  void (async () => {
    const result = await (args.syncPushToken ?? registerAndUpsertPushToken)();
    if (!result.ok) {
      args.onPushRegisterFailed?.(result);
    }
  })();
}

function useDriverDashboardBoot(router: ReturnType<typeof useRouter>) {
  const [loading, setLoading] = useState(true);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [justValidated, setJustValidated] = useState(false);
  const driverStatusRef = useRef<string | null>(null);
  const assignedHydratedRef = useRef(false);
  const dossierStatusSyncRef = useRef(createDossierStatusSync());
  const [rejectedDocs, setRejectedDocs] = useState<
    Array<{ document_type: string; rejection_reason: string | null }>
  >([]);
  const [expiredTypes, setExpiredTypes] = useState<string[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<ExpiringDocument[]>([]);
  const [dossierIsComplete, setDossierIsComplete] = useState<boolean | null>(
    null,
  );

  const refreshDossierMeta = useCallback(async (id: string) => {
    const { data: rejected } = await supabase
      .from("driver_documents")
      .select("document_type, rejection_reason")
      .eq("driver_id", id)
      .eq("validation_status", "rejected");

    setRejectedDocs(rejected ?? []);

    const dossier = await getDossierStatus(id);
    if (dossier) {
      setExpiredTypes(dossier.expired_document_types);
      setExpiringDocs(dossier.expiring_documents);
      setDossierIsComplete(dossier.is_complete);
      useDriverFolderStore.setState({
        canSubmit: dossier.can_submit,
        canEditDocuments: dossier.can_edit_documents,
        isEditable: dossier.is_editable,
        dossierUpdateRequested: dossier.dossier_update_requested,
        opsStatusReason: dossier.ops_status_reason,
      });
      return dossier;
    }

    setExpiredTypes([]);
    setExpiringDocs([]);
    setDossierIsComplete(null);
    return null;
  }, []);

  const applyDriverStatus = useCallback(
    async (
      nextStatus: string,
      id: string,
      options?: { silent?: boolean },
    ) => {
      const previous = driverStatusRef.current;
      driverStatusRef.current = nextStatus;
      setDriverStatus(nextStatus);
      useDriverFolderStore.setState({
        status: normalizeFolderStatus(nextStatus),
      });

      if (shouldForceOfflineForStatus(nextStatus)) {
        useDriverStore.getState().setIsOnline(false);
        void setDriverOffline();
      }

      // Dossier metadata only feeds the status banners, but it costs two round-trips
      // (driver_documents + get_driver_dossier_status). Awaiting it here delayed
      // setLoading(false) and, with it, the display of an offer opened from a notification
      // tap: a fresh offer must not queue behind the driver's paperwork. The status itself
      // is published above, synchronously.
      void (async () => {
        let dossier: Awaited<ReturnType<typeof refreshDossierMeta>> = null;
        try {
          dossier = await refreshDossierMeta(id);
        } catch (error) {
          console.error("[Dossier] refreshDossierMeta failed:", error);
        }

        if (!options?.silent) {
          notifyDriverStatusTransition({
            previous,
            nextStatus,
            dossierIsComplete: dossier?.is_complete,
            setJustValidated,
          });
        }
      })();
    },
    [refreshDossierMeta],
  );

  const fetchFreshDriverStatus = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("drivers")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    return data?.status ?? null;
  }, []);

  const fetchDriverStatus = useCallback(async () => {
    const startedAt = dossierStatusSyncRef.current.beginFetch();
    try {
      const {
        data: { user },
      } = await timedBootStep("auth", () => supabase.auth.getUser());
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      const { data: driver } = await timedBootStep("drivers", () =>
        supabase
          .from("drivers")
          .select("id, status, first_name, last_name")
          .eq("user_id", user.id)
          .single(),
      );

      if (!driver) {
        router.replace("/(auth)/profile-setup");
        return;
      }

      setDriverId(driver.id);
      // Hand the identity to the diagnostic sink: a tap that happened before this boot
      // resolved has been buffering its stages, and they can now be written.
      setOfferPipelineDriverId(driver.id);
      const applyThisFetch =
        dossierStatusSyncRef.current.shouldApplyFetch(startedAt);
      if (applyThisFetch) {
        await timedBootStep("dossier_status", () =>
          applyDriverStatus(driver.status, driver.id),
        );
      }
      // Everything past the identity only feeds secondary chrome: the online switch and the
      // assigned-ride sheet. Detached on purpose — a notification-opened offer must not wait
      // for it, since a ride is addressable as soon as the identity is known.
      void hydrateSecondaryDriverState(
        driver.id,
        applyThisFetch ? driver.status : driverStatusRef.current,
        assignedHydratedRef,
      );
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [applyDriverStatus, router]);

  const syncDriverStatusIfChanged = useCallback(async () => {
    const id = driverId;
    if (!id) return;
    const fresh = await fetchFreshDriverStatus(id);
    if (shouldSyncDriverStatus(driverStatusRef.current, fresh)) {
      await applyDriverStatus(fresh!, id);
    }
  }, [driverId, fetchFreshDriverStatus, applyDriverStatus]);

  useFocusEffect(
    useCallback(() => {
      void fetchDriverStatus();
    }, [fetchDriverStatus]),
  );

  useEffect(() => {
    if (!driverId) return;

    const channel = supabase
      .channel(`driver-dossier:${driverId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "drivers",
          filter: `id=eq.${driverId}`,
        },
        (payload) => {
          const row = payload.new as { status?: string; id?: string };
          if (!row?.status || !row.id) return;
          dossierStatusSyncRef.current.noteRealtime();
          void applyDriverStatus(row.status, row.id);
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          void fetchDriverStatus();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (__DEV__) {
            console.warn("[driver-dossier] realtime", status, err);
          }
          void syncDriverStatusIfChanged();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driverId, applyDriverStatus, fetchDriverStatus, syncDriverStatusIfChanged]);

  useEffect(() => {
    if (!driverId) return;

    const onAppStateChange = (next: string) => {
      if (next === "active") {
        void syncDriverStatusIfChanged();
      }
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    const pollId = setInterval(() => {
      void syncDriverStatusIfChanged();
    }, 45_000);

    return () => {
      subscription.remove();
      clearInterval(pollId);
    };
  }, [driverId, syncDriverStatusIfChanged]);

  return {
    loading,
    driverStatus,
    driverId,
    justValidated,
    setJustValidated,
    rejectedDocs,
    expiredTypes,
    expiringDocs,
    dossierIsComplete,
    applyDriverStatus,
    fetchFreshDriverStatus,
  };
}

/**
 * The offer overlay, in one place.
 *
 * It is rendered once, below the boot conditional, over whichever surface is on screen: the boot
 * placeholder (so a card built from the notification payload can appear while the identity is
 * still resolving) or the dashboard tree. One element with one parent — it used to be rendered by
 * two different parents, and React tore the card down and rebuilt it when the boot resolved.
 */
function DashboardOfferOverlay({
  rides,
  provisional,
  canShowOffers,
  booting,
  instantEntry,
  onActiveIndexChange,
  onOverlayHeightChange,
  onAcceptRide,
  onDeclineRide,
}: Readonly<{
  rides: Ride[];
  provisional: ProvisionalOffer | null;
  canShowOffers: boolean;
  booting: boolean;
  instantEntry: boolean;
  onActiveIndexChange: (index: number) => void;
  onOverlayHeightChange: (height: number) => void;
  onAcceptRide: (rideId: string) => void;
  onDeclineRide: (rideId: string, reason?: "declined" | "timeout") => void;
}>) {
  const deckRides = canShowOffers
    ? rides
    : rides.filter((ride) => ride.offerUnconfirmed);
  // `provisional` arrives already resolved against the deck: the parent applies
  // `visibleProvisionalOffer` once, and the sheet rule reads the same answer. Re-deriving it here
  // is what would let the two drift apart.
  const visible = shouldBypassBootGate({
    booting,
    hasProvisionalOffer: provisional !== null,
    canShowOffers,
    hasUnconfirmedOffer: deckRides.some((ride) => ride.offerUnconfirmed),
  });
  if (!visible) return null;

  return (
    <OfferRideCarousel
      // Real cards keep the display gate; the provisional card does not need it, since it is
      // drawn from the payload rather than from an offer we are allowed to present.
      rides={deckRides}
      provisional={provisional}
      instantEntry={instantEntry}
      chromeVisible
      onActiveIndexChange={onActiveIndexChange}
      onOverlayHeightChange={onOverlayHeightChange}
      onAcceptRide={onAcceptRide}
      onDeclineRide={onDeclineRide}
    />
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const acceptingRideIdsRef = useRef(new Set<string>());
  const pushRegisterStatus = usePushRegisterStatus();
  const {
    loading,
    driverStatus,
    driverId,
    justValidated,
    setJustValidated,
    rejectedDocs,
    expiredTypes,
    expiringDocs,
    dossierIsComplete,
    applyDriverStatus,
    fetchFreshDriverStatus,
  } = useDriverDashboardBoot(router);

  const {
    isOnline,
    setIsOnline,
    stats,
    availableRide,
    availableRides,
    deferredRides,
    declinedOfferIds,
    addAvailableRide,
    removeAvailableRide,
    deferAvailableRide,
    dismissDeferredRide,
    suppressRide,
    promoteDeferredRide,
    promoteTrackedRideToFront,
    patchTrackedRide,
    clearAvailableRide,
    pruneUnofferableRides,
    activeRide,
    setActiveRide,
  } = useDriverStore(
    useShallow((s) => ({
      isOnline: s.isOnline,
      setIsOnline: s.setIsOnline,
      stats: s.stats,
      availableRide: s.availableRide,
      availableRides: s.availableRides,
      deferredRides: s.deferredRides,
      declinedOfferIds: s.declinedOfferIds,
      addAvailableRide: s.addAvailableRide,
      removeAvailableRide: s.removeAvailableRide,
      deferAvailableRide: s.deferAvailableRide,
      dismissDeferredRide: s.dismissDeferredRide,
      suppressRide: s.suppressRide,
      promoteDeferredRide: s.promoteDeferredRide,
      promoteTrackedRideToFront: s.promoteTrackedRideToFront,
      patchTrackedRide: s.patchTrackedRide,
      clearAvailableRide: s.clearAvailableRide,
      pruneUnofferableRides: s.pruneUnofferableRides,
      activeRide: s.activeRide,
      setActiveRide: s.setActiveRide,
    })),
  );
  const currentLocation = useDriverStore((s) => s.currentLocation);
  useDriverLocation(isOnline || Boolean(activeRide));

  // Offered once per session, the first time the driver is online without the
  // overlay permission. Declining keeps the notification path.
  useOverlayPermissionPrompt(isOnline);

  const tripActions = useActiveTripActions();
  const { navProgress, pushNavProgress } = useDashboardNavProgress(activeRide?.id);

  /**
   * A ride stops being the driver's job only when the server says so.
   *
   * The boot refresh can only adopt (`reconcileAssignedRide`), so an ending that happens while
   * the app is open — a client or admin cancellation, or the driver's own action on another
   * device — has to arrive here. A terminal status releases the trip; anything else is a
   * refresh, including `driver_arrived_at`, which moves a `scheduled` ride without ending it.
   */
  useEffect(() => {
    const rideId = activeRide?.id;
    if (!rideId) return;
    const channel = supabase
      .channel(`driver-active-ride:${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rides",
          filter: `id=eq.${rideId}`,
        },
        (payload) => {
          const row = payload.new as RideRow;
          if (!row?.id) return;
          if (isActiveRideStatus(row.status)) {
            setActiveRide(toAppRide(row));
            return;
          }
          logOfferStage(
            "nav_assigned_ride_released",
            { ride_id: row.id, reason: `status:${row.status}` },
            row.id,
          );
          setActiveRide(null);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRide?.id, setActiveRide]);

  const [mapReady, setMapReady] = useState(false);
  const [mapLoaderTimedOut, setMapLoaderTimedOut] = useState(false);
  const [mapFollowPaused, setMapFollowPaused] = useState(false);
  const [routeRecalculating, setRouteRecalculating] = useState(false);
  const resumeMapFollowRef = useRef<(() => void) | null>(null);
  const mapControllerRef = useRef<MapControllerRef | null>(null);
  const mapHostViewRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const { mapBoot, hasGpsFix, setHasGpsFix } = useMapBootSeed(currentLocation);
  const [offerOverlayBand, setOfferOverlayBand] = useState(280);
  /**
   * Ride opened from a notification. Subscribed rather than peeked: a module
   * variable changed no dependency, so the promotion effect only fired by luck.
   */
  const pendingOfferOpen = useDriverStore((s) => s.pendingOfferOpen);
  /**
   * Card drawn from the notification payload while the ride is being read. Kept in its own
   * slice: it has no coordinates and no offer status, so it must never reach the offer stack.
   */
  const provisionalOffer = useDriverStore((s) => s.provisionalOffer);
  /** Timestamp of the last notification tap, read as a short-lived arrival window. */
  const offerArrivalAt = useDriverStore((s) => s.offerArrivalAt);
  /** Which path brought it: only a silent wake has no sound of its own. See the ring gate. */
  const offerArrivalSource = useDriverStore((s) => s.offerArrivalSource);
  /** Arrived from the driver's own tap: present it without entry motion. */
  const notificationArrival = isNotificationArrival(offerArrivalAt);
  /**
   * Persisted state (notably `activeRide`) comes back from AsyncStorage asynchronously.
   * Nothing about an offer may be decided before it lands.
   */
  const storeHydrated = useDriverStoreHydrated();
  /** Why the last notification open could not surface its ride; null hides the notice. */
  const [offerNotice, setOfferNotice] = useState<OfferNotice | null>(null);

  const onLocationUpdate = useCallback(
    (coords: { lat: number; lng: number }) => {
      setHasGpsFix(true);
      useDriverStore.getState().setCurrentLocation({
        lat: coords.lat,
        lng: coords.lng,
      });
    },
    [setHasGpsFix],
  );

  // Receiving: subscribe to new offers and run the catch-up poll. Offline is a hard stop.
  const canReceive = canReceiveOffers({
    isOnline,
    driverStatus,
    activeRideId: activeRide?.id ?? null,
  });
  // Displaying: the offer stack is rendered for any driver who can actually act on it.
  // Deliberately NOT gated on isOnline — a ride handed over by a notification tap must be
  // shown to an offline driver, because accepting it is what brings them back online.
  //
  // It IS gated on hydration: until the persisted store has come back, `activeRide` reads
  // null, and "no ride in progress" would then be an assumption rather than a fact.
  const canDisplay =
    storeHydrated &&
    canDisplayOffers({
      driverStatus,
      activeRideId: activeRide?.id ?? null,
    });

  const {
    setActiveOfferIndex,
    showOfferCarousel,
    mapRouteRide,
    mapInOfferMode,
    mapShowRoute,
    offerFitPadding,
    tripMapPoints,
  } = useDashboardOfferMap({
    activeRide,
    canDisplayOffers: canDisplay,
    availableRides,
    currentLocation,
    insets,
    offerOverlayBand,
    mapControllerRef,
  });

  const handleRouteReady = useCallback(
    (
      distanceMeters: number,
      durationSeconds: number,
      nextManeuver?: NavManeuverInfo | null,
      alongTrackMeters?: number | null,
    ) => {
      if (mapInOfferMode) return;
      pushNavProgress({
        distanceMeters,
        durationSeconds,
        alongTrackMeters: alongTrackMeters ?? null,
        nextManeuver: nextManeuver
          ? {
              type: nextManeuver.type,
              modifier: nextManeuver.modifier ?? undefined,
              distanceMeters: nextManeuver.distanceMeters,
              name: nextManeuver.name,
              exit:
                typeof nextManeuver.exit === 'number'
                  ? nextManeuver.exit
                  : undefined,
            }
          : null,
      });
    },
    [mapInOfferMode, pushNavProgress],
  );

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setMapLoaderTimedOut(true), 12_000);
    return () => clearTimeout(t);
  }, []);

  const showMapLoader = !mapLoaderTimedOut && (!mapBoot || !mapReady);

  const getOfferGateState = useCallback((): OfferGateState => {
    const state = useDriverStore.getState();
    return {
      suppressedRideIds: state.suppressedRideIds,
      deferredRides: state.deferredRides,
      availableRides: state.availableRides,
      declinedOfferIds: state.declinedOfferIds,
    };
  }, []);

  const presentOffer = useCallback(
    async (ride: Ride) => {
      if (!canReceive) return;
      if (!isRideStillOfferable(ride)) return;
      const gate = getOfferGateState();
      const alreadyStacked = gate.availableRides.some((row) => row.id === ride.id);
      if (alreadyStacked) {
        patchTrackedRide(ride);
        logOfferStage("promoted", { source: "realtime" }, ride.id);
        return;
      }
      if (!canPresentRideOffer(ride.id, gate)) return;
      addAvailableRide(ride);
      logOfferStage("promoted", { source: "realtime" }, ride.id);
    },
    [addAvailableRide, canReceive, getOfferGateState, patchTrackedRide],
  );

  const notifyRideUnavailable = useCallback(() => {
    Alert.alert(t("common.info"), t("ride.noLongerAvailable"));
  }, [t]);

  // Opening a ride_offer notification surfaces that ride in the overlay, or
  // explains why it cannot be surfaced. No offer gate here on purpose: a driver
  // may open an offer while offline and be brought online by accepting it, and a
  // dead offer must produce a notice rather than silence.
  //
  // The tray's Accept / Decline buttons ride along in the same payload, so they
  // can never be applied to a ride the driver has not actually been shown.
  useEffect(() => {
    void runPendingNotificationOfferOpen({
      pendingOfferOpen,
      driverStatus,
      driverId,
      storeHydrated,
      deferredRides,
      availableRides,
      isOnline,
      activeRideId: activeRide?.id ?? null,
      acceptingRideIds: acceptingRideIdsRef.current,
      promoteDeferredRide,
      promoteTrackedRideToFront,
      onUnavailable: notifyRideUnavailable,
      setOfferNotice,
    });
  }, [
    driverStatus,
    driverId,
    pendingOfferOpen,
    storeHydrated,
    deferredRides,
    availableRides,
    isOnline,
    activeRide?.id,
    promoteDeferredRide,
    promoteTrackedRideToFront,
    notifyRideUnavailable,
  ]);

  // Notices are explanations, not state — they fade out on their own.
  useEffect(() => {
    if (!offerNotice) return;
    const timer = setTimeout(() => setOfferNotice(null), OFFER_NOTICE_TTL_MS);
    return () => clearTimeout(timer);
  }, [offerNotice]);

  /**
   * Whether an offerable ride is in the deck — the "the card is on screen" half of the ring's
   * condition. Read through the same predicate the sheet and the overlay use, so an offer the
   * driver cannot act on is not offered a sound either.
   */
  const hasLiveOffer = useMemo(
    () => availableRides.some((ride) => isRideStillOfferable(ride)),
    [availableRides],
  );

  const offerLiveness = useMemo(
    () =>
      resolveOfferLiveness({
        hasLiveOffer,
        hasProvisionalCard: provisionalOffer !== null,
        hasNotice: offerNotice !== null,
      }),
    [hasLiveOffer, provisionalOffer, offerNotice],
  );

  /**
   * The arrival the ring has already acted on.
   *
   * Latched per arrival rather than per render: the decision is re-evaluated as the offer moves
   * from `pending` to `live`, and without a latch the ring would be re-armed on every pass.
   * Transient refusals are deliberately not latched — see `isTerminalRingAction`.
   */
  const ringHandledArrivalAt = useRef<number | null>(null);

  /**
   * Ring, and only here.
   *
   * The sound used to start from the native `confirmLaunch()`, which proves a wake landed and
   * nothing about whether an offer is on screen — so it rang for offers that died in flight, for
   * a pill tap, and for a driver opening the app themselves. The gate is `resolveOfferRingAction`,
   * which knows the one thing Kotlin cannot: whether an offer is painted and still alive.
   *
   * The cost is the delay between the resume and the confirmation of the offer (~0.3–1 s on a
   * cold start). Paid on purpose: a sound that can be wrong is worse than a sound that is late.
   */
  useEffect(() => {
    if (offerArrivalAt === null) return;
    const arrivalRideId =
      pendingOfferOpen?.rideId ?? provisionalOffer?.rideId ?? null;
    const action = resolveOfferRingAction({
      arrivalSource: offerArrivalSource,
      isOnline,
      liveness: offerLiveness,
      handledArrival: ringHandledArrivalAt.current === offerArrivalAt,
      // Read here rather than watched: the accept adds the id to this set *before* its round-trip
      // and only removes the ride from the deck when the server answers, so during that window
      // the ride is still `live` and still looks ringable. The set is the only signal that says
      // the driver has already answered. `activeRide` covers the moment the answer lands, and
      // covers an accept taken from the notification shade, which never goes through the card.
      answered:
        arrivalRideId !== null &&
        (acceptingRideIdsRef.current.has(arrivalRideId) ||
          activeRide?.id === arrivalRideId),
    });
    // "Not yet" is not "never": the deck may still be loading or the server may not have
    // answered, and latching those would leave the offer on screen in silence.
    if (!isTerminalRingAction(action)) return;

    ringHandledArrivalAt.current = offerArrivalAt;
    const rideId = arrivalRideId;
    if (action.kind === 'ring') {
      ringOffer();
      logOfferStage('ring_armed', {}, rideId);
      return;
    }
    if (action.kind === 'stop') {
      stopOfferRing(action.reason);
    }
    logOfferStage('ring_skipped', { reason: action.reason }, rideId);
  }, [
    offerArrivalAt,
    offerArrivalSource,
    offerLiveness,
    isOnline,
    pendingOfferOpen?.rideId,
    provisionalOffer?.rideId,
    activeRide?.id,
  ]);

  // Safety net for the provisional card: the normal path replaces it within one round-trip,
  // but a read that never lands must not leave a live Accept button on screen forever.
  useEffect(() => {
    if (!provisionalOffer) return;
    const rideId = provisionalOffer.rideId;
    const timer = setTimeout(() => {
      useDriverStore.getState().clearProvisionalOffer(rideId);
    }, PROVISIONAL_OFFER_TTL_MS);
    return () => clearTimeout(timer);
  }, [provisionalOffer]);

  usePendingRideChannel({
    canReceiveOffers: canReceive,
    isOnline,
    presentOffer,
    removeAvailableRide,
    clearAvailableRide,
    pruneUnofferableRides,
    patchTrackedRide,
    promoteTrackedRideToFront,
    getOfferGateState,
    myDriverId: driverId,
    acceptingRideIdsRef,
    onUnavailable: notifyRideUnavailable,
  });

  const handleAcceptRide = async (rideId: string) => {
    // The driver has answered, so both alerts have done their job. Stopped before the RPC rather
    // than after, so the answer feels immediate. The tray action does **not** come through here:
    // it reaches `acceptTrackedRide` directly from the boot's `takeAction`, and is silenced there.
    stopOfferRing("accepted");
    void dismissOfferNotification(rideId);
    await acceptTrackedRide({
      rideId,
      driverStatus,
      isOnline,
      setIsOnline,
      availableRides,
      deferredRides,
      availableRide,
      setActiveRide,
      removeAvailableRide,
      suppressRide,
      promoteTrackedRideToFront,
      onUnavailable: notifyRideUnavailable,
      acceptingRideIds: acceptingRideIdsRef.current,
    });
  };

  const handleDeclineRide = async (
    rideId: string,
    reason: "declined" | "timeout" = "declined",
  ) => {
    // Both ways of declining land here — the button and the card's own countdown — so the ring
    // is stopped by the answer rather than by the native window whenever there is an answer.
    // Same for the tray entry: refusing leaves nothing to announce.
    stopOfferRing(reason === "timeout" ? "timed_out" : "declined");
    void dismissOfferNotification(rideId);
    // Soft refuse / timeout (Refuser button or countdown) — not swipe.
    // Clears the placeholder in the same store write: otherwise the card yields
    // only while the ride is on the deck, and Refuser makes it reappear as
    // "Preparing offer…" instead of handing the ride to the bottomsheet.
    deferAvailableRide(rideId);
    if (reason === "declined") {
      await rideService.respondOffer(rideId, "declined");
    }
  };

  const handleDismissDeferredRide = (rideId: string) => {
    dismissDeferredRide(rideId);
    // Idempotent on a ride already declined from the overlay; records the
    // refusal for a timeout/overflow card that was only parked locally.
    void rideService.respondOffer(rideId, "declined");
  };

  const handleToggleOnline = () => {
    if (!driverId) return;
    void toggleDriverOnlineState({
      isOnline,
      localStatus: driverStatus,
      fetchFreshStatus: () => fetchFreshDriverStatus(driverId),
      applyFreshStatus: (status) =>
        applyDriverStatus(status, driverId, { silent: true }),
      setIsOnline,
      setJustValidated,
      syncPushToken: registerAndUpsertPushToken,
      onPushRegisterFailed: (failure) => {
        const copy = pushRegisterFailureI18n(failure.reason);
        Alert.alert(t(copy.titleKey), t(copy.bodyKey));
      },
    });
  };

  const dossierBanners = useMemo(
    () =>
      resolveDossierBanners({
        expiredTypes,
        expiring: expiringDocs,
        rejectedTypes: rejectedDocs.map((d) => d.document_type),
        driverStatus,
        isComplete: dossierIsComplete,
        justValidated,
      }),
    [
      expiredTypes,
      expiringDocs,
      rejectedDocs,
      driverStatus,
      dossierIsComplete,
      justValidated,
    ],
  );
  const { visible: visibleDossierBanners, overflowCount } = useMemo(
    () => sliceDossierBannerStack(dossierBanners),
    [dossierBanners],
  );
  // Dossier banners only. The offer notice is deliberately *not* counted: it is painted over the
  // map (`OfferNoticeOverlay`), so its existence must not pull the sheet up to the `notices`
  // palier — the sheet opening for a message nobody asked for is the bug this fixes.
  const noticeCount = dossierBanners.length;
  const noticesHeight = noticesBodyHeight(noticeCount);
  const hasNotices = noticeCount > 0;

  /**
   * Where each body palier ends, as reported by the section that ends there.
   *
   * The sheet snapped on one constant per palier until now, and each constant described a
   * component that was free to change without it. Reported: with a ride card in the sheet, "the
   * second palier cuts the bottom of the ride card, and the Journée and Courses cards under it are
   * cut too". Both were the same bug — the `rides` and `stats` paliers were ending *inside* the
   * content they exist to reveal — and no constant can be right about a deferred card that gains a
   * bonus line or day stats that gain a second line of type. The sections measure themselves, so a
   * palier is a content boundary again.
   *
   * The state lives here rather than in the sheet because the dashboard is also what places the
   * guidance bar and the offer notice above the sheet, from `overlaySheetVisibleH`: the two have to
   * agree on where the top edge is, and two sources for it is how an overlay ends up overlapping
   * the panel.
   */
  const [sheetBottoms, setSheetBottoms] = useState<SheetSectionBottoms>({});

  // Stable on purpose, and `SheetSection` holds it in a ref for the same reason: an inline arrow
  // would re-run that section's unmount cleanup on every render, clearing a measurement that is
  // still true — and no new `onLayout` arrives to put it back.
  const measureSheetSection = useCallback<SheetSectionMeasure>(
    (level, bottom) => {
      setSheetBottoms((previous) =>
        previous[level] === bottom ? previous : { ...previous, [level]: bottom },
      );
    },
    [],
  );

  const sheetBodies = useMemo(
    () => resolveSheetSectionBottoms(sheetBottoms, noticesHeight),
    [sheetBottoms, noticesHeight],
  );

  // The offered rides, and the provisional card once it has yielded to the real one. Both the
  // sheet rule and the overlay read these, so "a card is on screen" has a single meaning.
  const deckOfferIds = useMemo(
    () =>
      showOfferCarousel
        ? availableRides.map((r) => r.id)
        : availableRides.filter((r) => r.offerUnconfirmed).map((r) => r.id),
    [showOfferCarousel, availableRides],
  );

  const parkedOfferIds = useMemo(
    () => [
      ...deferredRides.map((ride) => ride.id),
      ...(declinedOfferIds ?? []),
    ],
    [deferredRides, declinedOfferIds],
  );

  const visibleProvisional = useMemo(
    () =>
      visibleProvisionalOffer(
        provisionalOffer,
        deckOfferIds,
        activeRide?.id ?? null,
        parkedOfferIds,
      ),
    [provisionalOffer, deckOfferIds, activeRide?.id, parkedOfferIds],
  );

  // Whether an offer card is actually painted, from the very rule the overlay applies. The sheet
  // rule reads it rather than a raw `availableRides.length`: an offer the driver may not be
  // shown must not collapse the sheet and hide the banner explaining why nothing is displayed.
  const offerCardVisible = useMemo(
    () =>
      shouldBypassBootGate({
        booting: loading,
        hasProvisionalOffer: visibleProvisional !== null,
        canShowOffers: showOfferCarousel,
        hasUnconfirmedOffer: availableRides.some((ride) => ride.offerUnconfirmed),
      }),
    [loading, visibleProvisional, showOfferCarousel, availableRides],
  );

  /**
   * Identity of the offered rides, for the sheet's collapse trigger. See `offerSetToken`: a
   * reorder must not move the sheet, an arrival must.
   */
  const offerToken = useMemo(
    () => offerSetToken(deckOfferIds, visibleProvisional),
    [deckOfferIds, visibleProvisional],
  );

  const bottomSheetSnapLevel = useMemo(() => {
    const offerableDeferred = deferredRides.filter((r) =>
      isRideStillOfferable(r),
    );
    return resolveDriverHomeSnapLevel({
      activeRide,
      hasPresentableOffer: offerCardVisible,
      availableRide,
      offerableDeferredCount: offerableDeferred.length,
      hasNotices,
    });
  }, [
    hasNotices,
    availableRide,
    offerCardVisible,
    deferredRides,
    activeRide,
  ]);

  const bottomSheetAllowedSnaps = useMemo(
    () =>
      resolveBottomSheetAllowedSnaps(
        activeRide,
        offerCardVisible,
        hasNotices,
      ),
    [activeRide, offerCardVisible, hasNotices],
  );

  // The palier the sheet has *actually* settled on, reported by the sheet itself: the
  // `bottomSheetSnapLevel` above is only what the sheet is asked for, and a driver who drags it
  // settles wherever they let go. The difference is the whole point of the two props — "the trip
  // is in front of the driver" (the trip body) versus "it is below the fold" (`nav`, 14 px).
  const [sheetSettledAt, setSheetSettledAt] = useState<SheetSnapLevel | null>(null);

  const overlaySheetLevel = sheetSettledAt ?? bottomSheetSnapLevel;

  const overlaySheetVisibleH = useMemo(
    () => sheetVisibleHeight(overlaySheetLevel, sheetBodies),
    [overlaySheetLevel, sheetBodies],
  );

  const mapRecenterBottomOffset = useMemo(
    () =>
      resolveMapRecenterBottomOffset(
        activeRide,
        sheetBodies,
        overlaySheetLevel,
      ),
    [activeRide, sheetBodies, overlaySheetLevel],
  );

  // How far the latest fix is from the drop-off pin, in metres — the only signal that can say the
  // drop-off has been reached, since the swipe the driver has at that point is the one that *ends*
  // the ride. Straight line rather than the router's remaining distance, deliberately: the
  // announcement must survive a routing failure, which is the same reason the maneuver card falls
  // back to the stage phrase. `currentLocation` only moves once the driver has covered 8 m
  // (`GPS_STORE_MIN_METERS`), which is the hysteresis the threshold needs; a parked fix cannot
  // jitter across the radius because a parked fix is never written.
  const metersToDropoff = useMemo(() => {
    const lat = activeRide?.dropoff_lat;
    const lon = activeRide?.dropoff_lon;
    if (!currentLocation || lat == null || lon == null) return null;
    return haversineMeters(currentLocation, { lat, lng: lon });
  }, [currentLocation, activeRide?.dropoff_lat, activeRide?.dropoff_lon]);

  // The instruction the driver is meant to be reading. The first two stages are read off the same
  // two fields the sheet uses, so the bar and the sheet can never announce different stages of the
  // same ride; the fourth is the drop-off reached, which no field carries and the fix proves.
  const tripStage = useMemo(
    () =>
      resolveTripStage(
        activeRide?.status,
        Boolean(activeRide?.driver_arrived_at),
        isWithinDropoffRadius(metersToDropoff),
      ),
    [activeRide?.status, activeRide?.driver_arrived_at, metersToDropoff],
  );
  const maneuverProgress = tripManeuverProgress(tripStage, navProgress);

  // The guidance bar is an announcement now, not a fixture: it emerges when the stage changes,
  // withdraws once the driver pulls away, and returns after the driver has sat still long enough.
  // `tripGuidancePeek` holds the rule, including why the movement signal is route progress and
  // not the location's speed, and why a stop can only be seen as the absence of new progress.
  const [guidancePeek, observeGuidancePeek] = useReducer(
    guidancePeekReducer,
    INITIAL_GUIDANCE_PEEK,
  );
  const remainingMeters = navProgress?.distanceMeters ?? null;
  const alongTrackMeters = navProgress?.alongTrackMeters ?? null;

  const guidanceFactsRef = useRef({
    stage: tripStage,
    remainingMeters,
    alongTrackMeters,
  });
  guidanceFactsRef.current = { stage: tripStage, remainingMeters, alongTrackMeters };

  useEffect(() => {
    observeGuidancePeek({
      stage: tripStage,
      remainingMeters,
      alongTrackMeters,
      nowMs: Date.now(),
    });
  }, [tripStage, remainingMeters, alongTrackMeters]);

  // The heartbeat, and the one thing it must not do is depend on the distance.
  //
  // It exists to notice a *silence*: a parked driver receives no route progress at all, so
  // without a tick the stop would never be observed and the announcement would never return.
  // Taking `remainingMeters` as a dependency would destroy it — every route push would tear the
  // interval down and rebuild it, and a timer that is rebuilt more often than its own period
  // never fires. It reads the facts from a ref instead, so only a real stage change restarts it.
  useEffect(() => {
    if (tripStage === null) return;
    const id = setInterval(() => {
      const facts = guidanceFactsRef.current;
      observeGuidancePeek({ ...facts, nowMs: Date.now() });
    }, GUIDANCE_TICK_MS);
    return () => clearInterval(id);
  }, [tripStage]);

  // Either source means the trip is already spelled out inside the sheet, so the bar would be a
  // second copy of it. Both are needed: the palier the sheet is heading for is known in the same
  // commit as the stage, the settled one only on the next.
  const tripVisibleInSheet =
    bottomSheetSnapLevel === "trip" || sheetSettledAt === "trip";

  const guidanceVisible =
    !mapInOfferMode &&
    guidancePeekVisible(guidancePeek, tripVisibleInSheet, tripStage);

  // The offer overlay is rendered by both branches below; see `DashboardOfferOverlay` for the
  // single visibility rule it applies. Nothing branches here on purpose: the element is the
  // same, only the surface it is painted over changes.
  const offerCarouselElement = (
    <DashboardOfferOverlay
      rides={availableRides}
      provisional={visibleProvisional}
      canShowOffers={showOfferCarousel}
      booting={loading}
      instantEntry={notificationArrival}
      onActiveIndexChange={setActiveOfferIndex}
      onOverlayHeightChange={setOfferOverlayBand}
      onAcceptRide={(rideId) => {
        void handleAcceptRide(rideId);
      }}
      onDeclineRide={(rideId, reason) => {
        void handleDeclineRide(rideId, reason ?? "declined");
      }}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      {/* The boot surface is deliberately *outside* the entry fade: it holds the card a
          notification built and nothing else, and the driver is watching it because they tapped.
          Under AnimatedPage it started transparent, and the wake showed a black screen whenever
          the arrival landed before the fade had run its 300 ms. */}
      {loading ? (
        <View
          className="flex-1 justify-center items-center"
          style={{ backgroundColor: "transparent" }}
        >
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : (
        <AnimatedPage instant={notificationArrival}>
          <View
            ref={mapHostViewRef}
            onLayout={() => setFrostScene(mapHostViewRef.current)}
            style={{ flex: 1, backgroundColor: BASEMAP_CANVAS, zIndex: -1 }}
          >
            {/* Single warm VTCMap — also used for offer overview + route */}
            <VTCMap
              style={{ zIndex: 0 }}
              initialCenter={mapBoot.center}
              initialZoom={mapBoot.zoom}
              start={tripMapPoints.start}
              end={tripMapPoints.end}
              approachFrom={tripMapPoints.approachFrom}
              drivers={[]}
              showRoute={mapShowRoute}
              presentation={mapInOfferMode ? "offer" : "default"}
              driverMarker={
                mapInOfferMode && currentLocation
                  ? { lat: currentLocation.lat, lng: currentLocation.lng }
                  : undefined
              }
              followUser={!activeRide && !mapRouteRide}
              navigationFollow={!!activeRide}
              activeRideId={activeRide?.id}
              // D-23 : les reglages de rattrapage viennent du snapshot de la course, donc d'un
              // reglage en base — ajustable sans redeployer l'application.
              navPolicy={navPolicyPayload(
                navPolicyFromSnapshot(activeRide?.fee_policy_snapshot),
              )}
              idleRecenterMs={8000}
              onFollowPausedChange={setMapFollowPaused}
              resumeFollowRef={resumeMapFollowRef}
              mapControllerRef={mapControllerRef}
              routeFitPaddingBottom={mapRouteFitPaddingBottom(activeRide)}
              routeFitPadding={mapInOfferMode ? offerFitPadding : undefined}
              onLocationUpdate={onLocationUpdate}
              onRouteReady={handleRouteReady}
              onMapReady={handleMapReady}
              onReroutingChange={setRouteRecalculating}
            />

            <MapRecenterButton
              visible={mapFollowPaused && !mapInOfferMode}
              bottom={Math.max(
                24,
                mapRecenterBottomOffset + CONTROL_BASE_OFFSET,
              )}
              navigationMode={!!activeRide}
              aboveGuidanceBar={guidanceVisible}
              onPress={() => resumeMapFollowRef.current?.()}
            />

            <VGpsLoader
              visible={showMapLoader && !mapInOfferMode}
              hint={mapLoaderHint(mapReady, hasGpsFix)}
            />

            {/* The instruction for this stage of the trip, told as an announcement. Deliberately
                outside the sheet: the sheet rests at `nav` while a ride is driven, which is 14 px
                of body, and the sentence the driver needs was living in there. It stays mounted
                for the whole stage so it can retract into the sheet instead of blinking out —
                `visible` is what moves. */}
            {tripStage && !mapInOfferMode ? (
              <TripGuidanceBar
                stage={tripStage}
                sheetVisibleH={overlaySheetVisibleH}
                visible={guidanceVisible}
              />
            ) : null}

            {routeRecalculating ? <TripRerouteNotice /> : null}
            {!routeRecalculating && maneuverProgress ? (
              <TripManeuverHud progress={maneuverProgress} stage={tripStage} />
            ) : null}
            {shouldShowTripNavigationHud(tripStage, navProgress) && navProgress ? (
              <TripArrivalHud
                progress={navProgress}
                aboveGuidanceBar={guidanceVisible}
              />
            ) : null}
          </View>
        </AnimatedPage>
      )}

      {/* The offer stack, then the notice, then the sheet: the one thing a raised sheet must
          always cover is a card, and the driver pulled it up on purpose. All three sit outside
          the map's group — a sealed stacking context — so the z-order is document order here and
          each layer's own zIndex settles it. The notice takes the slot the card leaves when a
          tapped offer turns out to be unofferable. */}
      {offerCarouselElement}
      {offerNotice ? (
        <OfferNoticeOverlay
          notice={offerNotice}
          sheetVisibleH={overlaySheetVisibleH}
          onDismiss={() => setOfferNotice(null)}
          onOpenProfile={() => router.push("/(auth)/profile-setup")}
          onOpenHome={() => router.push("/(tabs)")}
        />
      ) : null}
      {loading ? null : (
        <BottomSheet
          snapLevel={bottomSheetSnapLevel}
          allowedSnaps={bottomSheetAllowedSnaps}
          bodies={sheetBodies}
          collapseToken={offerToken}
          onSettle={setSheetSettledAt}
        >
          {/* One measured section per body palier, in the order the paliers stack. The wrapper is
              what turns "how tall is the online row today" into a number the snap can use; see
              `SheetSection` and `resolveSheetSectionBottoms`. */}
          <SheetSection level="online" onMeasure={measureSheetSection}>
            <OnlineStatusRow
              duty={resolveDriverDuty(isOnline, activeRide)}
              isOnline={isOnline}
              onToggle={handleToggleOnline}
              pushStatus={pushRegisterStatus}
            />
          </SheetSection>
          <SheetSection level="notices" onMeasure={measureSheetSection}>
            <DriverStatusBanner
              banners={visibleDossierBanners}
              overflowCount={overflowCount}
              rejectedDocs={rejectedDocs}
              expiredTypes={expiredTypes}
              onOpenProfile={() => router.push("/(auth)/profile-setup")}
              onDismissValidated={() => setJustValidated(false)}
            />
          </SheetSection>
          <DriverHomeSheetBody
            activeRide={activeRide}
            availableRide={availableRide}
            deferredRides={deferredRides}
            stats={stats}
            tripActions={tripActions}
            onOpenActiveRide={() => router.push("/(tabs)/rides")}
            onPromoteDeferred={promoteDeferredRide}
            onDismissDeferred={handleDismissDeferredRide}
            onMeasure={measureSheetSection}
          />
        </BottomSheet>
      )}
    </View>
  );
}

function DriverHomeSheetBody({
  activeRide,
  availableRide,
  deferredRides,
  stats,
  tripActions,
  onOpenActiveRide,
  onPromoteDeferred,
  onDismissDeferred,
  onMeasure,
}: Readonly<{
  activeRide: Ride | null;
  availableRide: Ride | null;
  deferredRides: Ride[];
  stats: DriverStats;
  tripActions: ReturnType<typeof useActiveTripActions>;
  onOpenActiveRide: () => void;
  onPromoteDeferred: (rideId: string) => void;
  onDismissDeferred: (rideId: string) => void;
  onMeasure: SheetSectionMeasure;
}>) {
  const pickupDest = tripActions.pickupDest();
  const dropoffDest = tripActions.dropoffDest();
  const showActiveTrip = Boolean(activeRide && pickupDest && dropoffDest);

  const slotChrome = {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: 12,
    marginTop: 4,
  } as const;

  return (
    <>
      {showActiveTrip && activeRide && pickupDest && dropoffDest ? (
        // Two different bodies in the same slot, so two different paliers: an active trip is the
        // `trip` palier, and the offers standing in for it are `rides`. Only one is ever mounted,
        // which is why each measures itself instead of the slot measuring both.
        //
        // `SheetSection` must be a direct child of the sheet ScrollView (the fragment here does
        // not create a native parent). A wrapper around it would make `onLayout.y` relative to
        // that wrapper, so the trip palier would stop at the swipe's own height and clip
        // « Je suis arrivé » — the only expanded snap during a ride.
        <SheetSection level="trip" onMeasure={onMeasure}>
          <View className="mb-5" style={slotChrome}>
            <ActiveTripSheet
              ride={activeRide}
              pickupDest={pickupDest}
              dropoffDest={dropoffDest}
              onMarkArrived={() => {
                void tripActions.markArrived();
              }}
              onStartTrip={() => {
                void tripActions.startTrip();
              }}
              onCompleteTrip={() => {
                void tripActions.completeTrip();
              }}
              onCancel={tripActions.cancelTrip}
            />
          </View>
        </SheetSection>
      ) : (
        <SheetSection level="rides" onMeasure={onMeasure}>
          <View className="mb-5" style={slotChrome}>
            {!activeRide ? (
              <Text
                className="text-sm font-semibold mb-3"
                style={{ color: "rgba(255,255,255,0.8)" }}
              >
                COURSES DISPONIBLES
              </Text>
            ) : null}
            <DashboardRidePreview
              activeRide={null}
              availableRide={availableRide}
              deferredRides={deferredRides.filter((r) => isRideStillOfferable(r))}
              contentInset={24}
              onOpenActiveRide={onOpenActiveRide}
              onPromoteDeferred={onPromoteDeferred}
              onDismissDeferred={onDismissDeferred}
            />
          </View>
        </SheetSection>
      )}
      {!activeRide ? (
        <SheetSection level="stats" onMeasure={onMeasure}>
          <DriverDayStatsRow />
        </SheetSection>
      ) : null}
    </>
  );
}

/**
 * La journee du chauffeur, derivee des COURSES et non du store.
 *
 * `stats.todayEarnings` / `stats.todayRides` sont persistes dans AsyncStorage et incrementes a
 * chaque fin de course, sans rien qui les remette a zero a minuit : le chiffre reste donc « vrai »
 * tant que le telephone n'est pas laisse passer une nuit. Mesure du proprietaire : la carte
 * annoncait plus de 6 000 EUR sous le mot JOURNEE — un cumul de plusieurs mois.
 *
 * Les lignes du serveur sont le seul compteur qui se remet a zero tout seul. La lecture est la
 * meme que celle de l'onglet Courses (`summarizeHistoryToday`), et un echec de chargement NE
 * remplace PAS le chiffre par zero : « je n'ai pas encore lu » et « tu n'as rien gagne » ne sont
 * pas la meme phrase.
 */
function DriverDayStatsRow() {
  const { t } = useTranslation();
  const activeRideId = useDriverStore((state) => state.activeRide?.id ?? null);
  const [today, setToday] = useState<{ rides: number; earnings: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const fetched = await rideService.fetchCompletedRides(localDayBounds(new Date()), 0, 100);
      if (!fetched.ok) return;
      setToday(summarizeHistoryToday(fetched.rides, new Date()));
    } catch {
      // Un diagnostic ne doit pas casser l'ecran : on garde ce qui est affiche.
    }
  }, []);

  // Au montage, a chaque venue sur l'onglet, et quand une course se termine (l'identifiant de la
  // course active retombe a null) — c'est-a-dire exactement quand le chiffre change.
  useEffect(() => {
    void load();
  }, [load, activeRideId]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const amount = today ? `€${today.earnings.toFixed(2)}` : "—";
  const count = today ? String(today.rides) : "—";

  return (
    <View className="flex-row justify-between mb-4 mt-1">
      <View
        style={{
          flex: 1,
          marginRight: 6,
          padding: 16,
          borderRadius: 16,
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.05)",
        }}
      >
        <Text
          className="text-xs font-bold tracking-wider"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {t("ridesScreen.earned").toUpperCase()}
        </Text>
        <Text className="text-2xl font-black mt-1" style={{ color: "#fff" }}>
          {amount}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          marginLeft: 6,
          padding: 16,
          borderRadius: 16,
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.05)",
        }}
      >
        <Text
          className="text-xs font-bold tracking-wider"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {t("ridesScreen.rides").toUpperCase()}
        </Text>
        <Text className="text-2xl font-black mt-1" style={{ color: "#fff" }}>
          {count}
        </Text>
      </View>
    </View>
  );
}

function OnlineStatusRow({
  duty,
  isOnline,
  onToggle,
  pushStatus,
}: Readonly<{
  duty: DriverDuty;
  isOnline: boolean;
  onToggle: () => void;
  pushStatus: PushRegisterResult | null;
}>) {
  const { t } = useTranslation();
  const { titleKey, subtitleKey } = onlineStatusCopyKeys(duty, isOnline);
  const pushFailure =
    pushStatus && !pushStatus.ok
      ? pushRegisterFailureI18n(pushStatus.reason)
      : null;
  return (
    <View
      style={{
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: "#fff",
            fontSize: 15,
            fontWeight: "700",
          }}
        >
          {t(titleKey)}
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 12,
            marginTop: 3,
            fontWeight: "500",
          }}
        >
          {t(subtitleKey)}
        </Text>
        {pushFailure ? (
          <Text
            style={{
              color: "#fbbf24",
              fontSize: 11,
              marginTop: 6,
              fontWeight: "600",
            }}
          >
            {t(pushFailure.bodyKey)}
          </Text>
        ) : null}
      </View>
      {/* The one control on the sheet, so it is allowed to be the app's blue outright.

          Both halves are blue, which is the part the platform does not do for you: its switch is
          a white grip on a coloured track, and a white disc reads as a piece the paint never
          reached. So the track takes the accent at the weight an edge is drawn with and the grip
          takes the accent itself — the same "a tint behind, the accent in front" rule the option
          chips follow, which is what keeps the grip visible against its own track (3.7:1). */}
      <Switch
        value={isOnline}
        onValueChange={onToggle}
        trackColor={{
          false: "rgba(255,255,255,0.18)",
          true: `${VE_BLUE.base}${VE_BLUE.strongAlpha}`,
        }}
        thumbColor={isOnline ? VE_BLUE.base : "#f4f4f5"}
        ios_backgroundColor="rgba(255,255,255,0.18)"
        accessibilityLabel={
          isOnline ? t("dashboard.goOffline") : t("dashboard.goOnline")
        }
      />
    </View>
  );
}

function DriverStatusBanner({
  banners,
  overflowCount,
  rejectedDocs,
  expiredTypes,
  onOpenProfile,
  onDismissValidated,
}: Readonly<{
  banners: DossierBannerHit[];
  overflowCount: number;
  rejectedDocs: Array<{
    document_type: string;
    rejection_reason: string | null;
  }>;
  expiredTypes: string[];
  onOpenProfile: () => void;
  onDismissValidated: () => void;
}>) {
  const { t } = useTranslation();
  const opsStatusReason = useDriverFolderStore((s) => s.opsStatusReason);

  if (banners.length === 0) return null;

  return (
    <View className="mb-2">
      {banners.map((banner) => {
        const { title, subtitle, accent, icon } = buildDossierBannerCopy({
          kind: banner.kind,
          slot: banner.slot,
          expiring: banner.expiring,
          expiredLabels: expiredTypes.map((type) =>
            translateDocumentType(t, type),
          ),
          expiringLabel: translateDocumentType(
            t,
            banner.expiring?.document_type ?? null,
          ),
          rejectedReason: rejectedDocs[0]?.rejection_reason ?? null,
          opsStatusReason,
        });
        const onPress =
          banner.kind === "validated" ? onDismissValidated : onOpenProfile;

        return (
          <Pressable
            key={`${banner.slot}-${banner.kind}`}
            onPress={onPress}
            style={{ marginBottom: 6 }}
          >
            <View style={{ paddingVertical: 10, paddingHorizontal: 4 }}>
              <View className="flex-row items-center gap-2.5">
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: bannerAccentBackground(accent),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={icon} size={14} color={accent} />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-sm font-bold mb-0.5"
                    style={{ color: accent }}
                  >
                    {title}
                  </Text>
                  <Text
                    className="text-xs font-medium"
                    numberOfLines={2}
                    style={{ color: "rgba(255,255,255,0.9)" }}
                  >
                    {subtitle}
                  </Text>
                </View>
                <Feather
                  name={banner.kind === "validated" ? "x" : "chevron-right"}
                  size={18}
                  color={accent}
                  style={{ opacity: 0.8 }}
                />
              </View>
            </View>
          </Pressable>
        );
      })}
      {overflowCount > 0 ? (
        <Pressable onPress={onOpenProfile} accessibilityRole="button">
          <Text
            className="text-xs font-semibold"
            style={{ color: "rgba(255,255,255,0.72)", paddingVertical: 4 }}
          >
            {`+${overflowCount} autre(s)`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DeferredRideCard({
  ride,
  cardWidth,
  isLast,
  gap,
  onPromote,
  onDismiss,
}: Readonly<{
  ride: Ride;
  cardWidth: number;
  isLast: boolean;
  gap: number;
  onPromote: (rideId: string) => void;
  onDismiss: (rideId: string) => void;
}>) {
  const { t } = useTranslation();
  const incentive = Number(ride.client_incentive ?? 0);
  const { total } = resolveRideOfferPrice(ride);
  let priceLabel = "Prix estimé";
  if (ride.estimated_price != null || incentive > 0) {
    priceLabel = `€${total.toFixed(2)}`;
  }
  const distanceLabel = formatRideDistanceKm(ride.distance);
  const durationLabel = formatRideDurationMin(ride.duration, ride.distance);
  const pickupWhen = formatPickupDateTime(ride.pickup_time);
  const statusLabel = getPendingRideDisplayLabel(
    ride.pickup_time,
    ride.matching_deadline_at,
    ride.matching_paused_at,
  ).toUpperCase();
  const showMatchingFlame = shouldShowMatchingFlameBadge(
    ride.status ?? "delayed",
    ride.pickup_time,
    ride.matching_deadline_at,
    ride.matching_paused_at,
  );
  const isOverdue = !isRideStillOfferable(ride);

  return (
    <View style={{ width: cardWidth, marginRight: isLast ? 0 : gap }}>
      <View
        style={{
          padding: 14,
          borderRadius: 14,
          backgroundColor: "rgba(255,255,255,0.04)",
          borderWidth: 1,
          borderColor: `${VE_BLUE.base}${VE_BLUE.strongAlpha}`,
        }}
      >
        <View className="flex-row justify-between items-start mb-3">
          <Pressable onPress={() => onPromote(ride.id)} className="flex-1">
            {/* The one element on this card that is *filled* with the accent. It takes the pair the
                portal's buttons are built from, because that is the pair measured to carry white
                text (5.17:1 and 8.79:1) — the lifted glyph pair is legible as a stroke on the
                chrome and not as a background under type.

                The overdue state keeps its rose: a status the driver has missed is the one thing
                here that is a warning, and a warning in the app's own colour stops being one. */}
            <View className="px-2 py-0.5 rounded self-start overflow-hidden">
              {isOverdue ? (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: "rgba(251, 113, 133, 0.2)" },
                  ]}
                />
              ) : (
                <LinearGradient
                  colors={VE_BLUE.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              {showMatchingFlame ? (
                <MaterialCommunityIcons
                  name="fire"
                  size={12}
                  color={isOverdue ? "#fb7185" : "#ffffff"}
                  accessibilityLabel="En recherche"
                />
              ) : (
                <Text
                  className="text-[10px] font-bold tracking-wide"
                  style={{ color: isOverdue ? "#fb7185" : "#ffffff" }}
                >
                  {statusLabel}
                </Text>
              )}
            </View>
          </Pressable>
          <View className="items-end">
            <Pressable
              onPress={() => onDismiss(ride.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t("ride.hideDeferredOffer")}
              style={{
                marginBottom: 6,
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Feather name="x" size={16} color="rgba(255,255,255,0.7)" />
            </Pressable>
            <Pressable onPress={() => onPromote(ride.id)}>
              <Text className="text-white text-xl font-bold">{priceLabel}</Text>
            </Pressable>
            {incentive > 0 ? (
              <View className="mt-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5">
                <Text className="text-amber-300 text-[10px] font-bold">
                  Bonus +{incentive.toFixed(0)}€
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable onPress={() => onPromote(ride.id)}>
        {pickupWhen ? (
          <View
            className="flex-row items-center mb-2.5"
            style={{ gap: 6 }}
          >
            <Feather name="clock" size={13} color={VE_BLUE.base} />
            <Text className="text-blue-200 text-xs font-semibold">
              {pickupWhen}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 8, marginBottom: 10 }}>
          {/* Each place is named with the colour the map draws it in, not one of its own: the
              departure pin is `MAP_PALETTE.departure` here because it is that marker, and the
              full-screen offer card behind this one has always said so. */}
          <View className="flex-row items-start" style={{ gap: 8 }}>
            <Feather
              name="map-pin"
              size={14}
              color={MAP_PALETTE.departure}
              style={{ marginTop: 2 }}
            />
            <Text className="text-white text-sm font-medium flex-1" numberOfLines={2}>
              {ride.pickup_address}
            </Text>
          </View>
          <View className="flex-row items-start" style={{ gap: 8 }}>
            <Feather
              name="flag"
              size={14}
              color={MAP_PALETTE.arrival}
              style={{ marginTop: 2 }}
            />
            <Text className="text-neutral-300 text-sm flex-1" numberOfLines={2}>
              {ride.dropoff_address}
            </Text>
          </View>
        </View>

        <RideOfferExtras
          compact
          interactive={false}
          selectedOnly
          options={ride.options}
          vehicleType={ride.vehicle_type}
          style={{ marginBottom: 10 }}
        />

        <View className="flex-row justify-between items-center">
          <Text className="text-neutral-500 text-xs">
            {distanceLabel} · {durationLabel}
          </Text>
          <Text className="text-blue-400 text-xs font-semibold">
            Voir l’offre
          </Text>
        </View>
        </Pressable>
      </View>
    </View>
  );
}

function DashboardRidePreview({
  activeRide,
  availableRide,
  deferredRides,
  contentInset = 24,
  onOpenActiveRide,
  onPromoteDeferred,
  onDismissDeferred,
}: Readonly<{
  activeRide: Ride | null;
  availableRide: Ride | null;
  deferredRides: Ride[];
  contentInset?: number;
  onOpenActiveRide: () => void;
  onPromoteDeferred: (rideId: string) => void;
  onDismissDeferred: (rideId: string) => void;
}>) {
  const gap = 12;
  const screenW = Dimensions.get("window").width;
  // Align with sheet padding, leave a peek of the next card
  const cardWidth = Math.min(screenW - contentInset * 2 - 28, 340);

  if (activeRide) {
    return (
      <Pressable onPress={onOpenActiveRide}>
        <View
          style={{
            padding: 16,
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(16, 185, 129, 0.3)",
          }}
        >
          <View className="flex-row justify-between items-start mb-3">
            <View className="bg-emerald-500/20 px-2 py-0.5 rounded">
              <Text className="text-emerald-400 text-[10px] font-bold tracking-wide">
                EN COURS
              </Text>
            </View>
            <RidePriceBonus ride={activeRide} size="lg" tone="dark" />
          </View>
          {formatPickupDateTime(activeRide.pickup_time) ? (
            <View
              className="flex-row items-center mb-2.5"
              style={{ gap: 6 }}
            >
              <Feather name="clock" size={13} color={VE_BLUE.base} />
              <Text className="text-blue-200 text-xs font-semibold">
                {formatPickupDateTime(activeRide.pickup_time)}
              </Text>
            </View>
          ) : null}
          <View style={{ gap: 8, marginBottom: 10 }}>
            <View className="flex-row items-start" style={{ gap: 8 }}>
              <Feather
                name="map-pin"
                size={14}
                color={MAP_PALETTE.departure}
                style={{ marginTop: 2 }}
              />
              <Text
                className="text-white text-sm font-medium flex-1"
                numberOfLines={2}
              >
                {activeRide.pickup_address}
              </Text>
            </View>
            <View className="flex-row items-start" style={{ gap: 8 }}>
              <Feather
                name="flag"
                size={14}
                color={MAP_PALETTE.arrival}
                style={{ marginTop: 2 }}
              />
              <Text className="text-neutral-300 text-sm flex-1" numberOfLines={2}>
                {activeRide.dropoff_address}
              </Text>
            </View>
          </View>
          <RideOfferExtras
            compact
            interactive={false}
            selectedOnly
            options={activeRide.options}
            vehicleType={activeRide.vehicle_type}
            style={{ marginBottom: 10 }}
          />
          <View className="flex-row items-center justify-between">
            <Text className="text-neutral-500 text-xs">
              {formatRideDistanceKm(activeRide.distance)} ·{" "}
              {formatRideDurationMin(activeRide.duration, activeRide.distance)}
            </Text>
            <View className="flex-row items-center">
              <Text className="text-blue-400 text-xs font-semibold mr-1">
                Détails
              </Text>
              <Feather name="chevron-right" size={14} color={VE_BLUE.base} />
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  if (deferredRides.length > 0) {
    return (
      <View style={{ marginHorizontal: -contentInset }}>
        {availableRide ? (
          <Text
            className="text-gray-500 text-xs mb-2"
            style={{ opacity: 0.8, paddingHorizontal: contentInset }}
          >
            Offre en plein écran · {deferredRides.length} en file
          </Text>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={cardWidth + gap}
          snapToAlignment="start"
          disableIntervalMomentum
          nestedScrollEnabled
          contentContainerStyle={{
            paddingHorizontal: contentInset,
            paddingVertical: 2,
          }}
        >
          {deferredRides.map((ride, index) => (
            <DeferredRideCard
              key={ride.id}
              ride={ride}
              cardWidth={cardWidth}
              gap={gap}
              isLast={index === deferredRides.length - 1}
              onPromote={onPromoteDeferred}
              onDismiss={onDismissDeferred}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  if (availableRide) {
    return (
      <View style={{ paddingVertical: 16, opacity: 0.7 }}>
        <Text className="text-gray-400 text-sm text-center">
          Offre affichée en plein écran
        </Text>
      </View>
    );
  }

  return (
    <View className="items-center py-8 opacity-50">
      <Text style={{ color: "rgba(255,255,255,0.4)" }}>
        Aucune autre course disponible pour le moment.
      </Text>
    </View>
  );
}
