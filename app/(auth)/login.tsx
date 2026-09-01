import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  type TextStyle,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { supabase, getSupabaseBackendLabel } from "../../src/lib/supabase";
import { isUserDriver } from "../../src/lib/utils/auth-helpers";

/** Match signup glass fields: soft emerald → frosted white film. */
const INPUT_STYLE: TextStyle = {
  flex: 1,
  color: "#34d399",
  fontSize: 16,
  fontWeight: "500",
  paddingHorizontal: 12,
  height: "100%",
  backgroundColor: "transparent",
  ...(Platform.OS === "android"
    ? { includeFontPadding: false, textAlignVertical: "center" as const }
    : null),
};

function AuthFieldShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <View
      className="rounded-xl h-14 justify-center overflow-hidden border shadow-sm relative"
      style={{
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "transparent",
      }}
    >
      <LinearGradient
        colors={["rgba(16, 185, 129, 0.15)", "rgba(255, 255, 255, 0.2)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }}
      />
      <View className="flex-row items-center px-4 relative z-10 h-full">
        {children}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const backendLabel = getSupabaseBackendLabel();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  /** Remount inputs once after OS autofill to drop the yellow highlight (Expo Go / Android). */
  const [inputEpoch, setInputEpoch] = useState(0);
  const clearedAutofillHighlight = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android" || clearedAutofillHighlight.current) return;
    if (!email && !password) return;
    clearedAutofillHighlight.current = true;
    const t = setTimeout(() => setInputEpoch((n) => n + 1), 80);
    return () => clearTimeout(t);
  }, [email, password]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t("common.error"), t("auth.invalidCredentials"));
      return;
    }

    setLoading(true);
    console.log("Attempting login with:", email);
    console.log("Supabase URL:", process.env.EXPO_PUBLIC_SUPABASE_URL);

    try {
      // Add a timeout to prevent infinite loading state
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error("Connection timed out. Please check your network."),
            ),
          10000,
        ),
      );

      const loginPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });

      const result = (await Promise.race([
        loginPromise,
        timeoutPromise,
      ])) as any;
      const { data, error } = result;

      if (error) {
        console.error("Login error:", error);
        const invalidCreds = /invalid login credentials/i.test(error.message);
        const localSeedEmail = /@elegance-mobilite\.local$/i.test(email.trim());
        if (invalidCreds && backendLabel === "cloud" && localSeedEmail) {
          Alert.alert(t("common.error"), t("auth.cloudLocalSeedHint"));
        } else if (invalidCreds) {
          Alert.alert(t("common.error"), t("auth.invalidCredentials"));
        } else {
          Alert.alert(t("common.error"), error.message);
        }
        return;
      }

      if (data.user) {
        console.log("User authenticated, checking role...");
        if (!isUserDriver(data.user)) {
          console.log("User is not a driver");
          await supabase.auth.signOut();
          Alert.alert(t("common.error"), t("auth.driverOnly"));
          return;
        }

        console.log("Fetching driver profile...");
        const { data: driver, error: driverError } = await supabase
          .from("drivers")
          .select("status")
          .eq("user_id", data.user.id)
          .maybeSingle();

        // PGRST116 / null = no driver row yet (new account) → profile setup
        if (driverError) {
          console.error("Driver fetch error:", driverError);
          router.replace("/(auth)/profile-setup");
          return;
        }

        if (!driver) {
          router.replace("/(auth)/profile-setup");
        } else if (
          [
            "active",
            "draft",
            "incomplete",
            "pending_validation",
            "pending_review",
            "rejected",
          ].includes(driver.status)
        ) {
          router.replace("/(tabs)");
        } else {
          console.log("Driver status:", driver.status);
          router.replace("/(tabs)");
        }
      }
    } catch (error: any) {
      console.error("Login exception:", error);
      Alert.alert(t("common.error"), error.message || t("common.error"));
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  };

  // Add mounted ref to prevent state updates on unmounted component
  const mounted = React.useRef(true);
  React.useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <View className="flex-1 bg-transparent">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          {/* Main Card Container - FullscreenRideModal Style */}
          <View
            className="overflow-hidden rounded-xl"
            style={
              {
                // backgroundColor: 'transparent',
                // borderColor: 'transparent',
                // shadowColor: 'transparent',
                // shadowOffset: { width: 0, height: 0 },
                // shadowOpacity: 0,
                // shadowRadius: 0,
                // elevation: 0,
              }
            }
          >
            {/* Header */}
            <View className="items-center mb-10 mt-12">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4 border border-white/10">
                <Text className="text-4xl">🚗</Text>
              </View>
              <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">
                Vector Elegans
              </Text>
              <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">
                Pour les chauffeur
              </Text>
              {__DEV__ ? (
                <Text className="text-xs text-amber-300/90 mt-3 text-center px-4">
                  {backendLabel === "cloud"
                    ? t("auth.backendCloud")
                    : t("auth.backendLocal")}
                </Text>
              ) : null}
            </View>

            {/* Form Container */}
            <View className="mx-6 pb-10">
              {/* Email Input */}
              <View className="mb-5">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">
                  Email
                </Text>
                <AuthFieldShell>
                  <Feather name="mail" size={18} color="#10b981" />
                  <TextInput
                    key={`email-${inputEpoch}`}
                    style={INPUT_STYLE}
                    placeholder="driver@email.com"
                    placeholderTextColor="#065f46"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                    underlineColorAndroid="transparent"
                  />
                </AuthFieldShell>
              </View>

              {/* Password Input */}
              <View className="mb-8">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-1">
                  Password
                </Text>
                <AuthFieldShell>
                  <Feather name="lock" size={18} color="#10b981" />
                  <TextInput
                    key={`password-${inputEpoch}`}
                    style={INPUT_STYLE}
                    placeholder="••••••••"
                    placeholderTextColor="#065f46"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                    underlineColorAndroid="transparent"
                  />
                </AuthFieldShell>
              </View>

              {/* Neon Sign In Button - Matches NeonSwipeButton style */}
              <Pressable
                onPress={handleLogin}
                disabled={loading}
                className={`rounded-full py-4 items-center shadow-lg overflow-hidden relative ${loading ? "opacity-70" : "opacity-100"}`}
                style={{
                  shadowColor: "#22c55e", // green-500
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 20,
                  elevation: 10,
                }}
              >
                <LinearGradient
                  colors={["#10b981", "#4ade80", "#2dd4bf"]} // emerald-500, green-400, teal-400
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                  }}
                />

                {/* Inner white gradient overlay */}
                <LinearGradient
                  colors={[
                    "rgba(255,255,255,0.35)",
                    "rgba(255,255,255,0.15)",
                    "rgba(255,255,255,0)",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    position: "absolute",
                    left: 4,
                    right: "30%",
                    top: 4,
                    bottom: 4,
                    borderRadius: 9999,
                  }}
                />

                <Text className="text-white text-base font-black uppercase tracking-tighter drop-shadow-md">
                  {loading ? "Signing in..." : "Sign In"}
                </Text>
              </Pressable>

              {/* Forgot Password Link */}
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable className="mt-6 items-center">
                  <Text className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    Forgot Password?
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>

          {/* Footer */}
          <View className="flex-row justify-center mt-10">
            <Text className="text-slate-500 text-sm font-medium">
              Don't have an account?{" "}
            </Text>
            <Link href="/(auth)/signup" asChild>
              <Pressable>
                <Text className="font-bold text-emerald-400 text-sm ml-1 uppercase tracking-wide">
                  Sign Up
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
