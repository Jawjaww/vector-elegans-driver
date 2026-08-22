import { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { useDriverStore, Ride, canPresentRideOffer, pickNextPendingRide } from "../../src/lib/stores/driverStore";
import { useDriverFolderStore } from "../../src/lib/stores/driverFolderStore";
import { useDriverLocation } from "../../src/hooks/useDriverLocation";
import { AnimatedPage } from "../../src/components/AnimatedPage";
import { BottomSheet } from "../../src/components/BottomSheet";
import { RideStackModal } from "../../src/components/RideStackModal";
import { RideOfferExtras } from "../../src/components/RideOfferExtras";
import { VTCMap } from "../../src/map";
import { rideService } from "../../src/services/rideService";
import {
  getDossierStatus,
  resolveDossierBanner,
  type ExpiringDocument,
} from "../../src/lib/services/dossierService";
import {
  formatRideDistanceKm,
  formatRideDurationMin,
  formatPickupDateTime,
} from "../../src/lib/utils/rideMetrics";
import {
  isRidePickupStillOfferable,
  ridePickupExpiryCutoffIso,
  getPendingRideDisplayLabel,
} from "../../src/lib/utils/ridePickup";

function usePendingRideChannel({
  canReceiveOffers,
  isOnline,
  availableRide,
  activeRide,
  presentOffer,
  removeAvailableRide,
  setAvailableRide,
  getOfferGateState,
}: {
  canReceiveOffers: boolean;
  isOnline: boolean;
  availableRide: Ride | null;
  activeRide: Ride | null;
  presentOffer: (ride: Ride) => Promise<void>;
  removeAvailableRide: (rideId: string) => void;
  setAvailableRide: (ride: Ride | null) => void;
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
      if (availableRide || activeRide) return;
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("status", "pending")
        .gt("pickup_time", ridePickupExpiryCutoffIso())
        .order("created_at", { ascending: true })
        .limit(20);

      if (error || !data?.length) return;
      const next = pickNextPendingRide(data as Ride[], getOfferGateState());
      if (next) await presentOffer(next);
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
          filter: "status=eq.pending",
        },
        (payload) => {
          const ride = payload.new as Ride;
          if (!isRidePickupStillOfferable(ride.pickup_time)) return;
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
          const updated = payload.new as Ride;
          if (updated.status === "pending") return;
          const { availableRide: current, deferredRides: deferred } =
            useDriverStore.getState();
          if (current?.id === updated.id) {
            removeAvailableRide(updated.id);
            Alert.alert("Info", "The ride is no longer available.");
          } else if (deferred.some((r) => r.id === updated.id)) {
            useDriverStore.setState((s) => ({
              deferredRides: s.deferredRides.filter((r) => r.id !== updated.id),
            }));
          }
        },
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [
    canReceiveOffers,
    isOnline,
    availableRide,
    activeRide,
    presentOffer,
    removeAvailableRide,
    setAvailableRide,
    getOfferGateState,
  ]);
}

export default function DashboardScreen() {
  const router = useRouter();
  useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);

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
    activeRide,
    setActiveRide,
  } = useDriverStore();
  useDriverLocation(isOnline);

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
      if (!isRidePickupStillOfferable(ride.pickup_time)) return;
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
    availableRide,
    activeRide,
    presentOffer,
    removeAvailableRide,
    setAvailableRide,
    getOfferGateState,
  });

  const handleAcceptRide = async (rideId: string) => {
    const ride =
      availableRides.find((r) => r.id === rideId) ||
      deferredRides.find((r) => r.id === rideId) ||
      (availableRide?.id === rideId ? availableRide : null);
    if (!ride) return;
    if (driverStatus !== "active") {
      Alert.alert("Error", "Only active drivers can accept rides");
      return;
    }

    const result = await rideService.acceptRide(rideId);
    if (!result.success) {
      Alert.alert("Error", result.error || "Failed to accept ride");
      suppressRide(rideId);
      return;
    }

    setActiveRide({ ...ride, status: "scheduled" });
    removeAvailableRide(rideId);
    // Drop from deferred if promoted then accepted
    useDriverStore.setState((s) => ({
      deferredRides: s.deferredRides.filter((r) => r.id !== rideId),
    }));
    Alert.alert("Success", "Ride accepted!");
  };

  const handleDeclineRide = async (
    rideId: string,
    reason: "declined" | "timeout" = "declined",
  ) => {
    if (reason === "timeout") {
      deferAvailableRide(rideId);
    } else {
      suppressRide(rideId);
    }
    await rideService.respondOffer(rideId, reason);
  };

  const setFolderStatus = useDriverFolderStore((s) => s.setStatus);
  const [rejectedDocs, setRejectedDocs] = useState<
    Array<{ document_type: string; rejection_reason: string | null }>
  >([]);
  const [expiredTypes, setExpiredTypes] = useState<string[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<ExpiringDocument[]>([]);

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
        setDriverStatus(driver.status);
        setFolderStatus(driver.status);

        const { data: rejected } = await supabase
          .from("driver_documents")
          .select("document_type, rejection_reason")
          .eq("driver_id", driver.id)
          .eq("validation_status", "rejected");

        setRejectedDocs(rejected ?? []);

        const dossier = await getDossierStatus(driver.id);
        if (dossier) {
          setExpiredTypes(dossier.expired_document_types);
          setExpiringDocs(dossier.expiring_documents);
          useDriverFolderStore.setState({
            canSubmit: dossier.can_submit,
            canEditDocuments: dossier.can_edit_documents,
            isEditable: dossier.is_editable,
          });
        } else {
          setExpiredTypes([]);
          setExpiringDocs([]);
        }
      } else {
        router.replace("/(auth)/profile-setup");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [router, setFolderStatus]);

  useFocusEffect(
    useCallback(() => {
      void fetchDriverStatus();
    }, [fetchDriverStatus]),
  );

  const handleToggleOnline = () => {
    if (driverStatus !== "active" && !isOnline) {
      Alert.alert(
        "Unavailable",
        "Your dossier must be active before going online.",
      );
      return;
    }
    setIsOnline(!isOnline);
  };

  const bottomSheetSnapLevel = useMemo(() => {
    const offerableDeferred = deferredRides.filter((r) =>
      isRidePickupStillOfferable(r.pickup_time),
    );
    const hasDossierAlert =
      expiredTypes.length > 0 ||
      expiringDocs.length > 0 ||
      rejectedDocs.length > 0 ||
      driverStatus === "draft" ||
      driverStatus === "incomplete" ||
      driverStatus === "pending_review" ||
      driverStatus === "rejected";

    // Palier 4 — banners / future promos need the notices height
    if (hasDossierAlert) {
      return "notices" as const;
    }

    // Palier 3 — ride cards fully visible (incl. bottom border above tab bar)
    if (availableRide || offerableDeferred.length > 0 || activeRide) {
      return "rides" as const;
    }

    // Palier 1 — only the sheet edge (pull to reveal stats)
    return "peek" as const;
  }, [
    driverStatus,
    availableRide,
    deferredRides.length,
    activeRide,
    rejectedDocs.length,
    expiredTypes.length,
    expiringDocs.length,
  ]);

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
        onAcceptRide={(rideId) => {
          void handleAcceptRide(rideId);
        }}
        onDeclineRide={(rideId, reason) => {
          void handleDeclineRide(rideId, reason ?? "declined");
        }}
      />

      <View style={{ flex: 1, backgroundColor: "#171717", zIndex: -1 }}>
        {/* VTC Map - Works in Expo Go */}
        <VTCMap
          style={{ zIndex: -2 }}
          start={
            activeRide
              ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lon }
              : undefined
          }
          end={
            activeRide
              ? { lat: activeRide.dropoff_lat, lng: activeRide.dropoff_lon }
              : undefined
          }
          drivers={[]}
          showRoute={!!activeRide}
          onLocationUpdate={(coords) => console.log("GPS:", coords)}
          onMapReady={() => console.log("VTC Map ready")}
        />

        <OnlineStatusPill isOnline={isOnline} onToggle={handleToggleOnline} />

        {/* Content Overlay */}
        <BottomSheet snapLevel={bottomSheetSnapLevel}>
          <DriverStatusBanner
            driverStatus={driverStatus}
            rejectedDocs={rejectedDocs}
            expiredTypes={expiredTypes}
            expiringDocs={expiringDocs}
            onOpenProfile={() => router.push("/(auth)/profile-setup")}
          />
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
              <Text
                className="text-2xl font-black mt-1"
                style={{ color: "#fff" }}
              >
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
              <Text
                className="text-2xl font-black mt-1"
                style={{ color: "#fff" }}
              >
                {stats.todayRides}
              </Text>
            </View>
          </View>
          <View className="mb-5">
            <Text
              className="text-sm font-semibold mb-3"
              style={{ color: "rgba(255,255,255,0.8)" }}
            >
              {activeRide ? "COURSE EN COURS" : "COURSES DISPONIBLES"}
            </Text>
                <DashboardRidePreview
                  activeRide={activeRide}
                  availableRide={availableRide}
                  deferredRides={deferredRides.filter((r) =>
                    isRidePickupStillOfferable(r.pickup_time),
                  )}
              contentInset={24}
              onOpenActiveRide={() => router.push("/(tabs)/rides")}
              onPromoteDeferred={(rideId) => {
                promoteDeferredRide(rideId);
              }}
            />
          </View>
          <View
            style={{
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.03)",
              marginBottom: 8,
            }}
          >
            <Text
              className="text-xs font-bold tracking-wider mb-1"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              NOTIFICATIONS
            </Text>
            <Text
              className="text-sm"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Astuces, offres partenaires et alertes apparaîtront ici.
            </Text>
          </View>
        </BottomSheet>
      </View>
    </AnimatedPage>
  );
}

function OnlineStatusPill({
  isOnline,
  onToggle,
}: Readonly<{
  isOnline: boolean;
  onToggle: () => void;
}>) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 10,
        left: 16,
        right: 16,
        zIndex: 20,
        flexDirection: "row",
        justifyContent: "flex-end",
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: isOnline }}
        accessibilityLabel={isOnline ? "Passer hors ligne" : "Passer en ligne"}
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: 36,
          paddingLeft: 4,
          paddingRight: 4,
          borderRadius: 10,
          backgroundColor: "rgba(12, 12, 12, 0.72)",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(255,255,255,0.14)",
        }}
      >
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: isOnline ? "transparent" : "rgba(255,255,255,0.1)",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: isOnline ? "rgba(255,255,255,0.35)" : "#e5e5e5",
            }}
          >
            Off
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: isOnline ? "rgba(16,185,129,0.9)" : "transparent",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: isOnline ? "#042f2e" : "rgba(255,255,255,0.35)",
            }}
          >
            On
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function DriverStatusBanner({
  driverStatus,
  rejectedDocs,
  expiredTypes,
  expiringDocs,
  onOpenProfile,
}: Readonly<{
  driverStatus: string | null;
  rejectedDocs: Array<{
    document_type: string;
    rejection_reason: string | null;
  }>;
  expiredTypes: string[];
  expiringDocs: ExpiringDocument[];
  onOpenProfile: () => void;
}>) {
  const banner = resolveDossierBanner({
    expiredTypes,
    expiring: expiringDocs,
    rejectedTypes: rejectedDocs.map((d) => d.document_type),
    driverStatus,
  });

  if (!banner.kind) return null;

  let title = "Profil incomplet";
  let subtitle = "Complétez votre profil pour commencer.";
  let accent = "#fbbf24";
  let icon: "alert-triangle" | "file-text" | "clock" = "alert-triangle";

  if (banner.kind === "expired") {
    title =
      expiredTypes.length > 1
        ? "Documents expirés"
        : "Document expiré";
    subtitle = `Remplacez : ${expiredTypes.join(", ")}`;
    accent = "#fb7185";
    icon = "file-text";
  } else if (banner.kind === "expiring" && banner.expiring) {
    const days = banner.expiring.days_remaining;
    if (days <= 7) {
      title = "Expiration imminente";
      accent = "#fb7185";
    } else if (days <= 30) {
      title = "À renouveler bientôt";
    } else {
      title = "Rappel de validité";
    }
    subtitle = `${banner.expiring.document_type} expire dans ${days} jour(s) (${banner.expiring.expiry_date})`;
    icon = "clock";
  } else if (banner.kind === "rejected") {
    title =
      rejectedDocs.length > 1 ? "Documents refusés" : "Document refusé";
    subtitle =
      rejectedDocs[0]?.rejection_reason ||
      "Remplacez le(s) document(s) refusé(s) pour continuer.";
    accent = "#fb7185";
    icon = "file-text";
  } else if (banner.kind === "pending_review") {
    title = "Validation en cours";
    subtitle = "Votre profil est en cours de validation.";
  }

  return (
    <View className="px-6 mb-2">
      <Pressable onPress={onOpenProfile}>
        <View style={{ padding: 16 }}>
          <View className="flex-row items-center gap-3">
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor:
                  accent === "#fb7185"
                    ? "rgba(251, 113, 133, 0.2)"
                    : "rgba(251, 191, 36, 0.2)",
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
              name="chevron-right"
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
  const priceLabel = ride.estimated_price
    ? `€${ride.estimated_price.toFixed(2)}`
    : "Prix estimé";
  const distanceLabel = formatRideDistanceKm(ride.distance);
  const durationLabel = formatRideDurationMin(ride.duration, ride.distance);
  const pickupWhen = formatPickupDateTime(ride.pickup_time);
  const statusLabel = getPendingRideDisplayLabel(ride.pickup_time).toUpperCase();
  const isOverdue = !isRidePickupStillOfferable(ride.pickup_time);

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
        <View className="flex-row justify-between items-center mb-3">
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
          <Text className="text-white text-xl font-bold">{priceLabel}</Text>
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
          <View className="flex-row justify-between items-center mb-3">
            <View className="bg-emerald-500/20 px-2 py-0.5 rounded">
              <Text className="text-emerald-400 text-[10px] font-bold tracking-wide">
                EN COURS
              </Text>
            </View>
            <Text className="text-white text-xl font-bold">
              €{activeRide.estimated_price?.toFixed(2)}
            </Text>
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
