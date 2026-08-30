/**
 * Dossier status service — RPCs get_driver_dossier_status / submit / validate
 */

import { supabase } from '../supabase';
import { normalizeFolderStatus, type DriverFolderStatus } from '../folderStatus';
import type { ExpiringDocument } from '../dossierBanner';

export type { ExpiringDocument } from '../dossierBanner';
export { resolveDossierBanner } from '../dossierBanner';
export type { BannerKind } from '../dossierBanner';

export interface DossierStatus {
  status: DriverFolderStatus;
  submitted_at: string | null;
  validated_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  is_editable: boolean;
  can_submit: boolean;
  can_edit_documents: boolean;
  completion_percentage: number;
  rejected_document_count: number;
  rejected_document_types: string[];
  expired_document_types: string[];
  expiring_documents: ExpiringDocument[];
  missing_for_submit: string[];
  is_complete: boolean;
  missing_fields: string[];
}

export interface DossierSubmissionResult {
  success: boolean;
  new_status: string;
  message: string;
}

function parseExpiringDocuments(raw: unknown): ExpiringDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const document_type =
        typeof row.document_type === 'string' ? row.document_type : '';
      const expiry_date =
        typeof row.expiry_date === 'string' ? row.expiry_date : '';
      const days_remaining =
        typeof row.days_remaining === 'number'
          ? row.days_remaining
          : Number(row.days_remaining ?? 0);
      if (!document_type || !expiry_date) return null;
      return { document_type, expiry_date, days_remaining };
    })
    .filter((x): x is ExpiringDocument => x !== null);
}

export async function getDossierStatus(driverId: string): Promise<DossierStatus | null> {
  try {
    const { data, error } = await supabase
      .rpc('get_driver_dossier_status', { p_driver_id: driverId });

    if (error) {
      console.error('[dossierService] getDossierStatus - error:', error);
      return null;
    }

    const row = data && data.length > 0 ? data[0] : null;
    if (!row) return null;

    return {
      ...row,
      status: normalizeFolderStatus(row.status),
      submitted_at: row.submitted_at ?? null,
      validated_at: row.validated_at ?? null,
      rejected_at: row.rejected_at ?? null,
      rejection_reason: row.rejection_reason ?? null,
      rejected_document_count: Number(row.rejected_document_count ?? 0),
      rejected_document_types: Array.isArray(row.rejected_document_types)
        ? row.rejected_document_types
        : [],
      expired_document_types: Array.isArray(row.expired_document_types)
        ? row.expired_document_types
        : [],
      expiring_documents: parseExpiringDocuments(row.expiring_documents),
      missing_for_submit: Array.isArray(row.missing_for_submit)
        ? row.missing_for_submit
        : [],
      is_complete: Boolean(row.is_complete),
      missing_fields: Array.isArray(row.missing_fields) ? row.missing_fields : [],
      completion_percentage: Number(row.completion_percentage ?? 0),
    };
  } catch (error) {
    console.error('[dossierService] getDossierStatus - exception:', error);
    return null;
  }
}

export async function canEditDossier(driverId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .rpc('can_edit_driver_dossier', {
        p_driver_id: driverId,
        p_user_id: userId,
      });

    if (error) {
      console.error('[dossierService] canEditDossier - error:', error);
      return false;
    }

    return data || false;
  } catch (error) {
    console.error('[dossierService] canEditDossier - exception:', error);
    return false;
  }
}

export async function submitDossier(driverId: string, userId: string): Promise<DossierSubmissionResult> {
  try {
    const { data, error } = await supabase
      .rpc('submit_driver_dossier', {
        p_driver_id: driverId,
        p_user_id: userId,
      });

    if (error) {
      console.error('[dossierService] submitDossier - error:', error);
      return {
        success: false,
        new_status: 'error',
        message: error.message || 'Erreur lors de la soumission du dossier',
      };
    }

    const row = data && data.length > 0 ? data[0] : null;
    return row || {
      success: false,
      new_status: 'error',
      message: 'Réponse vide',
    };
  } catch (error) {
    console.error('[dossierService] submitDossier - exception:', error);
    return {
      success: false,
      new_status: 'error',
      message: error instanceof Error ? error.message : 'Erreur inattendue',
    };
  }
}

export async function validateDossier(
  driverId: string,
  adminUserId: string,
  approved: boolean,
  rejectionReason?: string,
): Promise<DossierSubmissionResult> {
  try {
    const { data, error } = await supabase.rpc('validate_driver_dossier', {
      p_driver_id: driverId,
      p_admin_user_id: adminUserId,
      p_approved: approved,
      p_rejection_reason: rejectionReason ?? null,
    });

    if (error) {
      return {
        success: false,
        new_status: 'error',
        message: error.message || 'Erreur validation',
      };
    }

    const row = data && data.length > 0 ? data[0] : null;
    return row || {
      success: false,
      new_status: 'error',
      message: 'Réponse vide',
    };
  } catch (error) {
    return {
      success: false,
      new_status: 'error',
      message: error instanceof Error ? error.message : 'Erreur inattendue',
    };
  }
}

/** Withdraw pending_review → draft (driver self or admin). */
export async function cancelDossierReview(
  driverId: string,
  actorUserId: string,
  reason?: string | null,
): Promise<DossierSubmissionResult> {
  try {
    const { data, error } = await supabase.rpc('cancel_driver_dossier_review', {
      p_driver_id: driverId,
      p_actor_user_id: actorUserId,
      p_reason: reason ?? null,
    });

    if (error) {
      return {
        success: false,
        new_status: 'error',
        message: error.message || "Erreur lors de l'annulation",
      };
    }

    const row = data && data.length > 0 ? data[0] : null;
    return row || {
      success: false,
      new_status: 'error',
      message: 'Réponse vide',
    };
  } catch (error) {
    return {
      success: false,
      new_status: 'error',
      message: error instanceof Error ? error.message : 'Erreur inattendue',
    };
  }
}

/** Create or return the draft drivers row for progressive dossier saves. */
export async function ensureDriverProfile(
  userId: string,
): Promise<{ id: string | null; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('ensure_driver_profile', {
      driver_user_id: userId,
    });

    if (error) {
      console.error('[dossierService] ensureDriverProfile - error:', error);
      return { id: null, error: error.message };
    }

    return { id: typeof data === 'string' ? data : null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('[dossierService] ensureDriverProfile - exception:', error);
    return { id: null, error: message };
  }
}

export async function syncDossierState(driverId: string, userId: string) {
  try {
    const status = await getDossierStatus(driverId);

    if (!status) {
      console.warn('[dossierService] syncDossierState - no status returned');
      return null;
    }

    const canEdit = await canEditDossier(driverId, userId);

    return {
      status: status.status,
      submittedAt: status.submitted_at,
      validatedAt: status.validated_at,
      rejectedAt: status.rejected_at,
      rejectionReason: status.rejection_reason,
      isEditable: canEdit,
      canSubmit: status.can_submit,
      canEditDocuments: status.can_edit_documents,
      completionPercentage: status.completion_percentage,
      rejectedDocumentCount: status.rejected_document_count,
      rejectedDocumentTypes: status.rejected_document_types,
      expiredDocumentTypes: status.expired_document_types,
      expiringDocuments: status.expiring_documents,
      missingForSubmit: status.missing_for_submit,
      isComplete: status.is_complete,
      missingFields: status.missing_fields,
    };
  } catch (error) {
    console.error('[dossierService] syncDossierState - exception:', error);
    return null;
  }
}
