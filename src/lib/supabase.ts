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

function isStaleRefreshTokenError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message =
    "message" in err ? String((err as { message?: unknown }).message ?? "") : "";
  return /invalid refresh token|refresh token not found/i.test(message);
}

/**
 * After local `supabase db reset`, SecureStore still holds the previous refresh token.
 * Clear it so Expo Go does not spam AuthApiError on every cold start.
 */
export async function clearStaleAuthSession(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error && isStaleRefreshTokenError(error)) {
      await supabase.auth.signOut({ scope: "local" });
      return;
    }
    // Force a refresh when a session exists — catches invalid refresh early.
    if (data.session) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError && isStaleRefreshTokenError(refreshError)) {
        await supabase.auth.signOut({ scope: "local" });
      }
    }
  } catch (err) {
    if (isStaleRefreshTokenError(err)) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // ignore
      }
    }
  }
}

// Run once at module load (non-blocking)
void clearStaleAuthSession();
