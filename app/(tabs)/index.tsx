import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
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
import { fetchRoute } from "../../src/lib/utils/map";

import Constants from "expo-constants";

let MapView: any,
  Marker: any,
  Polyline: any,
  UrlTile: any,
  PROVIDER_GOOGLE: any;

const isExpoGo = Constants?.appOwnership === "expo";

// Mock components to prevent crash or to use in Expo Go
const MockMap = (props: any) => (
  <View
    style={[
      {
        backgroundColor: "#1f2937",
        alignItems: "center",
        justifyContent: "center",
      },
      props.style,
    ]}
  >
    <Text style={{ color: "white" }}>Map Module Missing (Expo Go)</Text>
    {props.children}
  </View>
);

try {
  // Try to require react-native-maps
  const Maps = require("react-native-maps");
  MapView = Maps.default;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
  UrlTile = Maps.UrlTile;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;

  // If running inside Expo Go, prefer the mock to avoid native module issues
  if (isExpoGo) {
    console.log(
      "Running in Expo Go — using MockMap to avoid native module errors",
    );
    MapView = MockMap;
    Marker = View;
    Polyline = View;
    UrlTile = View;
    PROVIDER_GOOGLE = undefined;
  }
} catch (e) {
  console.warn("react-native-maps not found, map features will be disabled", e);
  MapView = MockMap;
  Marker = View;
  Polyline = View;
  UrlTile = View;
  PROVIDER_GOOGLE = undefined;
}

export default function DashboardScreen() {
  const router = useRouter();
  useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [activeRouteCoordinates, setActiveRouteCoordinates] = useState<any[]>(
    [],
  );

  const {
    isOnline,
    setIsOnline,
    stats,
    currentLocation,
    availableRide,
    availableRides,
    setAvailableRide,
    removeAvailableRide,
    activeRide,
    setActiveRide,
    hasSeenRide,
  } = useDriverStore();
  useDriverLocation(isOnline);

  useEffect(() => {
    try {
      console.log(
        "Map runtime check - MapView:",
        !!MapView,
        "PROVIDER_GOOGLE:",
        !!PROVIDER_GOOGLE,
      );
    } catch (e) {
      console.log("Map runtime check error", e);
    }
  }, []);

  // Fetch route for active ride
  useEffect(() => {
    const loadActiveRoute = async () => {
      if (activeRide) {
        const pickup = {
          lat: activeRide.pickup_lat,
          lng: activeRide.pickup_lon,
        };
        const dropoff = {
          lat: activeRide.dropoff_lat,
          lng: activeRide.dropoff_lon,
        };

        const route = await fetchRoute(pickup, dropoff);
        if (route) setActiveRouteCoordinates(route);
      } else {
        setActiveRouteCoordinates([]);
      }
    };

    loadActiveRoute();
  }, [activeRide]);

  // Realtime subscription for rides
  useEffect(() => {
    let channel: RealtimeChannel;

    if (isOnline) {
      console.log("Subscribing to rides...");

      // 1. Check for any existing pending rides (FIFO)
      const fetchExistingRide = async () => {
        // Only fetch if we don't have one, aren't busy, AND haven't seen one yet
        if (!availableRide && !activeRide && !hasSeenRide) {
          const { data, error } = await supabase
            .from("rides")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (data && !error) {
            console.log("Found existing pending ride:", data.id);
            setAvailableRide(data as Ride);
          }
        }
      };

      fetchExistingRide();

      // 2. Subscribe to new rides
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
            console.log("New ride received!", payload);
            // Simple logic: if we are free AND haven't seen a ride yet, take it
            if (!activeRide && !hasSeenRide) {
              setAvailableRide(payload.new as Ride);
            }
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
            // If the ride we are looking at is no longer pending (e.g. taken by someone else or cancelled)
            if (
              availableRide &&
              payload.new.id === availableRide.id &&
              payload.new.status !== "pending"
            ) {
              console.log("Ride no longer available:", payload.new.id);
              setAvailableRide(null);
              Alert.alert("Info", "The ride is no longer available.");
            }
          },
        )
        .subscribe((status) => {
          console.log("Subscription status:", status);
        });
    } else {
      // If we go offline, unsubscribe and clear available ride
      setAvailableRide(null);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isOnline, availableRide, activeRide, hasSeenRide]); // Re-run if online status changes

  const handleAcceptRide = async () => {
    if (!availableRide) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get driver ID
      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!driver) {
        Alert.alert("Error", "Driver profile not found");
        return;
      }

      const { data, error } = await supabase.rpc("accept_ride", {
        p_ride_id: availableRide.id,
        p_driver_id: driver.id,
      });

      if (error) {
        console.error("Error accepting ride:", error);
        Alert.alert("Error", "Failed to accept ride: " + error.message);
        return;
      }

      if (data && data.success) {
        Alert.alert("Success", "Ride accepted!");
        setActiveRide(availableRide);
        setAvailableRide(null);
      } else {
        Alert.alert("Error", data?.error || "Failed to accept ride");
        setAvailableRide(null); // Clear it as it's likely taken
      }
    } catch (e) {
      console.error("Exception accepting ride:", e);
      Alert.alert("Error", "An unexpected error occurred");
    }
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
          if (
            driver.status !== "active" &&
            driver.status !== "pending_review" &&
            driver.status !== "draft" &&
            driver.status !== "rejected"
          ) {
            console.log("Driver status:", driver.status);
          }
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
        onAcceptRide={handleAcceptRide}
        onDeclineRide={(rideId) => removeAvailableRide(rideId)}
      />

      <View style={{ flex: 1, backgroundColor: "#171717" }}>
        {/* Background Map */}
        <MapView
          style={StyleSheet.absoluteFill}
          mapType="standard"
          onMapReady={() => console.log("Dashboard Map onMapReady")}
          onLayout={() => console.log("Dashboard Map onLayout")}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsCompass={false}
          initialRegion={{
            latitude: currentLocation?.lat || 48.8566,
            longitude: currentLocation?.lng || 2.3522,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          region={
            currentLocation
              ? {
                  latitude: currentLocation.lat,
                  longitude: currentLocation.lng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }
              : undefined
          }
        >
          {/* Using Google Maps provider only — UrlTile removed to respect OSM tile policy */}
          {/* Active Ride Markers & Route */}
          {activeRide && (
            <>
              <Marker
                coordinate={{
                  latitude: activeRide.pickup_lat,
                  longitude: activeRide.pickup_lon,
                }}
                title="Pickup"
                description={activeRide.pickup_address}
              >
                <View
                  style={{
                    backgroundColor: "#10b981",
                    padding: 5,
                    borderRadius: 15,
                    borderWidth: 2,
                    borderColor: "white",
                  }}
                >
                  <Feather name="map-pin" size={14} color="white" />
                </View>
              </Marker>

              <Marker
                coordinate={{
                  latitude: activeRide.dropoff_lat,
                  longitude: activeRide.dropoff_lon,
                }}
                title="Dropoff"
                description={activeRide.dropoff_address}
              >
                <View
                  style={{
                    backgroundColor: "#6366f1",
                    padding: 5,
                    borderRadius: 15,
                    borderWidth: 2,
                    borderColor: "white",
                  }}
                >
                  <Feather name="flag" size={14} color="white" />
                </View>
              </Marker>

              {activeRouteCoordinates.length > 0 && (
                <Polyline
                  coordinates={activeRouteCoordinates}
                  strokeWidth={4}
                  strokeColor="#10b981"
                />
              )}
            </>
          )}
        </MapView>

        {/* Horizontal Status Pill - Bottom Right (Lower) */}
        <View style={{ position: "absolute", bottom: 100, right: 20 }}>
          <Pressable onPress={handleToggleOnline}>
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
              {/* Status LED */}
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

              {/* Text */}
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

        {/* Content Overlay */}
        <BottomSheet snapLevel={bottomSheetSnapLevel}>
          <View style={{ flex: 1 }}>
            {/* Critical Alerts (Absolute Top Priority - Fixed at top of sheet) */}
            {(driverStatus === "incomplete" ||
              driverStatus === "pending_validation") && (
              <View className="px-6 mb-2">
                <Pressable onPress={() => router.push("/(auth)/profile-setup")}>
                  <View
                    style={{
                      padding: 16,
                    }}
                  >
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
                        <Feather
                          name="alert-triangle"
                          size={16}
                          color="#fbbf24"
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-base font-bold mb-0.5"
                          style={{ color: "#fbbf24" }}
                        >
                          {driverStatus === "pending_validation"
                            ? "Validation en cours"
                            : "Profil incomplet"}
                        </Text>
                        <Text
                          className="text-xs font-medium"
                          style={{ color: "rgba(255,255,255,0.9)" }}
                        >
                          {driverStatus === "pending_validation"
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
            )}

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

                {activeRide ? (
                  <Pressable onPress={() => router.push("/(tabs)/rides")}>
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
                          <Feather
                            name="chevron-right"
                            size={14}
                            color="#34d399"
                          />
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ) : availableRide ? (
                  <View style={{ padding: 16 }}>
                    <View className="flex-row justify-between items-start mb-2">
                      <View className="bg-emerald-500/20 px-2 py-1 rounded">
                        <Text className="text-emerald-400 text-xs font-bold">
                          NOUVELLE DEMANDE
                        </Text>
                      </View>
                      <Text className="text-white font-bold">
                        {availableRide.estimated_price
                          ? `€${availableRide.estimated_price.toFixed(2)}`
                          : "Prix estimé"}
                      </Text>
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
                        {availableRide.distance
                          ? `${(availableRide.distance / 1000).toFixed(1)} km`
                          : ""}{" "}
                        •{" "}
                        {availableRide.duration
                          ? `${Math.round(availableRide.duration / 60)} min`
                          : ""}
                      </Text>
                      <Text className="text-emerald-400 text-xs font-bold">
                        Appuyez pour voir
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View className="items-center py-8 opacity-50">
                    <Text style={{ color: "rgba(255,255,255,0.4)" }}>
                      Aucune autre course disponible pour le moment.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </BottomSheet>
      </View>
    </AnimatedPage>
  );
}
