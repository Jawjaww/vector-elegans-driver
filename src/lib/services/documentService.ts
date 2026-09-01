import { supabase } from '../supabase';

function parseRpcSuccess(data: unknown): { success: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { success: false, error: 'empty response' };
  }
  const row = data as Record<string, unknown>;
  if (row.success === false) {
    const err = typeof row.error === 'string' ? row.error : 'update_failed';
    return { success: false, error: err };
  }
  return { success: true };
}

/** Persist a new expiry date on the latest row for this document type. */
export async function updateOwnDocumentExpiry(
  driverId: string,
  documentType: string,
  expiryDate: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = expiryDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { success: false, error: 'invalid_date' };
  }

  const { data, error } = await supabase.rpc('update_own_driver_document_expiry', {
    p_driver_id: driverId,
    p_document_type: documentType,
    p_expiry_date: trimmed,
  });

  if (error) {
    console.error('[documentService] update_own_driver_document_expiry:', error);
    return { success: false, error: error.message };
  }

  return parseRpcSuccess(data);
}
