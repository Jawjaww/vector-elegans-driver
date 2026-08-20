/**
 * Service de gestion des états de dossier
 * Aligné sur RPCs get_driver_dossier_status / submit_driver_dossier / validate_driver_dossier
 */

import { supabase } from '../supabase';
import { normalizeFolderStatus, type DriverFolderStatus } from '../folderStatus';

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
}

export interface DossierSubmissionResult {
  success: boolean;
  new_status: string;
  message: string;
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
        p_user_id: userId 
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
        p_user_id: userId 
      });

    if (error) {
      console.error('[dossierService] submitDossier - error:', error);
      return {
        success: false,
        new_status: 'error',
        message: error.message || 'Erreur lors de la soumission du dossier'
      };
    }

    const row = data && data.length > 0 ? data[0] : null;
    return row || {
      success: false,
      new_status: 'error',
      message: 'Réponse invalide du serveur'
    };
  } catch (error) {
    console.error('[dossierService] submitDossier - exception:', error);
    return {
      success: false,
      new_status: 'error',
      message: 'Erreur réseau lors de la soumission'
    };
  }
}

export async function validateDossier(
  driverId: string, 
  adminUserId: string, 
  approved: boolean, 
  rejectionReason?: string
): Promise<DossierSubmissionResult> {
  try {
    const { data, error } = await supabase
      .rpc('validate_driver_dossier', { 
        p_driver_id: driverId,
        p_admin_user_id: adminUserId,
        p_approved: approved,
        p_rejection_reason: rejectionReason || null
      });

    if (error) {
      console.error('[dossierService] validateDossier - error:', error);
      return {
        success: false,
        new_status: 'error',
        message: error.message || 'Erreur lors de la validation du dossier'
      };
    }

    const row = data && data.length > 0 ? data[0] : null;
    return row || {
      success: false,
      new_status: 'error',
      message: 'Réponse invalide du serveur'
    };
  } catch (error) {
    console.error('[dossierService] validateDossier - exception:', error);
    return {
      success: false,
      new_status: 'error',
      message: 'Erreur réseau lors de la validation'
    };
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
      completionPercentage: status.completion_percentage
    };
  } catch (error) {
    console.error('[dossierService] syncDossierState - exception:', error);
    return null;
  }
}
