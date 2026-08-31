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

function firstRpcRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === 'object'
      ? (row as Record<string, unknown>)
      : null;
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
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

function mapDossierStatusRow(row: Record<string, unknown>): DossierStatus {
  return {
    status: normalizeFolderStatus(
      typeof row.status === 'string' ? row.status : 'draft',
    ),
    submitted_at:
      typeof row.submitted_at === 'string' ? row.submitted_at : null,
    validated_at:
      typeof row.validated_at === 'string' ? row.validated_at : null,
    rejected_at: typeof row.rejected_at === 'string' ? row.rejected_at : null,
    rejection_reason:
      typeof row.rejection_reason === 'string' ? row.rejection_reason : null,
    is_editable: Boolean(row.is_editable),
    can_submit: Boolean(row.can_submit),
    can_edit_documents: Boolean(row.can_edit_documents ?? true),
    rejected_document_count: Number(row.rejected_document_count ?? 0),
    rejected_document_types: asStringArray(row.rejected_document_types),
    expired_document_types: asStringArray(row.expired_document_types),
    expiring_documents: parseExpiringDocuments(row.expiring_documents),
    missing_for_submit: asStringArray(row.missing_for_submit),
    is_complete: Boolean(row.is_complete),
    missing_fields: asStringArray(row.missing_fields),
    completion_percentage: Number(row.completion_percentage ?? 0),
  };
}

/** Fallback when get_driver_dossier_status is missing from PostgREST schema cache. */
async function getDossierStatusFromCompleteness(
  driverId: string,
  userId: string,
): Promise<DossierStatus | null> {
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, status, user_id')
    .eq('id', driverId)
    .maybeSingle();

  if (driverError || !driver) {
    console.error(
      '[dossierService] completeness fallback - driver lookup failed:',
      driverError,
    );
    return null;
  }

  const { data: compData, error: compError } = await supabase.rpc(
    'check_driver_profile_completeness',
    { driver_user_id: userId || driver.user_id },
  );

  if (compError) {
    console.error(
      '[dossierService] completeness fallback - RPC failed:',
      compError,
    );
    return null;
  }

  const comp = firstRpcRow(compData);
  if (!comp) return null;

  const status = normalizeFolderStatus(
    typeof driver.status === 'string' ? driver.status : 'draft',
  );
  const canSubmit = Boolean(comp.can_submit) &&
    (status === 'draft' || status === 'rejected' || status === 'incomplete');

  return {
    status,
    submitted_at: null,
    validated_at: null,
    rejected_at: null,
    rejection_reason: null,
    is_editable: status !== 'pending_review' && status !== 'active',
    can_submit: canSubmit,
    can_edit_documents: status !== 'active',
    completion_percentage: Number(comp.completion_percentage ?? 0),
    rejected_document_count: 0,
    rejected_document_types: [],
    expired_document_types: [],
    expiring_documents: [],
    missing_for_submit: asStringArray(comp.missing_for_submit),
    is_complete: Boolean(comp.is_complete),
    missing_fields: asStringArray(comp.missing_fields),
  };
}

export async function getDossierStatus(
  driverId: string,
  userId?: string,
): Promise<DossierStatus | null> {
  try {
    const { data, error } = await supabase.rpc('get_driver_dossier_status', {
      p_driver_id: driverId,
    });

    if (!error) {
      const row = firstRpcRow(data);
      if (row) return mapDossierStatusRow(row);
    } else {
      console.error('[dossierService] getDossierStatus - error:', error);
    }

    if (userId) {
      return getDossierStatusFromCompleteness(driverId, userId);
    }

    const { data: auth } = await supabase.auth.getUser();
    if (auth.user?.id) {
      return getDossierStatusFromCompleteness(driverId, auth.user.id);
    }

    return null;
  } catch (error) {
    console.error('[dossierService] getDossierStatus - exception:', error);
    if (userId) {
      return getDossierStatusFromCompleteness(driverId, userId);
    }
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

    const row = firstRpcRow(data) as DossierSubmissionResult | null;
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

    const row = firstRpcRow(data) as DossierSubmissionResult | null;
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

    const row = firstRpcRow(data) as DossierSubmissionResult | null;
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
    const status = await getDossierStatus(driverId, userId);

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
