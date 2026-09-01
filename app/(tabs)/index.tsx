import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { useDriverStore, Ride, canPresentRideOffer, pickNextPendingRide, type DriverStats } from "../../src/lib/stores/driverStore";
import { useDriverFolderStore } from "../../src/lib/stores/driverFolderStore";
import { useDriverLocation } from "../../src/hooks/useDriverLocation";
import { AnimatedPage } from "../../src/components/AnimatedPage";
import { BottomSheet, type SheetSnapLevel, NAV_SHEET_VISIBLE_H, TRIP_SHEET_VISIBLE_H } from "../../src/components/BottomSheet";
import { RideStackModal } from "../../src/components/RideStackModal";
import { RideOfferExtras } from "../../src/components/RideOfferExtras";
import { VTCMap } from "../../src/map";
import { rideService } from "../../src/services/rideService";
import { ActiveTripSheet } from "../../src/components/ActiveTripSheet";
import { TripManeuverHud } from "../../src/components/TripManeuverHud";
import { TripArrivalHud } from "../../src/components/TripArrivalHud";
import { VGpsLoader } from "../../src/components/VGpsLoader";
import { MapRecenterButton } from "../../src/components/MapRecenterButton";
import {
  optimisticEtaMinutes,
  type NavProgress,
} from "../../src/lib/utils/navProgress";
import { useActiveTripActions } from "../../src/hooks/useActiveTripActions";
import {
  getDossierStatus,
  resolveDossierBanner,
  type ExpiringDocument,
} from "../../src/lib/services/dossierService";
import { translateDocumentType } from "../../src/lib/documentTypeLabels";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import { computeOfferMapFitPadding } from "../../src/lib/utils/offerMapFit";
import { resolveTripMapPoints } from "../../src/lib/utils/tripMapPoints";

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

function hasDriverDossierAlert(input: {
  justValidated: boolean;
  expiredTypes: unknown[];
  expiringDocs: unknown[];
  rejectedDocs: unknown[];
  driverStatus: string | null;
  dossierIsComplete: boolean | null;
}): boolean {
  const {
    justValidated,
    expiredTypes,
    expiringDocs,
    rejectedDocs,
    driverStatus,
    dossierIsComplete,
  } = input;
  if (justValidated) return true;
  if (expiredTypes.length > 0 || expiringDocs.length > 0 || rejectedDocs.length > 0) {
    return true;
  }
  if (
    driverStatus === "draft" ||
    driverStatus === "incomplete" ||
    driverStatus === "pending_review" ||
    driverStatus === "rejected"
  ) {
    return true;
  }
  return driverStatus === "active" && dossierIsComplete === false;
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

  if (!activeRide && availableRidesCount > 0) return "nav";
  // Dossier banner sits at the top of the sheet — stats is enough; notices is almost fullscreen.
  if (hasDossierAlert) return "stats";
  if (activeRide) {
    const waitingAtPickup =
      activeRide.status === "scheduled" &&
      Boolean(activeRide.driver_arrived_at);
    return waitingAtPickup ? "trip" : "nav";
  }
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

type FolderNotifier = (n: {
  type: "success" | "warning" | "info";
  title: string;
  message: string;
}) => void;

/** Side-effects when driver.status changes (validation / reject / cancel review). */
function notifyDriverStatusTransition(input: {
  previous: string | null;
  nextStatus: string;
  dossierIsComplete: boolean | null | undefined;
  fromRealtime?: boolean;
  setJustValidated: (v: boolean) => void;
  addNotification: FolderNotifier;
}): void {
  const {
    previous,
    nextStatus,
    dossierIsComplete,
    fromRealtime,
    setJustValidated,
    addNotification,
  } = input;

  if (
    isDriverBecameActive(previous, nextStatus) &&
    dossierIsComplete !== false
  ) {
    setJustValidated(true);
    addNotification({
      type: "success",
      title: "Dossier validé",
      message:
        "Votre dossier a été validé. Passez en ligne pour recevoir et accepter des courses.",
    });
    useDriverFolderStore.setState({
      validatedAt: new Date().toISOString(),
    });
    if (fromRealtime) {
      Alert.alert(
        "Dossier validé",
        "Félicitations ! Passez en ligne (On) pour voir les courses disponibles.",
      );
    }
    return;
  }

  if (nextStatus === "rejected" && previous && REVIEW_STATUSES.has(previous)) {
    setJustValidated(false);
    addNotification({
      type: "warning",
      title: "Dossier rejeté",
      message: "Votre dossier a été rejeté. Ouvrez votre profil pour corriger.",
    });
    return;
  }

  if (nextStatus === "draft" && previous && REVIEW_STATUSES.has(previous)) {
    setJustValidated(false);
    addNotification({
      type: "info",
      title: "Demande annulée",
      message:
        "La demande de validation a été annulée. Vous pouvez modifier votre dossier.",
    });
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
  },
) {
  const {
    availableRide: current,
    deferredRides: deferred,
    availableRides: queued,
  } = useDriverStore.getState();
  const isTracked =
    current?.id === updated.id ||
    deferred.some((r) => r.id === updated.id) ||
    queued.some((r) => r.id === updated.id);

  if (isRideStillOfferable(updated)) {
    if (isTracked) {
      actions.patchTrackedRide(updated);
      return;
    }
    void actions.presentOffer(updated);
    return;
  }

  if (current?.id === updated.id) {
    actions.removeAvailableRide(updated.id);
    Alert.alert("Info", "The ride is no longer available.");
    return;
  }
  if (deferred.some((r) => r.id === updated.id)) {
    useDriverStore.setState((s) => ({
      deferredRides: s.deferredRides.filter((r) => r.id !== updated.id),
    }));
    return;
  }
  if (queued.some((r) => r.id === updated.id)) {
    actions.removeAvailableRide(updated.id);
  }
}

function usePendingRideChannel({
  canReceiveOffers,
  isOnline,
  presentOffer,
  removeAvailableRide,
  setAvailableRide,
  patchTrackedRide,
  getOfferGateState,
}: {
  canReceiveOffers: boolean;
  isOnline: boolean;
  presentOffer: (ride: Ride) => Promise<void>;
  removeAvailableRide: (rideId: string) => void;
  setAvailableRide: (ride: Ride | null) => void;
  patchTrackedRide: (ride: Ride) => void;
  getOfferGateState: () => {
    suppressedRideIds: string[];
    deferredRides: Ride[];
    availableRides: Ride[];
  };
}) {
  useEffect(() => {
    let channel: RealtimeChannel | undefined;

    if (!canReceiveOffers) {
      if (!isOnline) setAvailableRide(null);
      return;
    }

    const fetchExistingRide = async () => {
      const {
        availableRide: currentOffer,
        activeRide: currentActive,
        availableRides: queued,
      } = useDriverStore.getState();
      if (currentOffer || currentActive || queued.length > 0) return;

      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .in("status", ["pending", "delayed"])
        .is("matching_paused_at", null)
        .gt("matching_deadline_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(20);

      if (error || !data?.length) return;
      const pending = data as Ride[];
      const gate = getOfferGateState();
      const next = pickNextPendingRide(pending, gate);
      if (next) await presentOffer(next);

      const gateAfter = getOfferGateState();
      const rest = pending.filter(
        (ride) =>
          ride.id !== next?.id &&
          isRideStillOfferable(ride) &&
          canPresentRideOffer(ride.id, gateAfter),
      );
      if (rest.length > 0) {
        useDriverStore.getState().seedDeferredRides(rest);
      }
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
          });
        },
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [
    canReceiveOffers,
    isOnline,
    presentOffer,
    removeAvailableRide,
    setAvailableRide,
    patchTrackedRide,
    getOfferGateState,
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
}

function resolveBottomSheetAllowedSnaps(
  activeRide: Ride | null,
  availableRidesCount: number,
): readonly SheetSnapLevel[] {
  if (!activeRide && availableRidesCount > 0) return ["nav"];
  if (activeRide) return ["nav", "trip", "notices"];
  return ["peek", "stats", "rides", "notices"];
}

function resolveMapRecenterBottomOffset(activeRide: Ride | null): number {
  if (!activeRide) return 56;
  const waitingAtPickup =
    activeRide.status === "scheduled" && Boolean(activeRide.driver_arrived_at);
  return waitingAtPickup ? TRIP_SHEET_VISIBLE_H : NAV_SHEET_VISIBLE_H;
}

function toggleDriverOnlineState(args: {
  driverStatus: string | null;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  setJustValidated: (value: boolean) => void;
}) {
  if (args.driverStatus !== "active" && !args.isOnline) {
    Alert.alert(
      "Unavailable",
      "Your dossier must be active before going online.",
    );
    return;
  }
  const next = !args.isOnline;
  args.setIsOnline(next);
  if (next) args.setJustValidated(false);
}

export default function DashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [justValidated, setJustValidated] = useState(false);
  const driverStatusRef = useRef<string | null>(null);

  const {
    isOnline,
    setIsOnline,
    stats,
    availableRide,
    availableRides,
    deferredRides,
    setAvailableRide,
    addAvailableRide,
    removeAvailableRide,
    deferAvailableRide,
    suppressRide,
    promoteDeferredRide,
    patchTrackedRide,
    activeRide,
    setActiveRide,
  } = useDriverStore();
  const currentLocation = useDriverStore((s) => s.currentLocation);
  useDriverLocation(isOnline || Boolean(activeRide));

  const tripActions = useActiveTripActions();
  const [navProgress, setNavProgress] = useState<NavProgress | null>(null);
  const lastNavRpcAt = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaderTimedOut, setMapLoaderTimedOut] = useState(false);
  const [mapFollowPaused, setMapFollowPaused] = useState(false);
  const resumeMapFollowRef = useRef<(() => void) | null>(null);
  const { mapBoot, hasGpsFix, setHasGpsFix } = useMapBootSeed(currentLocation);

  const pushNavProgress = useCallback(
    (progress: NavProgress) => {
      setNavProgress(progress);
      const rideId = useDriverStore.getState().activeRide?.id;
      if (!rideId) return;
      const now = Date.now();
      if (now - lastNavRpcAt.current < 12_000) return;
      lastNavRpcAt.current = now;
      const eta = optimisticEtaMinutes(
        progress.durationSeconds,
        progress.distanceMeters,
      );
      void supabase.rpc("update_ride_nav_progress", {
        p_ride_id: rideId,
        p_eta_minutes: eta,
        p_remaining_m: Math.round(progress.distanceMeters),
      });
    },
    [],
  );

  useEffect(() => {
    if (!activeRide) {
      setNavProgress(null);
      lastNavRpcAt.current = 0;
    }
  }, [activeRide?.id]);

  useEffect(() => {
    const t = setTimeout(() => setMapLoaderTimedOut(true), 12_000);
    return () => clearTimeout(t);
  }, []);

  const showMapLoader = !mapLoaderTimedOut && (!mapBoot || !mapReady);

  const canReceiveOffers = isOnline && driverStatus === "active" && !activeRide;

  const getOfferGateState = useCallback(
    () => ({
      suppressedRideIds: useDriverStore.getState().suppressedRideIds,
      deferredRides: useDriverStore.getState().deferredRides,
      availableRides: useDriverStore.getState().availableRides,
    }),
    [],
  );

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

  usePendingRideChannel({
    canReceiveOffers,
    isOnline,
    presentOffer,
    removeAvailableRide,
    setAvailableRide,
    patchTrackedRide,
    getOfferGateState,
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
    });
  };

  const handleDeclineRide = async (
    rideId: string,
    reason: "declined" | "timeout" = "declined",
  ) => {
    // Soft refuse / timeout: back to bottomsheet queue; next available becomes offer
    deferAvailableRide(rideId);
    await rideService.respondOffer(rideId, reason);
  };

  const setFolderStatus = useDriverFolderStore((s) => s.setStatus);
  const addNotification = useDriverFolderStore((s) => s.addNotification);
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
    async (nextStatus: string, id: string, options?: { fromRealtime?: boolean }) => {
      const previous = driverStatusRef.current;
      driverStatusRef.current = nextStatus;
      setDriverStatus(nextStatus);
      setFolderStatus(nextStatus);

      const dossier = await refreshDossierMeta(id);
      notifyDriverStatusTransition({
        previous,
        nextStatus,
        dossierIsComplete: dossier?.is_complete,
        fromRealtime: options?.fromRealtime,
        setJustValidated,
        addNotification,
      });
    },
    [addNotification, refreshDossierMeta, setFolderStatus],
  );

  const fetchDriverStatus = useCallback(async () => {
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

      if (driver) {
        setDriverId(driver.id);
        await applyDriverStatus(driver.status, driver.id);
      } else {
        router.replace("/(auth)/profile-setup");
      }
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

  // Live updates when admin validates / rejects / cancels the dossier.
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
          void applyDriverStatus(row.status, row.id, { fromRealtime: true });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driverId, applyDriverStatus]);

  const handleToggleOnline = () => {
    toggleDriverOnlineState({
      driverStatus,
      isOnline,
      setIsOnline,
      setJustValidated,
    });
  };

  const bottomSheetSnapLevel = useMemo(() => {
    const offerableDeferred = deferredRides.filter((r) =>
      isRideStillOfferable(r),
    );
    return resolveDriverHomeSnapLevel({
      activeRide,
      availableRidesCount: availableRides.length,
      availableRide,
      offerableDeferredCount: offerableDeferred.length,
      hasDossierAlert: hasDriverDossierAlert({
        justValidated,
        expiredTypes,
        expiringDocs,
        rejectedDocs,
        driverStatus,
        dossierIsComplete,
      }),
    });
  }, [
    driverStatus,
    dossierIsComplete,
    justValidated,
    availableRide,
    availableRides.length,
    deferredRides,
    activeRide,
    rejectedDocs,
    expiredTypes,
    expiringDocs,
  ]);

  const bottomSheetAllowedSnaps = useMemo(
    () => resolveBottomSheetAllowedSnaps(activeRide, availableRides.length),
    [activeRide, availableRides.length],
  );

  const mapRecenterBottomOffset = useMemo(
    () => resolveMapRecenterBottomOffset(activeRide),
    [activeRide, activeRide?.status, activeRide?.driver_arrived_at],
  );

  // Fullscreen offer uses the home map (no second WebView)
  const offerRide = !activeRide && availableRides.length > 0
    ? availableRides[0]
    : null;

  const [offerApproach, setOfferApproach] = useState<
    { lat: number; lng: number } | undefined
  >();
  const [offerChromeVisible, setOfferChromeVisible] = useState(false);
  const offerChromeRevealedRef = useRef(false);
  const [offerFitPadding, setOfferFitPadding] = useState<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null>(null);

  const onOfferMapViewportLayout = useCallback(
    (hole: { x: number; y: number; w: number; h: number }) => {
      const { width: sw, height: sh } = Dimensions.get("window");
      setOfferFitPadding(computeOfferMapFitPadding(hole, { width: sw, height: sh }));
    },
    [],
  );

  const revealOfferChrome = useCallback(() => {
    if (offerChromeRevealedRef.current) return;
    offerChromeRevealedRef.current = true;
    setOfferChromeVisible(true);
  }, []);

  useEffect(() => {
    if (!offerRide?.id) {
      setOfferApproach(undefined);
      setOfferChromeVisible(false);
      offerChromeRevealedRef.current = false;
      setOfferFitPadding(null);
      return;
    }
    offerChromeRevealedRef.current = false;
    setOfferChromeVisible(false);
    setOfferFitPadding(null);
    const loc = useDriverStore.getState().currentLocation;
    setOfferApproach(
      loc
        ? {
            lat: Math.round(loc.lat * 2e3) / 2e3,
            lng: Math.round(loc.lng * 2e3) / 2e3,
          }
        : undefined,
    );
    const fallback = setTimeout(revealOfferChrome, 2800);
    return () => clearTimeout(fallback);
  }, [offerRide?.id, revealOfferChrome]);

  const tripMapPoints = useMemo(
    () =>
      resolveTripMapPoints({
        activeRide,
        offerRide,
        currentLocation,
        offerApproach,
      }),
    [activeRide, currentLocation, offerRide, offerApproach],
  );

  const mapInOfferMode = Boolean(offerRide);
  const mapShowRoute =
    Boolean(tripMapPoints.start && tripMapPoints.end) &&
    (Boolean(activeRide) || (mapInOfferMode && offerFitPadding != null));

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
      <RideStackModal
        rides={availableRides}
        chromeVisible={offerChromeVisible}
        onMapViewportLayout={onOfferMapViewportLayout}
        onAcceptRide={(rideId) => {
          void handleAcceptRide(rideId);
        }}
        onDeclineRide={(rideId, reason) => {
          void handleDeclineRide(rideId, reason ?? "declined");
        }}
      />

      <View style={{ flex: 1, backgroundColor: "#e8eef4", zIndex: -1 }}>
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
            offerOverview={mapInOfferMode}
            followUser={!mapInOfferMode}
            navigationFollow={!!activeRide}
            idleRecenterMs={8000}
            onFollowPausedChange={setMapFollowPaused}
            resumeFollowRef={resumeMapFollowRef}
            routeFitPaddingBottom={mapRouteFitPaddingBottom(activeRide)}
            routeFitPadding={
              mapInOfferMode ? offerFitPadding ?? undefined : undefined
            }
            onLocationUpdate={(coords) => {
              setHasGpsFix(true);
              useDriverStore.getState().setCurrentLocation({
                lat: coords.lat,
                lng: coords.lng,
              });
            }}
            onRouteReady={(distanceMeters, durationSeconds, nextManeuver) => {
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
            }}
            onRoutePresented={revealOfferChrome}
            onMapReady={() => {
              setMapReady(true);
            }}
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

        {/* Content Overlay */}
        <BottomSheet
          snapLevel={bottomSheetSnapLevel}
          allowedSnaps={bottomSheetAllowedSnaps}
        >
          <DriverStatusBanner
            driverStatus={driverStatus}
            isComplete={dossierIsComplete}
            justValidated={justValidated}
            rejectedDocs={rejectedDocs}
            expiredTypes={expiredTypes}
            expiringDocs={expiringDocs}
            onOpenProfile={() => router.push("/(auth)/profile-setup")}
            onDismissValidated={() => setJustValidated(false)}
          />
          <DriverHomeSheetBody
            activeRide={activeRide}
            availableRide={availableRide}
            deferredRides={deferredRides}
            stats={stats}
            tripActions={tripActions}
            isOnline={isOnline}
            onToggleOnline={handleToggleOnline}
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
  isOnline,
  onToggleOnline,
  onOpenActiveRide,
  onPromoteDeferred,
}: Readonly<{
  activeRide: Ride | null;
  availableRide: Ride | null;
  deferredRides: Ride[];
  stats: DriverStats;
  tripActions: ReturnType<typeof useActiveTripActions>;
  isOnline: boolean;
  onToggleOnline: () => void;
  onOpenActiveRide: () => void;
  onPromoteDeferred: (rideId: string) => void;
}>) {
  const pickupDest = tripActions.pickupDest();
  const dropoffDest = tripActions.dropoffDest();
  const showActiveTrip = Boolean(activeRide && pickupDest && dropoffDest);

  return (
    <>
      {!activeRide ? <DriverDayStatsRow stats={stats} /> : null}
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
      <OnlineStatusRow isOnline={isOnline} onToggle={onToggleOnline} />
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
          €{stats.todayEarnings}
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
  isOnline,
  onToggle,
}: Readonly<{
  isOnline: boolean;
  onToggle: () => void;
}>) {
  return (
    <View
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "rgba(255,255,255,0.1)",
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
          Disponible
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 12,
            marginTop: 3,
            fontWeight: "500",
          }}
        >
          {isOnline
            ? "Vous recevez des courses"
            : "Hors ligne — pas de nouvelles offres"}
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
          isOnline ? "Passer hors ligne" : "Passer en ligne"
        }
      />
    </View>
  );
}

type BannerIcon = "alert-triangle" | "file-text" | "clock" | "check-circle";

function buildBannerCopy(
  t: TFunction,
  input: {
  kind: NonNullable<ReturnType<typeof resolveDossierBanner>["kind"]>;
  expiring?: ExpiringDocument;
  expiredTypes: string[];
  rejectedDocs: Array<{ rejection_reason: string | null }>;
},
): { title: string; subtitle: string; accent: string; icon: BannerIcon } {
  switch (input.kind) {
    case "expired": {
      const labels = input.expiredTypes.map((type) =>
        translateDocumentType(t, type),
      );
      return {
        title:
          labels.length > 1
            ? "Documents expirés"
            : "Document expiré",
        subtitle: `Remplacez : ${labels.join(", ")}`,
        accent: "#fb7185",
        icon: "file-text",
      };
    }
    case "expiring": {
      const days = input.expiring?.days_remaining ?? 0;
      let title = "Rappel de validité";
      let accent = "#fbbf24";
      if (days <= 7) {
        title = "Expiration imminente";
        accent = "#fb7185";
      } else if (days <= 30) {
        title = "À renouveler bientôt";
      }
      const docLabel = translateDocumentType(
        t,
        input.expiring?.document_type ?? null,
      );
      return {
        title,
        subtitle: `${docLabel} expire dans ${days} jour(s) (${input.expiring?.expiry_date ?? ""})`,
        accent,
        icon: "clock",
      };
    }
    case "rejected":
      return {
        title:
          input.rejectedDocs.length > 1
            ? "Documents refusés"
            : "Document refusé",
        subtitle:
          input.rejectedDocs[0]?.rejection_reason ||
          "Remplacez le(s) document(s) refusé(s) pour continuer.",
        accent: "#fb7185",
        icon: "file-text",
      };
    case "pending_review":
      return {
        title: "Validation en cours",
        subtitle: "Votre profil est en cours de validation.",
        accent: "#fbbf24",
        icon: "alert-triangle",
      };
    case "validated":
      return {
        title: "Dossier validé",
        subtitle:
          "Vous pouvez désormais passer en ligne et accepter des courses.",
        accent: "#34d399",
        icon: "check-circle",
      };
    default:
      return {
        title: "Profil incomplet",
        subtitle: "Complétez votre profil pour commencer.",
        accent: "#fbbf24",
        icon: "alert-triangle",
      };
  }
}

function DriverStatusBanner({
  driverStatus,
  isComplete,
  justValidated,
  rejectedDocs,
  expiredTypes,
  expiringDocs,
  onOpenProfile,
  onDismissValidated,
}: Readonly<{
  driverStatus: string | null;
  isComplete: boolean | null;
  justValidated: boolean;
  rejectedDocs: Array<{
    document_type: string;
    rejection_reason: string | null;
  }>;
  expiredTypes: string[];
  expiringDocs: ExpiringDocument[];
  onOpenProfile: () => void;
  onDismissValidated: () => void;
}>) {
  const { t } = useTranslation();
  const banner = resolveDossierBanner({
    expiredTypes,
    expiring: expiringDocs,
    rejectedTypes: rejectedDocs.map((d) => d.document_type),
    driverStatus,
    isComplete,
    justValidated,
  });

  if (!banner.kind) return null;

  const { title, subtitle, accent, icon } = buildBannerCopy(t, {
    kind: banner.kind,
    expiring: banner.expiring,
    expiredTypes,
    rejectedDocs,
  });
  const onPress =
    banner.kind === "validated" ? onDismissValidated : onOpenProfile;

  return (
    <View className="px-6 mb-2">
      <Pressable onPress={onPress}>
        <View style={{ padding: 16 }}>
          <View className="flex-row items-center gap-3">
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: bannerAccentBackground(accent),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name={icon} size={16} color={accent} />
            </View>
            <View className="flex-1">
              <Text
                className="text-base font-bold mb-0.5"
                style={{ color: accent }}
              >
                {title}
              </Text>
              <Text
                className="text-xs font-medium"
                style={{ color: "rgba(255,255,255,0.9)" }}
              >
                {subtitle}
              </Text>
            </View>
            <Feather
              name={banner.kind === "validated" ? "x" : "chevron-right"}
              size={20}
              color={accent}
              style={{ opacity: 0.8 }}
            />
          </View>
        </View>
      </Pressable>
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
