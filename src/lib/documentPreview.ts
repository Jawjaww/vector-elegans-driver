import { Linking, Alert } from 'react-native';
import { supabase } from './supabase';

const SIGNED_URL_TTL_SEC = 60 * 60;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Resolve storage path or URL to a browser-openable signed URL. */
export async function resolveDocumentPreviewUrl(
  fileUrl: string,
): Promise<string | null> {
  const trimmed = fileUrl.trim();
  if (!trimmed) return null;
  if (isHttpUrl(trimmed)) return trimmed;

  const path = trimmed.replace(/^\/+/, '');
  const { data, error } = await supabase.storage
    .from('driver-documents')
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    console.error('[documentPreview] createSignedUrl failed:', error);
    return null;
  }
  return data.signedUrl;
}

export async function openDocumentPreview(
  fileUrl: string,
  t: (key: string) => string,
): Promise<void> {
  const url = await resolveDocumentPreviewUrl(fileUrl);
  if (!url) {
    Alert.alert(t('documents.error'), t('documents.previewFailed'));
    return;
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert(t('documents.error'), t('documents.previewFailed'));
    return;
  }
  await Linking.openURL(url);
}
