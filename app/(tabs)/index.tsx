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
import * as Location from "expo-location";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useDriverStore, Ride, canPresentRideOffer, type DriverStats, type OfferGateState, type ProvisionalOffer } from "../../src/lib/stores/driverStore";
import { hydratePendingOffers } from "../../src/lib/utils/offerHydrate";
import { toAppRide, type RideRow } from "../../src/lib/utils/toAppRide";
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
  visibleProvisionalOffer,
} from "../../src/lib/utils/homeSheetSnap";
import {
  GUIDANCE_TICK_MS,
  guidancePeekReducer,
  guidancePeekVisible,
  INITIAL_GUIDANCE_PEEK,
} from "../../src/lib/utils/tripGuidancePeek";
import { CONTROL_BASE_OFFSET } from "../../src/lib/utils/overlayLane";
import { useDriverFolderStore } from "../../src/lib/stores/driverFolderStore";
import { normalizeFolderStatus } from "../../src/lib/folderStatus";
import { useDriverLocation } from "../../src/hooks/useDriverLocation";
import { useDriverStoreHydrated } from "../../src/hooks/useDriverStoreHydrated";
import { useOverlayPermissionPrompt } from "../../src/hooks/useOverlayPermissionPrompt";
import { ringOffer, stopOfferRing } from "../../src/lib/overlay/overlayService";
import {
  isTerminalRingAction,
  resolveOfferLiveness,
  resolveOfferRingAction,
} from "../../src/lib/notifications/offerRing";
import { AnimatedPage } from "../../src/components/AnimatedPage";
import { BottomSheet, type SheetSnapLevel, NAV_SHEET_VISIBLE_H, tripSheetVisibleHeight } from "../../src/components/BottomSheet";
import { OfferRideCarousel } from "../../src/components/OfferRideCarousel";
import { RideOfferExtras } from "../../src/components/RideOfferExtras";
import { VTCMap } from "../../src/map";
import type { MapControllerRef, NavManeuverInfo } from "../../src/map/types";
import { rideService } from "../../src/services/rideService";
import { setDriverOffline } from "../../src/lib/services/locationService";
import {
  consumePendingOfferOpen,
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
} from "../../src/lib/notifications/offerPreview";
import { pushRegisterFailureI18n } from "../../src/lib/notifications/pushStatusCopy";
import { usePushRegisterStatus } from "../../src/hooks/usePushRegisterStatus";
import { ActiveTripSheet } from "../../src/components/ActiveTripSheet";
import { TripManeuverHud } from "../../src/components/TripManeuverHud";
import { TripArrivalHud } from "../../src/components/TripArrivalHud";
import { TripGuidanceBar } from "../../src/components/TripGuidanceBar";
import { resolveTripStage } from "../../src/lib/utils/tripGuidance";
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
import { OfferNoticeCard } from "../../src/components/OfferNoticeCard";
import {
  canDisplayOffers,
  canReceiveOffers,
  resolveOfferOpenOutcome,
  shouldBypassBootGate,
  takeReadyOfferOpen,
  type OfferNotice,
} from "../../src/lib/utils/offerOpenOutcome";
import { acceptTrackedRide } from "../../src/lib/utils/acceptTrackedRide";
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
          // Same read as a notification open: the offer may already be dead by
          // the time the realtime event lands, and only the RPC can say so.
          const fetched = await rideService.fetchDriverOfferRide(row.ride_id);
          if (cancelled || !fetched.ok) return;
          if (!fetched.offer.alive || !isRideStillOfferable(fetched.ride)) {
            return;
          }
          await presentOffer(fetched.ride);
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

function shouldShowTripNavigationHud(
  ride: Ride | null,
  progress: NavProgress | null,
): boolean {
  if (!ride || !progress) return false;
  const waitingAtPickup =
    ride.status === "scheduled" && Boolean(ride.driver_arrived_at);
  return !waitingAtPickup;
}

function resolveMapRecenterBottomOffset(
  activeRide: Ride | null,
  noticesHeight: number,
): number {
  if (!activeRide) return 56;
  const waitingAtPickup =
    activeRide.status === "scheduled" && Boolean(activeRide.driver_arrived_at);
  return waitingAtPickup
    ? tripSheetVisibleHeight(noticesHeight)
    : NAV_SHEET_VISIBLE_H;
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

async function hydrateAssignedRideFromServer(
  driverId: string,
  alreadyHydratedRef: { current: boolean },
  driverStatus: string | null,
) {
  const assigned = await rideService.fetchAssignedRide(driverId);
  const store = useDriverStore.getState();
  if (!assigned) {
    store.setActiveRide(null);
    alreadyHydratedRef.current = false;
    return;
  }
  store.setActiveRide(assigned);
  if (
    canDriverGoOnline(driverStatus) &&
    shouldForceOnlineOnAssignedHydrate(alreadyHydratedRef.current, true)
  ) {
    store.setIsOnline(true);
  }
  alreadyHydratedRef.current = true;
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
 * It is rendered by the boot branch (so a card built from the notification payload can appear
 * while the identity is still resolving) and by the dashboard tree; sharing a component keeps
 * the two from drifting apart, and keeps the visibility rule in a single spot.
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
  const deckRides = canShowOffers ? rides : [];
  // `provisional` arrives already resolved against the deck: the parent applies
  // `visibleProvisionalOffer` once, and the sheet rule reads the same answer. Re-deriving it here
  // is what would let the two drift apart.
  const visible = shouldBypassBootGate({
    booting,
    hasProvisionalOffer: provisional !== null,
    canShowOffers,
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
    addAvailableRide,
    removeAvailableRide,
    deferAvailableRide,
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
      addAvailableRide: s.addAvailableRide,
      removeAvailableRide: s.removeAvailableRide,
      deferAvailableRide: s.deferAvailableRide,
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
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaderTimedOut, setMapLoaderTimedOut] = useState(false);
  const [mapFollowPaused, setMapFollowPaused] = useState(false);
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
    ) => {
      if (mapInOfferMode) return;
      pushNavProgress({
        distanceMeters,
        durationSeconds,
        nextManeuver: nextManeuver
          ? {
              type: nextManeuver.type,
              modifier: nextManeuver.modifier ?? undefined,
              distanceMeters: nextManeuver.distanceMeters,
              name: nextManeuver.name,
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
      if (!canPresentRideOffer(ride.id, gate)) return;
      addAvailableRide(ride);
      logOfferStage("promoted", { source: "realtime" }, ride.id);
    },
    [addAvailableRide, canReceive, getOfferGateState],
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
    // Gated on the identity the decision actually needs, never on `loading`. The boot keeps
    // refreshing dossier metadata and the assigned ride long after these two are known, and
    // waiting for all of it is what froze an offer behind the entire startup sequence — a
    // fresh offer must not queue behind the driver's paperwork.
    const readyOpen = takeReadyOfferOpen({
      pendingOfferOpen,
      driverStatus,
      driverId,
      storeHydrated,
    });
    if (!readyOpen) return;

    const { rideId, action } = readyOpen;
    consumePendingOfferOpen();
    logOfferStage("boot_ready", { action: action ?? "open" }, rideId);

    // Fresh store state: promoting is synchronous, so the ride is addressable.
    const takeAction = async () => {
      const store = useDriverStore.getState();
      if (action === "accept") {
        logOfferStage("accept_tapped", { source: "notification_action" }, rideId);
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
          onUnavailable: notifyRideUnavailable,
          acceptingRideIds: acceptingRideIdsRef.current,
        });
        return;
      }
      if (action === "decline") {
        store.deferAvailableRide(rideId);
        await rideService.respondOffer(rideId, "declined");
      }
    };

    const deferred = deferredRides.find((ride) => ride.id === rideId);
    if (deferred) {
      if (isRideStillOfferable(deferred)) {
        // The placeholder is deliberately left in place: the deck only takes over once the
        // display gate has passed, and until then it is the only card describing this ride.
        promoteDeferredRide(rideId);
        logOfferStage("promoted", { source: "deferred" }, rideId);
        void takeAction();
      } else {
        // A dead offer: the placeholder must go, or it would keep offering an Accept for
        // something the notice right below says is gone.
        useDriverStore.getState().clearProvisionalOffer(rideId);
        const refused = (
          useDriverStore.getState().declinedOfferIds ?? []
        ).includes(rideId);
        logOfferStage(
          "notice",
          {
            reason: refused ? "offer_declined" : "matching_closed",
            source: "deferred",
          },
          rideId,
        );
        setOfferNotice({
          reason: refused ? "offer_declined" : "matching_closed",
          ride: deferred,
        });
      }
      return;
    }

    const stacked = availableRides.find((ride) => ride.id === rideId);
    if (stacked) {
      if (isRideStillOfferable(stacked)) {
        // Already tracked with full data, but "tracked" is not "painted": the deck still has
        // to pass the display gate, and the placeholder is the only card until it does.
        promoteTrackedRideToFront(stacked);
        logOfferStage("promoted", { source: "stack" }, rideId);
        void takeAction();
      } else {
        useDriverStore.getState().clearProvisionalOffer(rideId);
        logOfferStage(
          "notice",
          { reason: "matching_closed", source: "stack" },
          rideId,
        );
        setOfferNotice({ reason: "matching_closed", ride: stacked });
      }
      return;
    }

    void (async () => {
      logOfferStage("fetch_started", {}, rideId);
      const fetchStartedAt = Date.now();
      const fetched = await rideService.fetchDriverOfferRide(rideId);
      const outcome = resolveOfferOpenOutcome(fetched, {
        driverStatus,
        activeRideId: activeRide?.id ?? null,
        isOnline,
        myDriverId: driverId,
      });
      // The single most useful line when an offer does not appear: it separates "the read
      // was slow" from "the read said the offer was dead" from "the read never landed".
      logOfferStage(
        "fetch_result",
        {
          duration_ms: Date.now() - fetchStartedAt,
          kind: outcome.kind,
          ...(fetched.ok
            ? { offer_status: fetched.offer.status, alive: fetched.offer.alive }
            : { fetch_reason: fetched.reason }),
        },
        rideId,
      );
      if (outcome.kind === "overlay" && isRideStillOfferable(outcome.ride)) {
        // Promotion, not clearing: the placeholder holds the screen until the deck can paint,
        // and the overlay drops it the moment that ride is in the deck.
        setOfferNotice(null);
        promoteTrackedRideToFront(outcome.ride);
        logOfferStage("promoted", { source: "fetch" }, rideId);
        await takeAction();
        return;
      }
      // The server has spoken and the offer is not presentable: stop showing anything it did
      // not confirm.
      useDriverStore.getState().clearProvisionalOffer(rideId);
      const notice =
        outcome.kind === "notice"
          ? outcome.notice
          : { reason: "matching_closed" as const, ride: outcome.ride };
      logOfferStage("notice", { reason: notice.reason, source: "fetch" }, rideId);
      setOfferNotice(notice);
    })();
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
    // The driver has answered, so the alert has done its job. Stopped here rather than in the
    // carousel because this is also the funnel for the tray action: accepting from the
    // notification shade never goes through the card.
    stopOfferRing("accepted");
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
    stopOfferRing(reason === "timeout" ? "timed_out" : "declined");
    // Soft refuse / timeout (Refuser button or countdown) — not swipe
    deferAvailableRide(rideId);
    await rideService.respondOffer(rideId, reason);
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
  const noticeCount = dossierBanners.length + (offerNotice ? 1 : 0);
  const noticesHeight = noticesBodyHeight(noticeCount);
  const hasNotices = noticeCount > 0;

  // The offered rides, and the provisional card once it has yielded to the real one. Both the
  // sheet rule and the overlay read these, so "a card is on screen" has a single meaning.
  const deckOfferIds = useMemo(
    () => (showOfferCarousel ? availableRides.map((r) => r.id) : []),
    [showOfferCarousel, availableRides],
  );

  const visibleProvisional = useMemo(
    () => visibleProvisionalOffer(provisionalOffer, deckOfferIds, activeRide?.id ?? null),
    [provisionalOffer, deckOfferIds, activeRide?.id],
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
      }),
    [loading, visibleProvisional, showOfferCarousel],
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

  const mapRecenterBottomOffset = useMemo(
    () => resolveMapRecenterBottomOffset(activeRide, noticesHeight),
    [activeRide, activeRide?.status, activeRide?.driver_arrived_at, noticesHeight],
  );

  // The instruction the driver is meant to be reading. Read off the same two fields the sheet
  // uses, so the bar and the sheet can never announce different stages of the same ride.
  const tripStage = useMemo(
    () =>
      resolveTripStage(
        activeRide?.status,
        Boolean(activeRide?.driver_arrived_at),
      ),
    [activeRide?.status, activeRide?.driver_arrived_at],
  );

  // Waiting at the pickup is the one stage whose sheet is taller than `nav`, so the overlays
  // above it have to clear a different height — same rule as `resolveMapRecenterBottomOffset`.
  const waitingAtPickup =
    activeRide?.status === "scheduled" && Boolean(activeRide?.driver_arrived_at);

  // The palier the sheet has *actually* settled on, reported by the sheet itself: the
  // `bottomSheetSnapLevel` above is only what the sheet is asked for, and a driver who drags it
  // settles wherever they let go. The difference is the whole point of the two props — "the trip
  // is in front of the driver" (the trip body) versus "it is below the fold" (`nav`, 14 px).
  const [sheetSettledAt, setSheetSettledAt] = useState<SheetSnapLevel | null>(null);

  // The guidance bar is an announcement now, not a fixture: it emerges when the stage changes,
  // withdraws once the driver pulls away, and returns after the driver has sat still long enough.
  // `tripGuidancePeek` holds the rule, including why the movement signal is route progress and
  // not the location's speed, and why a stop can only be seen as the absence of new progress.
  const [guidancePeek, observeGuidancePeek] = useReducer(
    guidancePeekReducer,
    INITIAL_GUIDANCE_PEEK,
  );
  const remainingMeters = navProgress?.distanceMeters ?? null;

  // The latest trip facts, for the heartbeat to read. Assigned during render, like the other
  // refs in this codebase.
  const guidanceFactsRef = useRef({ stage: tripStage, remainingMeters });
  guidanceFactsRef.current = { stage: tripStage, remainingMeters };

  useEffect(() => {
    observeGuidancePeek({ stage: tripStage, remainingMeters, nowMs: Date.now() });
  }, [tripStage, remainingMeters]);

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
    !mapInOfferMode && guidancePeekVisible(guidancePeek, tripVisibleInSheet);

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

  if (loading) {
    return (
      <View
        className="flex-1 justify-center items-center"
        style={{ backgroundColor: "transparent" }}
      >
        <ActivityIndicator size="large" color="#10b981" />
        {/* The boot no longer stands between the driver and the ride they just tapped. */}
        {offerCarouselElement}
      </View>
    );
  }

  return (
    <AnimatedPage instant={notificationArrival}>
      <View
        ref={mapHostViewRef}
        style={{ flex: 1, backgroundColor: "#e8eef4", zIndex: -1 }}
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
            idleRecenterMs={8000}
            onFollowPausedChange={setMapFollowPaused}
            resumeFollowRef={resumeMapFollowRef}
            mapControllerRef={mapControllerRef}
            routeFitPaddingBottom={mapRouteFitPaddingBottom(activeRide)}
            routeFitPadding={
              mapInOfferMode ? offerFitPadding : undefined
            }
            onLocationUpdate={onLocationUpdate}
            onRouteReady={handleRouteReady}
            onMapReady={handleMapReady}
          />

        <MapRecenterButton
          visible={mapFollowPaused && !mapInOfferMode}
          bottom={Math.max(24, mapRecenterBottomOffset + CONTROL_BASE_OFFSET)}
          navigationMode={!!activeRide}
          aboveGuidanceBar={guidanceVisible}
          onPress={() => resumeMapFollowRef.current?.()}
        />

        <VGpsLoader
          visible={showMapLoader && !mapInOfferMode}
          hint={mapLoaderHint(mapReady, hasGpsFix)}
        />

        {/* The instruction for this stage of the trip, told as an announcement. Deliberately
            outside the sheet: the sheet rests at `nav` while a ride is driven, which is 14 px of
            body, and the sentence the driver needs was living in there. It stays mounted for the
            whole stage so it can retract into the sheet instead of blinking out — `visible` is
            what moves. */}
        {tripStage && !mapInOfferMode ? (
          <TripGuidanceBar
            stage={tripStage}
            aboveTripSheet={waitingAtPickup}
            visible={guidanceVisible}
          />
        ) : null}

        {shouldShowTripNavigationHud(activeRide, navProgress) && navProgress ? (
          <>
            <TripManeuverHud progress={navProgress} />
            <TripArrivalHud
              progress={navProgress}
              aboveTripSheet={waitingAtPickup}
              aboveGuidanceBar={guidanceVisible}
            />
          </>
        ) : null}

        {offerCarouselElement}

        {/* Content Overlay — zIndex 40, above offer stack (30) when raised */}
        <BottomSheet
          snapLevel={bottomSheetSnapLevel}
          allowedSnaps={bottomSheetAllowedSnaps}
          noticesHeight={noticesHeight}
          collapseToken={offerToken}
          onSettle={setSheetSettledAt}
        >
          <OnlineStatusRow
            duty={resolveDriverDuty(isOnline, activeRide)}
            isOnline={isOnline}
            onToggle={handleToggleOnline}
            pushStatus={pushRegisterStatus}
          />
          <DriverStatusBanner
            banners={visibleDossierBanners}
            overflowCount={overflowCount}
            rejectedDocs={rejectedDocs}
            expiredTypes={expiredTypes}
            onOpenProfile={() => router.push("/(auth)/profile-setup")}
            onDismissValidated={() => setJustValidated(false)}
          />
          {offerNotice ? (
            <OfferNoticeCard
              notice={offerNotice}
              onDismiss={() => setOfferNotice(null)}
              onOpenProfile={() => router.push("/(auth)/profile-setup")}
              onOpenRides={() => router.push("/(tabs)/rides")}
            />
          ) : null}
          <DriverHomeSheetBody
            activeRide={activeRide}
            availableRide={availableRide}
            deferredRides={deferredRides}
            stats={stats}
            tripActions={tripActions}
            onOpenActiveRide={() => router.push("/(tabs)/rides")}
            onPromoteDeferred={promoteDeferredRide}
          />
        </BottomSheet>
      </View>
    </AnimatedPage>
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
}: Readonly<{
  activeRide: Ride | null;
  availableRide: Ride | null;
  deferredRides: Ride[];
  stats: DriverStats;
  tripActions: ReturnType<typeof useActiveTripActions>;
  onOpenActiveRide: () => void;
  onPromoteDeferred: (rideId: string) => void;
}>) {
  const pickupDest = tripActions.pickupDest();
  const dropoffDest = tripActions.dropoffDest();
  const showActiveTrip = Boolean(activeRide && pickupDest && dropoffDest);

  return (
    <>
      <View
        className="mb-5"
        style={{
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: "rgba(255,255,255,0.1)",
          paddingTop: 12,
          marginTop: 4,
        }}
      >
        {!activeRide ? (
          <Text
            className="text-sm font-semibold mb-3"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            COURSES DISPONIBLES
          </Text>
        ) : null}
        {showActiveTrip && activeRide && pickupDest && dropoffDest ? (
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
        ) : (
          <DashboardRidePreview
            activeRide={null}
            availableRide={availableRide}
            deferredRides={deferredRides.filter((r) => isRideStillOfferable(r))}
            contentInset={24}
            onOpenActiveRide={onOpenActiveRide}
            onPromoteDeferred={onPromoteDeferred}
          />
        )}
      </View>
      {!activeRide ? <DriverDayStatsRow stats={stats} /> : null}
    </>
  );
}

function DriverDayStatsRow({ stats }: Readonly<{ stats: DriverStats }>) {
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
          JOURNÉE
        </Text>
        <Text className="text-2xl font-black mt-1" style={{ color: "#fff" }}>
          €{Number(stats.todayEarnings).toFixed(2)}
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
          COURSES
        </Text>
        <Text className="text-2xl font-black mt-1" style={{ color: "#fff" }}>
          {stats.todayRides}
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
      <Switch
        value={isOnline}
        onValueChange={onToggle}
        trackColor={{
          false: "rgba(255,255,255,0.18)",
          true: "rgba(16,185,129,0.55)",
        }}
        thumbColor={isOnline ? "#10b981" : "#f4f4f5"}
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
}: Readonly<{
  ride: Ride;
  cardWidth: number;
  isLast: boolean;
  gap: number;
  onPromote: (rideId: string) => void;
}>) {
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
    <Pressable
      onPress={() => onPromote(ride.id)}
      style={{ width: cardWidth, marginRight: isLast ? 0 : gap }}
    >
      <View
        style={{
          padding: 14,
          borderRadius: 14,
          backgroundColor: "rgba(255,255,255,0.04)",
          borderWidth: 1,
          borderColor: "rgba(251, 191, 36, 0.22)",
        }}
      >
        <View className="flex-row justify-between items-start mb-3">
          <View
            className="px-2 py-0.5 rounded"
            style={{
              backgroundColor: isOverdue
                ? "rgba(251, 113, 133, 0.2)"
                : "rgba(251, 191, 36, 0.2)",
            }}
          >
            {showMatchingFlame ? (
              <MaterialCommunityIcons
                name="fire"
                size={12}
                color={isOverdue ? "#fb7185" : "#fbbf24"}
                accessibilityLabel="En recherche"
              />
            ) : (
              <Text
                className="text-[10px] font-bold tracking-wide"
                style={{ color: isOverdue ? "#fb7185" : "#fbbf24" }}
              >
                {statusLabel}
              </Text>
            )}
          </View>
          <View className="items-end">
            <Text className="text-white text-xl font-bold">{priceLabel}</Text>
            {incentive > 0 ? (
              <View className="mt-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5">
                <Text className="text-amber-300 text-[10px] font-bold">
                  Bonus +{incentive.toFixed(0)}€
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {pickupWhen ? (
          <View
            className="flex-row items-center mb-2.5"
            style={{ gap: 6 }}
          >
            <Feather name="clock" size={13} color="#fbbf24" />
            <Text className="text-amber-200 text-xs font-semibold">
              {pickupWhen}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 8, marginBottom: 10 }}>
          <View className="flex-row items-start" style={{ gap: 8 }}>
            <Feather
              name="map-pin"
              size={14}
              color="#f59e0b"
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
              color="#34d399"
              style={{ marginTop: 2 }}
            />
            <Text className="text-neutral-300 text-sm flex-1" numberOfLines={2}>
              {ride.dropoff_address}
            </Text>
          </View>
        </View>

        <RideOfferExtras
          variant="dark"
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
          <Text className="text-emerald-400 text-xs font-semibold">
            Voir l’offre
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function DashboardRidePreview({
  activeRide,
  availableRide,
  deferredRides,
  contentInset = 24,
  onOpenActiveRide,
  onPromoteDeferred,
}: Readonly<{
  activeRide: Ride | null;
  availableRide: Ride | null;
  deferredRides: Ride[];
  contentInset?: number;
  onOpenActiveRide: () => void;
  onPromoteDeferred: (rideId: string) => void;
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
              <Feather name="clock" size={13} color="#6ee7b7" />
              <Text className="text-emerald-200 text-xs font-semibold">
                {formatPickupDateTime(activeRide.pickup_time)}
              </Text>
            </View>
          ) : null}
          <View style={{ gap: 8, marginBottom: 10 }}>
            <View className="flex-row items-start" style={{ gap: 8 }}>
              <Feather
                name="map-pin"
                size={14}
                color="#f59e0b"
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
                color="#34d399"
                style={{ marginTop: 2 }}
              />
              <Text className="text-neutral-300 text-sm flex-1" numberOfLines={2}>
                {activeRide.dropoff_address}
              </Text>
            </View>
          </View>
          <RideOfferExtras
            variant="dark"
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
              <Text className="text-emerald-400 text-xs font-semibold mr-1">
                Détails
              </Text>
              <Feather name="chevron-right" size={14} color="#34d399" />
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
