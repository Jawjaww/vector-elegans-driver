/**
 * Store Zustand pour la gestion d'état des dossiers conducteurs
 * Gère le statut, les permissions, les notifications et les logs
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DriverFolderStatus =
  | 'draft'           // Brouillon - édition autorisée
  | 'submitting'      // En cours de soumission
  | 'submitted'       // Soumis - en attente de validation
  | 'validated'       // Validé - accepté
  | 'rejected'        // Rejeté - nécessite des modifications
  | 'locked';         // Verrouillé - lecture seule

export interface DriverNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export interface DriverFolderState {
  // État du dossier
  status: DriverFolderStatus;
  submittedAt: string | null;
  validatedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  
  // Permissions
  isEditable: boolean;
  canSubmit: boolean;
  canEditDocuments: boolean;
  
  // Notifications
  notifications: DriverNotification[];
  unreadCount: number;
  
  // Logs
  recentLogs: any[];
  
  // Actions
  setStatus: (status: DriverFolderStatus) => void;
  setSubmissionTimestamp: (timestamp: string) => void;
  setValidationTimestamp: (timestamp: string) => void;
  setRejection: (reason: string, timestamp: string) => void;
  addNotification: (notification: Omit<DriverNotification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationAsRead: (notificationId: string) => void;
  clearNotifications: () => void;
  updatePermissions: () => void;
  completeSubmission: (success: boolean, error?: string) => void;
  resetFolder: () => void;
}

const initialState = {
  status: 'draft' as DriverFolderStatus,
  submittedAt: null,
  validatedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  isEditable: true,
  canSubmit: true,
  canEditDocuments: true,
  notifications: [],
  unreadCount: 0,
  recentLogs: [],
};

export const useDriverFolderStore = create<DriverFolderState>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      setStatus: (status) => {
        set({ status });
        // Mettre à jour les permissions automatiquement
        get().updatePermissions();
      },
      
      setSubmissionTimestamp: (timestamp) => {
        set({ submittedAt: timestamp });
      },
      
      setValidationTimestamp: (timestamp) => {
        set({ validatedAt: timestamp });
        get().updatePermissions();
      },
      
      setRejection: (reason, timestamp) => {
        set({ 
          rejectedAt: timestamp,
          rejectionReason: reason,
          status: 'rejected'
        });
        get().updatePermissions();
      },
      
      addNotification: (notification) => {
        const newNotification: DriverNotification = {
          ...notification,
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          read: false,
        };
        
        set(state => ({
          notifications: [newNotification, ...state.notifications],
          unreadCount: state.unreadCount + 1
        }));
      },
      
      markNotificationAsRead: (notificationId) => {
        set(state => ({
          notifications: state.notifications.map(n =>
            n.id === notificationId ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1)
        }));
      },
      
      clearNotifications: () => {
        set({ notifications: [], unreadCount: 0 });
      },
      
      updatePermissions: () => {
        const { status } = get();
        
        // Définir les permissions basées sur le statut
        const isEditable = status === 'draft' || status === 'rejected';
        const canSubmit = status === 'draft' || status === 'rejected';
        const canEditDocuments = status === 'draft' || status === 'rejected';
        
        set({
          isEditable,
          canSubmit,
          canEditDocuments
        });
      },
      
      completeSubmission: (success, error) => {
        const newStatus = success ? 'submitted' : 'draft';
        const submittedAt = success ? new Date().toISOString() : null;
        
        set({
          status: newStatus,
          submittedAt,
          isEditable: !success,
          canSubmit: false
        });
        
        if (success) {
          // Ajouter une notification de succès
          get().addNotification({
            type: 'success',
            title: 'Dossier soumis',
            message: 'Votre dossier a été soumis avec succès et est en cours de validation.',
          });
        } else {
          // Ajouter une notification d'erreur
          get().addNotification({
            type: 'error',
            title: 'Erreur de soumission',
            message: error || 'Une erreur est survenue lors de la soumission.',
          });
        }
      },
      
      resetFolder: () => {
        set(initialState);
      },
    }),
    {
      name: 'driver-folder-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        status: state.status,
        submittedAt: state.submittedAt,
        validatedAt: state.validatedAt,
        rejectedAt: state.rejectedAt,
        rejectionReason: state.rejectionReason,
        notifications: state.notifications,
        unreadCount: state.unreadCount,
      })
    }
  )
);

/**
 * Hook pour accéder facilement aux notifications
 */
export function useDriverNotifications() {
  const { notifications, unreadCount, markNotificationAsRead, addNotification } = useDriverFolderStore();
  
  return {
    notifications,
    unreadCount,
    markNotificationAsRead,
    addNotification
  };
}

/**
 * Hook pour accéder au statut du dossier
 */
export function useDriverFolderStatus() {
  const { status, isEditable, canSubmit, canEditDocuments, submittedAt, validatedAt, rejectedAt, rejectionReason } = useDriverFolderStore();
  
  return {
    status,
    isEditable,
    canSubmit,
    canEditDocuments,
    submittedAt,
    validatedAt,
    rejectedAt,
    rejectionReason
  };
}