import { Alert, Linking } from 'react-native';
import { supabase } from './supabase';
import { showDocumentImageModal } from './DocumentPreviewModalHost';

const SIGNED_URL_TTL_SEC = 60 * 60;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url) || url.includes('image');
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

/** Fetch latest file_url for a driver document type when local state is empty. */
export async function fetchDocumentUrlFromDb(
  driverId: string,
  documentType: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('driver_documents')
    .select('file_url')
    .eq('driver_id', driverId)
    .eq('document_type', documentType)
    .in('validation_status', ['approved', 'pending', 'rejected'])
    .order('upload_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.file_url) {
    console.error('[documentPreview] fetchDocumentUrlFromDb failed:', error);
    return null;
  }
  return data.file_url;
}

export async function openDocumentPreview(
  fileUrl: string,
  t: (key: string) => string,
  options?: { driverId?: string; documentType?: string },
): Promise<void> {
  let resolved = fileUrl.trim() ? await resolveDocumentPreviewUrl(fileUrl) : null;

  if (!resolved && options?.driverId && options?.documentType) {
    const fromDb = await fetchDocumentUrlFromDb(options.driverId, options.documentType);
    if (fromDb) {
      resolved = await resolveDocumentPreviewUrl(fromDb);
    }
  }

  if (!resolved) {
    Alert.alert(t('documents.error'), t('documents.previewFailed'));
    return;
  }

  if (isImageUrl(resolved) && showDocumentImageModal(resolved)) {
    return;
  }

  try {
    await Linking.openURL(resolved);
  } catch (error) {
    console.error('[documentPreview] Linking.openURL failed:', error);
    Alert.alert(t('documents.error'), t('documents.previewFailed'));
  }
}

export { DocumentPreviewModalHost } from './DocumentPreviewModalHost';
