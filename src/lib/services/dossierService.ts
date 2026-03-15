/**
 * Service de gestion des états de dossier
 * Gère la communication avec les endpoints API pour les opérations de dossier
 */

import { supabase } from '../supabase';

export interface DossierStatus {
  status: 'draft' | 'submitted' | 'validated' | 'rejected';
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

/**
 * Obtient l'état actuel du dossier d'un conducteur
 */
export async function getDossierStatus(driverId: string): Promise<DossierStatus | null> {
  try {
    console.log('[dossierService] getDossierStatus - driverId:', driverId);
    const { data, error } = await supabase
      .rpc('get_driver_dossier_status', { p_driver_id: driverId });

    console.log('[dossierService] getDossierStatus - result:', { data, error });

    if (error) {
      console.error('[dossierService] getDossierStatus - error:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('[dossierService] getDossierStatus - exception:', error);
    return null;
  }
}

/**
 * Vérifie si un utilisateur peut éditer un dossier
 */
export async function canEditDossier(driverId: string, userId: string): Promise<boolean> {
  try {
    console.log('[dossierService] canEditDossier - driverId:', driverId, 'userId:', userId);
    const { data, error } = await supabase
      .rpc('can_edit_driver_dossier', { 
        p_driver_id: driverId,
        p_user_id: userId 
      });

    console.log('[dossierService] canEditDossier - result:', { data, error });

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

/**
 * Soumet un dossier pour validation
 */
export async function submitDossier(driverId: string, userId: string): Promise<DossierSubmissionResult> {
  try {
    console.log('[dossierService] submitDossier - driverId:', driverId, 'userId:', userId);
    const { data, error } = await supabase
      .rpc('submit_driver_dossier', { 
        p_driver_id: driverId,
        p_user_id: userId 
      });

    console.log('[dossierService] submitDossier - result:', { data, error });

    if (error) {
      console.error('[dossierService] submitDossier - error:', error);
      return {
        success: false,
        new_status: 'error',
        message: error.message || 'Erreur lors de la soumission du dossier'
      };
    }

    return data && data.length > 0 ? data[0] : {
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

/**
 * Valide ou rejette un dossier (admin only)
 */
export async function validateDossier(
  driverId: string, 
  adminUserId: string, 
  approved: boolean, 
  rejectionReason?: string
): Promise<DossierSubmissionResult> {
  try {
    console.log('[dossierService] validateDossier - driverId:', driverId, 'adminUserId:', adminUserId, 'approved:', approved);
    const { data, error } = await supabase
      .rpc('validate_driver_dossier', { 
        p_driver_id: driverId,
        p_admin_user_id: adminUserId,
        p_approved: approved,
        p_rejection_reason: rejectionReason || null
      });

    console.log('[dossierService] validateDossier - result:', { data, error });

    if (error) {
      console.error('[dossierService] validateDossier - error:', error);
      return {
        success: false,
        new_status: 'error',
        message: error.message || 'Erreur lors de la validation du dossier'
      };
    }

    return data && data.length > 0 ? data[0] : {
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

/**
 * Synchronise l'état du dossier avec le backend
 * Met à jour le store local avec les données du backend
 */
export async function syncDossierState(driverId: string, userId: string) {
  try {
    console.log('[dossierService] syncDossierState - driverId:', driverId, 'userId:', userId);
    // Récupérer l'état actuel du backend
    const status = await getDossierStatus(driverId);
    
    if (!status) {
      console.warn('[dossierService] syncDossierState - no status returned');
      return null;
    }

    // Vérifier les permissions d'édition
    const canEdit = await canEditDossier(driverId, userId);
    console.log('[dossierService] syncDossierState - canEdit:', canEdit);

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