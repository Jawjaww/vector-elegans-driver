import { supabase } from './supabase';

const SIGNED_URL_TTL_SEC = 60 * 60;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Local picker URIs that Image can render without a signed URL. */
export function isLocalImageUri(value: string): boolean {
  return /^(file:|content:|ph:|assets-library:|data:)/i.test(value);
}

/**
 * Resolve a stored avatar path (or URL) to something Image can display.
 * Private bucket `driver-avatars` requires a signed URL.
 */
export async function resolveAvatarPreviewUrl(
  fileUrl: string | null | undefined,
): Promise<string | null> {
  const trimmed = fileUrl?.trim();
  if (!trimmed) return null;
  if (isHttpUrl(trimmed) || isLocalImageUri(trimmed)) return trimmed;

  const path = trimmed.replace(/^\/+/, '');
  const { data, error } = await supabase.storage
    .from('driver-avatars')
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    console.error('[avatarPreview] createSignedUrl failed:', error);
    return null;
  }
  return data.signedUrl;
}
