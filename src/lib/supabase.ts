import "react-native-get-random-values";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as aesjs from "aes-js";
import { AppState, Platform } from "react-native";

/** Android emulator alias for the host machine (local Supabase only). */
const ANDROID_EMULATOR_LOOPBACK = ["10", "0", "2", "2"].join(".");
const LOCAL_SUPABASE_PORT = "54329";

function localSupabaseUrl(host: string): string {
  // Local GoTrue has no TLS — intentional for Expo → LAN / emulator.
  return `http://${host}:${LOCAL_SUPABASE_PORT}`; // NOSONAR S5332 — local-only HTTP
}

function isCloudSupabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") && url.startsWith("https://");
  } catch {
    return false;
  }
}

function remapDockerInternalUrl(url: string): string {
  if (!url.includes("host.docker.internal")) return url;
  if (Platform.OS === "android") {
    return url.replace("host.docker.internal", ANDROID_EMULATOR_LOOPBACK);
  }
  return url.replace("host.docker.internal", "127.0.0.1");
}

function resolveSupabaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();

  // Release builds must use the same cloud project as Vercel (no local fallback).
  if (!__DEV__) {
    if (!envUrl || !isCloudSupabaseUrl(envUrl)) {
      throw new Error(
        "Release build requires EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co",
      );
    }
    return envUrl.replace(/\/$/, "");
  }

  if (envUrl?.length) {
    return remapDockerInternalUrl(envUrl);
  }

  return Platform.OS === "android"
    ? localSupabaseUrl(ANDROID_EMULATOR_LOOPBACK)
    : localSupabaseUrl("127.0.0.1");
}

function resolveSupabaseAnonKey(): string {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_ANON_KEY");
  }
  return key;
}

const supabaseUrl = resolveSupabaseUrl();
const supabaseAnonKey = resolveSupabaseAnonKey();

export function isCloudSupabaseBackend(): boolean {
  return isCloudSupabaseUrl(supabaseUrl);
}

export function getSupabaseBackendLabel(): "cloud" | "local" {
  return isCloudSupabaseBackend() ? "cloud" : "local";
}

if (__DEV__) {
  console.log("Supabase URL resolved to:", supabaseUrl);
}

/**
 * SecureStore rejects values > ~2048 bytes (Android). A Supabase session JWT
 * routinely exceeds that, so writes fail after login/refresh → cold start has
 * a stale/missing refresh token ("Refresh Token Not Found").
 *
 * Official Expo pattern: AES key in SecureStore, encrypted payload in AsyncStorage.
 */
class LargeSecureStore {
  private async encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(
      encryptionKey,
      new aesjs.Counter(1),
    );
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) {
      return encryptionKeyHex;
    }
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (encrypted) {
      try {
        return await this.decrypt(key, encrypted);
      } catch {
        // Corrupt encrypted blob — fall through to legacy / clear
      }
    }

    // Migrate legacy plain SecureStore sessions (often oversized / unreadable)
    try {
      const legacy = await SecureStore.getItemAsync(key);
      if (legacy) {
        await this.setItem(key, legacy);
        return legacy;
      }
    } catch {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // ignore
      }
    }

    return null;
  }

  async setItem(key: string, value: string) {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// RN: pause token refresh while backgrounded so rotation does not race a failed persist
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

function authErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object" || !("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

function isStaleRefreshTokenError(err: unknown): boolean {
  return /invalid refresh token|refresh token not found/i.test(
    authErrorMessage(err),
  );
}

/**
 * After local `supabase db reset`, storage still holds the previous refresh token.
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
