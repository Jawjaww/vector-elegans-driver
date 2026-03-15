import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Determine Supabase URL at runtime to handle emulator/device networking differences
const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const fallbackUrl =
  Platform.OS === "android"
    ? "http://10.0.2.2:54329"
    : "http://127.0.0.1:54329";

// If envUrl uses host.docker.internal, map it to a platform-appropriate address
let resolvedEnvUrl: string | undefined = envUrl;
if (envUrl?.includes("host.docker.internal")) {
  if (Platform.OS === "android") {
    resolvedEnvUrl = envUrl.replace("host.docker.internal", "10.0.2.2");
  } else {
    // On iOS and macOS, localhost/127.0.0.1 usually works
    resolvedEnvUrl = envUrl.replace("host.docker.internal", "127.0.0.1");
  }
}

const supabaseUrl = resolvedEnvUrl?.length ? resolvedEnvUrl : fallbackUrl;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

console.log("Supabase URL resolved to:", supabaseUrl);

// Custom storage adapter for React Native
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
