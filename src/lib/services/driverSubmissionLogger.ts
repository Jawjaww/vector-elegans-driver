/**
 * Service de logging pour les actions des conducteurs
 * Gère l'enregistrement détaillé de toutes les étapes de soumission
 */

import { supabase } from '../supabase';

export type DriverAction = 
  | 'submission_started'
  | 'profile_updated' 
  | 'document_uploaded'
  | 'submission_completed'
  | 'validation_requested'
  | 'validation_approved'
  | 'validation_rejected'
  | 'status_changed';

export interface LogDetails {
  section?: string;
  field?: string;
  document_type?: string;
  file_name?: string;
  file_size?: number;
  completion_percentage?: number;
  missing_fields?: string[];
  validation_errors?: string[];
  [key: string]: any;
}

export interface DriverLogEntry {
  driver_id: string;
  user_id: string;
  action: DriverAction;
  previous_status?: string;
  new_status?: string;
  details?: LogDetails;
  error_message?: string;
}

/**
 * Enregistre une action dans les logs
 */
export async function logDriverAction(logEntry: DriverLogEntry): Promise<void> {
  try {
    const { error } = await supabase
      .rpc('log_driver_action', {
        p_driver_id: logEntry.driver_id,
        p_user_id: logEntry.user_id,
        p_action: logEntry.action,
        p_previous_status: logEntry.previous_status,
        p_new_status: logEntry.new_status,
        p_details: logEntry.details ? JSON.stringify(logEntry.details) : null,
        p_error_message: logEntry.error_message
      });

    if (error) {
      console.error('Erreur lors du logging:', error);
      // Ne pas bloquer l'opération principale en cas d'erreur de log
    }
  } catch (error) {
    console.error('Exception lors du logging:', error);
  }
}

/**
 * Obtient l'historique des actions d'un conducteur
 */
export async function getDriverSubmissionHistory(driverId: string) {
  try {
    const { data, error } = await supabase
      .rpc('get_driver_submission_history', {
        p_driver_id: driverId
      });

    if (error) {
      console.error('Erreur lors de la récupération de l\historique:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception lors de la récupération de l\historique:', error);
    return [];
  }
}

/**
 * Logger spécifique pour le processus de soumission
 */
export class DriverSubmissionLogger {
  private driverId: string;
  private userId: string;
  private startTime: number;

  constructor(driverId: string, userId: string) {
    this.driverId = driverId;
    this.userId = userId;
    this.startTime = Date.now();
  }

  /**
   * Log le début du processus de soumission
   */
  async logSubmissionStart(): Promise<void> {
    await logDriverAction({
      driver_id: this.driverId,
      user_id: this.userId,
      action: 'submission_started',
      details: {
        timestamp: new Date().toISOString(),
        start_time: this.startTime
      }
    });
  }

  /**
   * Log une mise à jour du profil
   */
  async logProfileUpdate(section: string, field: string, completionPercentage: number): Promise<void> {
    await logDriverAction({
      driver_id: this.driverId,
      user_id: this.userId,
      action: 'profile_updated',
      details: {
        section,
        field,
        completion_percentage: completionPercentage,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Log l'upload d'un document
   */
  async logDocumentUpload(documentType: string, fileName: string, fileSize: number): Promise<void> {
    await logDriverAction({
      driver_id: this.driverId,
      user_id: this.userId,
      action: 'document_uploaded',
      details: {
        document_type: documentType,
        file_name: fileName,
        file_size: fileSize,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Log la soumission complète
   */
  async logSubmissionComplete(previousStatus: string, newStatus: string, details?: LogDetails): Promise<void> {
    const duration = Date.now() - this.startTime;
    
    await logDriverAction({
      driver_id: this.driverId,
      user_id: this.userId,
      action: 'submission_completed',
      previous_status: previousStatus,
      new_status: newStatus,
      details: {
        ...details,
        duration_ms: duration,
        completion_time: new Date().toISOString()
      }
    });
  }

  /**
   * Log une erreur pendant la soumission
   */
  async logError(action: string, error: string, details?: LogDetails): Promise<void> {
    await logDriverAction({
      driver_id: this.driverId,
      user_id: this.userId,
      action: 'submission_completed',
      error_message: error,
      details: {
        ...details,
        failed_action: action,
        error_timestamp: new Date().toISOString()
      }
    });
  }
}

/**
 * Hook React pour utiliser le logger
 */
export function useDriverSubmissionLogger(driverId: string | null, userId: string | null) {
  const logger = driverId && userId ? new DriverSubmissionLogger(driverId, userId) : null;
  
  return {
    logger,
    logSubmissionStart: () => logger?.logSubmissionStart(),
    logProfileUpdate: (section: string, field: string, completion: number) => 
      logger?.logProfileUpdate(section, field, completion),
    logDocumentUpload: (type: string, name: string, size: number) => 
      logger?.logDocumentUpload(type, name, size),
    logSubmissionComplete: (prevStatus: string, newStatus: string, details?: LogDetails) => 
      logger?.logSubmissionComplete(prevStatus, newStatus, details),
    logError: (action: string, error: string, details?: LogDetails) => 
      logger?.logError(action, error, details)
  };
}