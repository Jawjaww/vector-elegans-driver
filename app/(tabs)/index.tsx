import { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";
import { useDriverStore, Ride } from "../../src/lib/stores/driverStore";
import { useDriverLocation } from "../../src/hooks/useDriverLocation";
import { AnimatedPage } from "../../src/components/AnimatedPage";
import { BottomSheet } from "../../src/components/BottomSheet";
import { RideStackModal } from "../../src/components/RideStackModal";
import { VTCMap } from "../../src/map";
import { rideService } from "../../src/services/rideService";

function usePendingRideChannel({
  canReceiveOffers,
  isOnline,
  availableRide,
  activeRide,
  presentOffer,
  removeAvailableRide,
  setAvailableRide,
}: {
  canReceiveOffers: boolean;
  isOnline: boolean;
  availableRide: Ride | null;
  activeRide: Ride | null;
  presentOffer: (ride: Ride) => Promise<void>;
  removeAvailableRide: (rideId: string) => void;
  setAvailableRide: (ride: Ride | null) => void;
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
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        await presentOffer(data as Ride);
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
          filter: "status=eq.pending",
        },
        (payload) => {
          void presentOffer(payload.new as Ride);
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
          if (
            availableRide?.id === updated.id &&
            updated.status !== "pending"
          ) {
            removeAvailableRide(availableRide.id);
            Alert.alert("Info", "The ride is no longer available.");
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
    setAvailableRide,
    addAvailableRide,
    removeAvailableRide,
    activeRide,
    setActiveRide,
  } = useDriverStore();
  useDriverLocation(isOnline);

  const canReceiveOffers = isOnline && driverStatus === "active" && !activeRide;

  const presentOffer = useCallback(
    async (ride: Ride) => {
      if (!canReceiveOffers) return;
      addAvailableRide(ride);
      await rideService.recordOffer(ride.id);
    },
    [addAvailableRide, canReceiveOffers],
  );

  usePendingRideChannel({
    canReceiveOffers,
    isOnline,
    availableRide,
    activeRide,
    presentOffer,
    removeAvailableRide,
    setAvailableRide,
  });

  const handleAcceptRide = async (rideId: string) => {
    const ride =
      availableRides.find((r) => r.id === rideId) ||
      (availableRide?.id === rideId ? availableRide : null);
    if (!ride) return;
    if (driverStatus !== "active") {
      Alert.alert("Error", "Only active drivers can accept rides");
      return;
    }

    const result = await rideService.acceptRide(rideId);
    if (!result.success) {
      Alert.alert("Error", result.error || "Failed to accept ride");
      removeAvailableRide(rideId);
      return;
    }

    setActiveRide({ ...ride, status: "scheduled" });
    setAvailableRide(null);
    Alert.alert("Success", "Ride accepted!");
  };

  const handleDeclineRide = async (
    rideId: string,
    reason: 'declined' | 'timeout' = 'declined',
  ) => {
    await rideService.respondOffer(rideId, reason);
    removeAvailableRide(rideId);
  };

  useEffect(() => {
    const fetchDriverStatus = async () => {
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
          .select("status, first_name, last_name")
          .eq("user_id", user.id)
          .single();

        if (driver) {
          setDriverStatus(driver.status);
        } else {
          router.replace("/(auth)/profile-setup");
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDriverStatus();
  }, [router]);

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
    if (
      driverStatus === "draft" ||
      driverStatus === "pending_review"
    ) {
      return "medium";
    }
    if (availableRide) {
      return "medium";
    }
    return "collapsed";
  }, [driverStatus, availableRide]);

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
        onDeclineRide={(rideId) => {
          void handleDeclineRide(rideId);
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
          <View style={{ flex: 1 }}>
            <DriverStatusBanner
              driverStatus={driverStatus}
              onOpenProfile={() => router.push("/(auth)/profile-setup")}
            />

            {/* Scrollable Content - Visible when expanded */}
            <ScrollView
              className="flex-1"
              style={{ backgroundColor: "transparent" }}
              contentContainerStyle={{
                paddingBottom: 100,
                paddingHorizontal: 24,
                paddingTop: 10,
              }}
              showsVerticalScrollIndicator={false}
            >
              {/* Daily Stats Summary */}
              <View className="flex-row justify-between mb-4 mt-2">
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

              {/* Available Rides Section (Notification Style) */}
              <View className="mb-6">
                <Text
                  className="text-sm font-semibold mb-3"
                  style={{ color: "rgba(255,255,255,0.8)" }}
                >
                  {activeRide ? "COURSE EN COURS" : "COURSES DISPONIBLES"}
                </Text>

                <DashboardRidePreview
                  activeRide={activeRide}
                  availableRide={availableRide}
                  onOpenActiveRide={() => router.push("/(tabs)/rides")}
                />
              </View>
            </ScrollView>
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
  return (
    <View style={{ position: "absolute", bottom: 100, right: 20 }}>
      <Pressable onPress={onToggle}>
        <Animated.View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 25,
            backgroundColor: "rgba(10, 10, 10, 0.9)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            borderWidth: 1,
            borderColor: isOnline
              ? "rgba(16, 185, 129, 0.3)"
              : "rgba(255, 255, 255, 0.1)",
            shadowColor: isOnline ? "#10b981" : "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isOnline ? 0.3 : 0.4,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isOnline ? "#10b981" : "#4b5563",
              shadowColor: isOnline ? "#10b981" : "transparent",
              shadowOpacity: isOnline ? 0.8 : 0,
              shadowRadius: 8,
            }}
          />
          <Text
            style={{
              color: isOnline ? "#34d399" : "#9ca3af",
              fontWeight: "600",
              fontSize: 13,
              letterSpacing: 1,
              textShadowColor: isOnline
                ? "rgba(16, 185, 129, 0.4)"
                : "transparent",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 8,
            }}
          >
            {isOnline ? "EN LIGNE" : "HORS LIGNE"}
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const NEEDS_PROFILE_ATTENTION = new Set([
  "incomplete",
  "draft",
  "pending_validation",
  "pending_review",
  "rejected",
  "submitted",
]);

const PENDING_REVIEW_STATUSES = new Set([
  "pending_validation",
  "pending_review",
  "submitted",
]);

function DriverStatusBanner({
  driverStatus,
  onOpenProfile,
}: Readonly<{
  driverStatus: string | null;
  onOpenProfile: () => void;
}>) {
  if (!driverStatus || !NEEDS_PROFILE_ATTENTION.has(driverStatus)) {
    return null;
  }

  const isPendingReview = PENDING_REVIEW_STATUSES.has(driverStatus);

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
                backgroundColor: "rgba(251, 191, 36, 0.2)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="alert-triangle" size={16} color="#fbbf24" />
            </View>
            <View className="flex-1">
              <Text
                className="text-base font-bold mb-0.5"
                style={{ color: "#fbbf24" }}
              >
                {isPendingReview ? "Validation en cours" : "Profil incomplet"}
              </Text>
              <Text
                className="text-xs font-medium"
                style={{ color: "rgba(255,255,255,0.9)" }}
              >
                {isPendingReview
                  ? "Votre profil est en cours de validation."
                  : "Complétez votre profil pour commencer."}
              </Text>
            </View>
            <Feather
              name="chevron-right"
              size={20}
              color="#fbbf24"
              style={{ opacity: 0.8 }}
            />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function DashboardRidePreview({
  activeRide,
  availableRide,
  onOpenActiveRide,
}: Readonly<{
  activeRide: Ride | null;
  availableRide: Ride | null;
  onOpenActiveRide: () => void;
}>) {
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
          <View className="flex-row justify-between items-start mb-2">
            <View className="bg-emerald-500/20 px-2 py-1 rounded">
              <Text className="text-emerald-400 text-xs font-bold">
                EN COURS
              </Text>
            </View>
            <Text className="text-white font-bold">
              €{activeRide.estimated_price?.toFixed(2)}
            </Text>
          </View>
          <Text
            className="text-white text-base font-semibold mb-1"
            numberOfLines={1}
          >
            {activeRide.pickup_address}
          </Text>
          <Text className="text-gray-400 text-sm mb-3">
            vers {activeRide.dropoff_address}
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-gray-500 text-xs">
              {(activeRide.distance || 0) / 1000} km •{" "}
              {Math.round((activeRide.duration || 0) / 60)} min
            </Text>
            <View className="flex-row items-center">
              <Text className="text-emerald-400 text-xs font-bold mr-1">
                Voir les détails
              </Text>
              <Feather name="chevron-right" size={14} color="#34d399" />
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  if (availableRide) {
    const priceLabel = availableRide.estimated_price
      ? `€${availableRide.estimated_price.toFixed(2)}`
      : "Prix estimé";
    const distanceLabel = availableRide.distance
      ? `${(availableRide.distance / 1000).toFixed(1)} km`
      : "";
    const durationLabel = availableRide.duration
      ? `${Math.round(availableRide.duration / 60)} min`
      : "";

    return (
      <View style={{ padding: 16 }}>
        <View className="flex-row justify-between items-start mb-2">
          <View className="bg-emerald-500/20 px-2 py-1 rounded">
            <Text className="text-emerald-400 text-xs font-bold">
              NOUVELLE DEMANDE
            </Text>
          </View>
          <Text className="text-white font-bold">{priceLabel}</Text>
        </View>
        <Text
          className="text-white text-base font-semibold mb-1"
          numberOfLines={1}
        >
          {availableRide.pickup_address}
        </Text>
        <Text className="text-gray-400 text-sm mb-3">
          vers {availableRide.dropoff_address}
        </Text>
        <View className="flex-row justify-between">
          <Text className="text-gray-500 text-xs">
            {distanceLabel} • {durationLabel}
          </Text>
          <Text className="text-emerald-400 text-xs font-bold">
            Appuyez pour voir
          </Text>
        </View>
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
