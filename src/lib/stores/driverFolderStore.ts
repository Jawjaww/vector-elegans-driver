/**
 * Store Zustand pour la gestion d'état des dossiers conducteurs
 * Aligné sur drivers.status / RPCs get_driver_dossier_status & submit_driver_dossier
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DriverStatus } from "../types/database.types";

/** UI + RPC dossier statuses (subset / aliases of driver_status) */
export type DriverFolderStatus =
  | "draft"
  | "submitting"
  | "pending_review"
  | "active"
  | "rejected"
  | "locked"
  // Legacy aliases kept for persisted AsyncStorage / older builds
  | "submitted"
  | "validated"
  | "incomplete"
  | "pending_validation";

export function normalizeFolderStatus(
  status: string | null | undefined,
): DriverFolderStatus {
  const s = (status || "draft").toLowerCase();
  if (s === "submitted" || s === "pending_validation") return "pending_review";
  if (s === "validated" || s === "approved") return "active";
  if (s === "incomplete") return "draft";
  if (
    s === "draft" ||
    s === "submitting" ||
    s === "pending_review" ||
    s === "active" ||
    s === "rejected" ||
    s === "locked"
  ) {
    return s;
  }
  return "draft";
}

export interface DriverNotification {
  id: string;
  type: "info" | "success" | "warning" | "error";
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
  status: DriverFolderStatus;
  submittedAt: string | null;
  validatedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  isEditable: boolean;
  canSubmit: boolean;
  canEditDocuments: boolean;
  notifications: DriverNotification[];
  unreadCount: number;
  recentLogs: any[];
  setStatus: (status: DriverFolderStatus | DriverStatus | string) => void;
  setSubmissionTimestamp: (timestamp: string) => void;
  setValidationTimestamp: (timestamp: string) => void;
  setRejection: (reason: string, timestamp: string) => void;
  addNotification: (
    notification: Omit<DriverNotification, "id" | "timestamp" | "read">,
  ) => void;
  markNotificationAsRead: (notificationId: string) => void;
  clearNotifications: () => void;
  updatePermissions: () => void;
  completeSubmission: (success: boolean, error?: string) => void;
  resetFolder: () => void;
}

const initialState = {
  status: "draft" as DriverFolderStatus,
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
        set({ status: normalizeFolderStatus(status) });
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
          status: "rejected",
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

        set((state) => ({
          notifications: [newNotification, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }));
      },

      markNotificationAsRead: (notificationId) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n,
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }));
      },

      clearNotifications: () => {
        set({ notifications: [], unreadCount: 0 });
      },

      updatePermissions: () => {
        const status = normalizeFolderStatus(get().status);
        const isEditable = status === "draft" || status === "rejected";
        const canSubmit = status === "draft" || status === "rejected";
        const canEditDocuments = status === "draft" || status === "rejected";

        set({
          status,
          isEditable,
          canSubmit,
          canEditDocuments,
        });
      },

      completeSubmission: (success, error) => {
        const newStatus: DriverFolderStatus = success
          ? "pending_review"
          : "draft";
        const submittedAt = success ? new Date().toISOString() : null;

        set({
          status: newStatus,
          submittedAt,
          isEditable: !success,
          canSubmit: false,
          canEditDocuments: !success,
        });

        if (success) {
          get().addNotification({
            type: "success",
            title: "Dossier soumis",
            message:
              "Votre dossier a été soumis avec succès et est en cours de validation.",
          });
          set((state) => ({
            notifications: state.notifications.filter((n) => {
              const txt = (
                (n.title || "") +
                " " +
                (n.message || "")
              ).toLowerCase();
              return !txt.includes("incomplet") && !txt.includes("incomplete");
            }),
          }));
        } else if (error) {
          get().addNotification({
            type: "error",
            title: "Erreur de soumission",
            message: error,
          });
        }
      },

      resetFolder: () => {
        set({ ...initialState, notifications: [], unreadCount: 0 });
      },
    }),
    {
      name: "driver-folder-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        status: state.status,
        submittedAt: state.submittedAt,
        validatedAt: state.validatedAt,
        rejectedAt: state.rejectedAt,
        rejectionReason: state.rejectionReason,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setStatus(normalizeFolderStatus(state.status));
        }
      },
    },
  ),
);

export function useDriverFolderStatus() {
  const {
    status,
    isEditable,
    canSubmit,
    canEditDocuments,
    submittedAt,
    validatedAt,
    rejectedAt,
    rejectionReason,
  } = useDriverFolderStore();

  const normalized = normalizeFolderStatus(status);

  return {
    status: normalized,
    isEditable,
    canSubmit,
    canEditDocuments,
    submittedAt,
    validatedAt,
    rejectedAt,
    rejectionReason,
  };
}

export function useDriverNotifications() {
  const {
    notifications,
    unreadCount,
    markNotificationAsRead,
    clearNotifications,
    addNotification,
  } = useDriverFolderStore();
  return {
    notifications,
    unreadCount,
    markNotificationAsRead,
    clearNotifications,
    addNotification,
  };
}
