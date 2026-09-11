import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Switch,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Feather } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useDriverStore, Ride, canPresentRideOffer, type DriverStats, type OfferGateState } from "../../src/lib/stores/driverStore";
import { hydratePendingOffers } from "../../src/lib/utils/offerHydrate";
import { resolveDriverDuty, onlineStatusCopyKeys, shouldForceOnlineOnAssignedHydrate, canDriverGoOnline, type DriverDuty } from "../../src/lib/utils/driverDuty";
import { createDossierStatusSync, decideOnlineToggle } from "../../src/lib/utils/dossierStatusSync";
import { resolvePendingRideRealtimeUpdate } from "../../src/lib/utils/pendingRideRealtime";
import { useDriverFolderStore } from "../../src/lib/stores/driverFolderStore";
import { normalizeFolderStatus } from "../../src/lib/folderStatus";
import { useDriverLocation } from "../../src/hooks/useDriverLocation";
import { AnimatedPage } from "../../src/components/AnimatedPage";
import { BottomSheet, type SheetSnapLevel, NAV_SHEET_VISIBLE_H, tripSheetVisibleHeight } from "../../src/components/BottomSheet";
import { OfferRideCarousel } from "../../src/components/OfferRideCarousel";
import { RideOfferExtras } from "../../src/components/RideOfferExtras";
import { VTCMap } from "../../src/map";
import type { MapControllerRef, NavManeuverInfo } from "../../src/map/types";
import { rideService } from "../../src/services/rideService";
import { setDriverOffline } from "../../src/lib/services/locationService";
import { ActiveTripSheet } from "../../src/components/ActiveTripSheet";
import { TripManeuverHud } from "../../src/components/TripManeuverHud";
import { TripArrivalHud } from "../../src/components/TripArrivalHud";
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
} from "../../src/lib/utils/ridePickup";
import { RidePriceBonus } from "../../src/components/RidePriceBonus";
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

function resolveDriverHomeSnapLevel(input: {
  activeRide: { status: string; driver_arrived_at?: string | null } | null;
  availableRidesCount: number;
  availableRide: unknown;
  offerableDeferredCount: number;
  hasDossierAlert: boolean;
}): SheetSnapLevel {
  const {
    activeRide,
    availableRidesCount,
    availableRide,
    offerableDeferredCount,
    hasDossierAlert,
  } = input;

  if (activeRide) {
    const waitingAtPickup =
      activeRide.status === "scheduled" &&
      Boolean(activeRide.driver_arrived_at);
    return waitingAtPickup ? "trip" : "nav";
  }
  // Overlay offer cards sit above the nav palier — notices stay reachable by drag.
  if (availableRidesCount > 0) return "nav";
  if (hasDossierAlert) return "notices";
  if (availableRide || offerableDeferredCount > 0) return "rides";
  return "peek";
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
    myDriverId: string | null;
    acceptingRideIds: ReadonlySet<string>;
    onUnavailable: () => void;
  },
) {
  const {
    availableRide: current,
    deferredRides: deferred,
    availableRides: queued,
    activeRide,
  } = useDriverStore.getState();

  const decision = resolvePendingRideRealtimeUpdate(updated, {
    availableRide: current,
    availableRides: queued,
    deferredRides: deferred,
    activeRide,
    myDriverId: actions.myDriverId,
    acceptingRideIds: actions.acceptingRideIds,
  });

  if (decision.action === "present") {
    void actions.presentOffer(updated);
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
  presentOffer,
  removeAvailableRide,
  clearAvailableRide,
  patchTrackedRide,
  getOfferGateState,
  myDriverId,
  acceptingRideIdsRef,
  onUnavailable,
}: {
  canReceiveOffers: boolean;
  presentOffer: (ride: Ride) => Promise<void>;
  removeAvailableRide: (rideId: string) => void;
  clearAvailableRide: () => void;
  patchTrackedRide: (ride: Ride) => void;
  getOfferGateState: () => OfferGateState;
  myDriverId: string | null;
  acceptingRideIdsRef: { current: Set<string> };
  onUnavailable: () => void;
}) {
  useEffect(() => {
    let channel: RealtimeChannel | undefined;

    if (!canReceiveOffers) {
      clearAvailableRide();
      return;
    }

    const fetchExistingRide = async () => {
      const { activeRide: currentActive, addAvailableRide } =
        useDriverStore.getState();
      if (currentActive) return;

      const iso = new Date().toISOString();
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .in("status", ["pending", "delayed"])
        .is("matching_paused_at", null)
        .or(`matching_deadline_at.gt.${iso},matching_deadline_at.is.null`)
        .order("created_at", { ascending: true })
        .limit(20);

      if (error || !data?.length) return;
      const pending = data as Ride[];
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
      await Promise.all(newStackIds.map((id) => rideService.recordOffer(id)));
    };

    void fetchExistingRide();

    channel = supabase
      .channel("public:rides")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rides",
        },
        (payload) => {
          const ride = payload.new as Ride;
          if (!isRideStillOfferable(ride)) return;
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
          handlePendingRideRealtimeUpdate(payload.new as Ride, {
            presentOffer,
            removeAvailableRide,
            patchTrackedRide,
            myDriverId,
            acceptingRideIds: acceptingRideIdsRef.current,
            onUnavailable,
          });
        },
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [
    canReceiveOffers,
    clearAvailableRide,
    presentOffer,
    removeAvailableRide,
    patchTrackedRide,
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

async function acceptTrackedRide(args: {
  rideId: string;
  driverStatus: string | null;
  availableRides: Ride[];
  deferredRides: Ride[];
  availableRide: Ride | null;
  setActiveRide: (ride: Ride | null) => void;
  removeAvailableRide: (rideId: string) => void;
  suppressRide: (rideId: string) => void;
  acceptingRideIds: Set<string>;
}): Promise<void> {
  const ride =
    args.availableRides.find((r) => r.id === args.rideId) ||
    args.deferredRides.find((r) => r.id === args.rideId) ||
    (args.availableRide?.id === args.rideId ? args.availableRide : null);
  if (!ride) return;
  if (args.driverStatus !== "active") {
    Alert.alert("Error", "Only active drivers can accept rides");
    return;
  }

  args.acceptingRideIds.add(args.rideId);
  try {
    const result = await rideService.acceptRide(args.rideId);
    if (!result.success) {
      Alert.alert("Error", result.error || "Failed to accept ride");
      args.suppressRide(args.rideId);
      return;
    }

    args.setActiveRide({ ...ride, status: "scheduled", driver_arrived_at: null });
    args.removeAvailableRide(args.rideId);
    useDriverStore.setState((s) => ({
      deferredRides: s.deferredRides.filter((r) => r.id !== args.rideId),
    }));
  } finally {
    args.acceptingRideIds.delete(args.rideId);
  }
}

function resolveBottomSheetAllowedSnaps(
  activeRide: Ride | null,
  availableRidesCount: number,
  hasDossierAlert: boolean,
): readonly SheetSnapLevel[] {
  const withNotices = (
    snaps: SheetSnapLevel[],
  ): readonly SheetSnapLevel[] =>
    hasDossierAlert ? snaps : snaps.filter((s) => s !== "notices");

  if (activeRide) {
    return withNotices(["nav", "notices", "trip"]);
  }
  // Overlay cards: keep default snap at `nav` but still allow drag to sheet sections.
  if (availableRidesCount > 0) {
    return withNotices(["nav", "online", "notices", "rides", "stats"]);
  }
  return withNotices(["peek", "online", "notices", "rides", "stats"]);
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
  store.setActiveRide(assigned as Ride);
  if (
    canDriverGoOnline(driverStatus) &&
    shouldForceOnlineOnAssignedHydrate(alreadyHydratedRef.current, true)
  ) {
    store.setIsOnline(true);
  }
  alreadyHydratedRef.current = true;
}

async function toggleDriverOnlineState(args: {
  isOnline: boolean;
  localStatus: string | null;
  fetchFreshStatus: () => Promise<string | null>;
  applyFreshStatus: (status: string) => Promise<void>;
  setIsOnline: (online: boolean) => void;
  setJustValidated: (value: boolean) => void;
}) {
  const decision = await decideOnlineToggle({
    isOnline: args.isOnline,
    localStatus: args.localStatus,
    fetchFreshStatus: args.fetchFreshStatus,
  });
  if (decision.action === "refuse") {
    Alert.alert(
      "Indisponible",
      "Votre dossier doit être actif pour passer en ligne.",
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
  args.setIsOnline(true);
  args.setJustValidated(false);
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

      const dossier = await refreshDossierMeta(id);
      if (!options?.silent) {
        notifyDriverStatusTransition({
          previous,
          nextStatus,
          dossierIsComplete: dossier?.is_complete,
          setJustValidated,
        });
      }

      if (!canDriverGoOnline(nextStatus)) {
        useDriverStore.getState().setIsOnline(false);
        void setDriverOffline();
      }
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
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      const { data: driver } = await supabase
        .from("drivers")
        .select("id, status, first_name, last_name")
        .eq("user_id", user.id)
        .single();

      if (!driver) {
        router.replace("/(auth)/profile-setup");
        return;
      }

      setDriverId(driver.id);
      const applyThisFetch =
        dossierStatusSyncRef.current.shouldApplyFetch(startedAt);
      if (applyThisFetch) {
        await applyDriverStatus(driver.status, driver.id);
      }
      await hydrateAssignedRideFromServer(
        driver.id,
        assignedHydratedRef,
        applyThisFetch ? driver.status : driverStatusRef.current,
      );
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [applyDriverStatus, router]);

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driverId, applyDriverStatus]);

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

export default function DashboardScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const acceptingRideIdsRef = useRef(new Set<string>());
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
    patchTrackedRide,
    clearAvailableRide,
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
      patchTrackedRide: s.patchTrackedRide,
      clearAvailableRide: s.clearAvailableRide,
      activeRide: s.activeRide,
      setActiveRide: s.setActiveRide,
    })),
  );
  const currentLocation = useDriverStore((s) => s.currentLocation);
  useDriverLocation(isOnline || Boolean(activeRide));

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

  const canReceiveOffers = isOnline && driverStatus === "active" && !activeRide;

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
    canReceiveOffers,
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
      if (!canReceiveOffers) return;
      if (!isRideStillOfferable(ride)) return;
      const gate = getOfferGateState();
      if (!canPresentRideOffer(ride.id, gate)) return;
      addAvailableRide(ride);
      await rideService.recordOffer(ride.id);
    },
    [addAvailableRide, canReceiveOffers, getOfferGateState],
  );

  const notifyRideUnavailable = useCallback(() => {
    Alert.alert(t("common.info"), t("ride.noLongerAvailable"));
  }, [t]);

  usePendingRideChannel({
    canReceiveOffers,
    presentOffer,
    removeAvailableRide,
    clearAvailableRide,
    patchTrackedRide,
    getOfferGateState,
    myDriverId: driverId,
    acceptingRideIdsRef,
    onUnavailable: notifyRideUnavailable,
  });

  const handleAcceptRide = async (rideId: string) => {
    await acceptTrackedRide({
      rideId,
      driverStatus,
      availableRides,
      deferredRides,
      availableRide,
      setActiveRide,
      removeAvailableRide,
      suppressRide,
      acceptingRideIds: acceptingRideIdsRef.current,
    });
  };

  const handleDeclineRide = async (
    rideId: string,
    reason: "declined" | "timeout" = "declined",
  ) => {
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
  const noticesHeight = noticesBodyHeight(dossierBanners.length);
  const hasDossierAlert = dossierBanners.length > 0;

  const bottomSheetSnapLevel = useMemo(() => {
    const offerableDeferred = deferredRides.filter((r) =>
      isRideStillOfferable(r),
    );
    return resolveDriverHomeSnapLevel({
      activeRide,
      availableRidesCount: availableRides.length,
      availableRide,
      offerableDeferredCount: offerableDeferred.length,
      hasDossierAlert,
    });
  }, [
    hasDossierAlert,
    availableRide,
    availableRides.length,
    deferredRides,
    activeRide,
  ]);

  const bottomSheetAllowedSnaps = useMemo(
    () =>
      resolveBottomSheetAllowedSnaps(
        activeRide,
        availableRides.length,
        hasDossierAlert,
      ),
    [activeRide, availableRides.length, hasDossierAlert],
  );

  const mapRecenterBottomOffset = useMemo(
    () => resolveMapRecenterBottomOffset(activeRide, noticesHeight),
    [activeRide, activeRide?.status, activeRide?.driver_arrived_at, noticesHeight],
  );

  if (loading) {
    return (
      <View
        className="flex-1 justify-center items-center"
        style={{ backgroundColor: "transparent" }}
      >
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <AnimatedPage>
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
          bottom={Math.max(24, mapRecenterBottomOffset + 12)}
          navigationMode={!!activeRide}
          onPress={() => resumeMapFollowRef.current?.()}
        />

        <VGpsLoader
          visible={showMapLoader && !mapInOfferMode}
          hint={mapLoaderHint(mapReady, hasGpsFix)}
        />

        {shouldShowTripNavigationHud(activeRide, navProgress) && navProgress ? (
          <>
            <TripManeuverHud progress={navProgress} />
            <TripArrivalHud progress={navProgress} />
          </>
        ) : null}

        {showOfferCarousel ? (
          <OfferRideCarousel
            rides={availableRides}
            chromeVisible
            onActiveIndexChange={setActiveOfferIndex}
            onOverlayHeightChange={setOfferOverlayBand}
            onAcceptRide={(rideId) => {
              void handleAcceptRide(rideId);
            }}
            onDeclineRide={(rideId, reason) => {
              void handleDeclineRide(rideId, reason ?? "declined");
            }}
          />
        ) : null}

        {/* Content Overlay — zIndex 40, above offer stack (30) when raised */}
        <BottomSheet
          snapLevel={bottomSheetSnapLevel}
          allowedSnaps={bottomSheetAllowedSnaps}
          noticesHeight={noticesHeight}
        >
          <OnlineStatusRow
            duty={resolveDriverDuty(isOnline, activeRide)}
            isOnline={isOnline}
            onToggle={handleToggleOnline}
          />
          <DriverStatusBanner
            banners={visibleDossierBanners}
            overflowCount={overflowCount}
            rejectedDocs={rejectedDocs}
            expiredTypes={expiredTypes}
            onOpenProfile={() => router.push("/(auth)/profile-setup")}
            onDismissValidated={() => setJustValidated(false)}
          />
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
      <View className="mb-5">
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
}: Readonly<{
  duty: DriverDuty;
  isOnline: boolean;
  onToggle: () => void;
}>) {
  const { t } = useTranslation();
  const { titleKey, subtitleKey } = onlineStatusCopyKeys(duty, isOnline);
  return (
    <View
      style={{
        marginBottom: 12,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(255,255,255,0.1)",
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
            <Text
              className="text-[10px] font-bold tracking-wide"
              style={{ color: isOverdue ? "#fb7185" : "#fbbf24" }}
            >
              {statusLabel}
            </Text>
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
