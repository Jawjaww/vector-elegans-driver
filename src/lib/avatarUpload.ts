import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { ensureDriverProfile } from './services/dossierService';

export type EnsureDriverIdResult =
  | { id: string }
  | { error: 'no-user' | 'ensure-failed'; detail?: string };

export async function ensureActiveDriverId(
  driverId: string | null,
  userId: string | null,
): Promise<EnsureDriverIdResult> {
  if (driverId) return { id: driverId };
  if (!userId) return { error: 'no-user' };
  const ensured = await ensureDriverProfile(userId);
  if (!ensured.id) {
    return { error: 'ensure-failed', detail: ensured.error };
  }
  return { id: ensured.id };
}

export function avatarUploadPaths(
  driverId: string,
  userId: string | null,
): string[] {
  const stamp = Date.now();
  const paths = [`${driverId}/avatar_${stamp}.jpg`];
  if (userId && userId !== driverId) {
    paths.push(`${userId}/avatar_${stamp}.jpg`);
  }
  return paths;
}

export function jpegBytesFromBase64(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.codePointAt(i) ?? 0;
  }
  return bytes.buffer;
}

async function uploadAvatarBytes(
  bytes: ArrayBuffer,
  paths: string[],
): Promise<{ path: string } | { error: string }> {
  let lastError = 'upload failed';
  for (const path of paths) {
    const { error } = await supabase.storage.from('driver-avatars').upload(
      path,
      bytes,
      { contentType: 'image/jpeg', upsert: false },
    );
    if (!error) return { path };
    lastError = error.message;
  }
  return { error: lastError };
}

export async function storePickedDriverAvatar(params: {
  driverId: string;
  userId: string | null;
  uri: string;
}): Promise<{ path: string } | { error: string }> {
  const base64 = await FileSystem.readAsStringAsync(params.uri, {
    encoding: 'base64',
  });
  const uploaded = await uploadAvatarBytes(
    jpegBytesFromBase64(base64),
    avatarUploadPaths(params.driverId, params.userId),
  );
  if ('error' in uploaded) return uploaded;

  const { error } = await supabase
    .from('drivers')
    .update({ avatar_url: uploaded.path })
    .eq('id', params.driverId);
  if (error) return { error: error.message };
  return { path: uploaded.path };
}
