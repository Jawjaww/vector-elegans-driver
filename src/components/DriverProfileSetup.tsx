import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Easing,
  FadeInUp,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { supabase } from "../lib/supabase";
import { showAppAlert } from "./AppDialog";
import { DriverVehicleSection } from "./DriverVehicleSection";
import { computeWizardCompletion, hasDocumentFile, isDocumentUploaded, type DocumentTypeKey } from "../lib/dossierChecklist";
import { resolveAvatarPreviewUrl } from "../lib/avatarPreview";
import {
  ensureActiveDriverId,
  storePickedDriverAvatar,
} from "../lib/avatarUpload";
import {
  getFormExpiryFieldForDocument,
  persistDocumentExpiryIfNeeded,
  useDebouncedExpiryPersist,
  syncUploadedDocumentExpiries,
} from "../lib/documentExpirySync";
import { DriverAvatar } from "./DriverAvatar";
import { FeatherGlyph } from "./FeatherGlyph";
import * as ImagePicker from "expo-image-picker";
import { useDriverSubmissionLogger } from "../lib/services/driverSubmissionLogger";
import {
  useDriverFolderStore,
  useDriverFolderStatus,
} from "../lib/stores/driverFolderStore";
import { DriverFolderStatusBanner } from "./DynamicNotification";
import {
  syncDossierState,
  submitDossier,
  cancelDossierReview,
  listOwnDriverDocuments,
} from "../lib/services/dossierService";
import { isUnsubmittedDossier, normalizeFolderStatus, canShowDossierSubmit } from "../lib/folderStatus";
import {
  canReplaceDocument,
  isProfileEditable,
  resolveDossierEditMode,
  type DossierEditMode,
} from "../lib/dossierEditMode";
import {
  EMPTY_VEHICLE_FORM,
  getOwnPrimaryVehicle,
  upsertOwnPrimaryVehicle,
  type DriverVehicleForm,
} from "../lib/services/vehicleService";
import { VE_BLUE } from "../lib/theme";
import type { FeatherGlyphName } from "../lib/featherGlyphs";
import {
  emptyToNull,
  requiredDriverDate,
  requiredDriverPhone,
  requiredDriverText,
  toFormDate,
  toFormPhone,
  toFormText,
} from "./dossier/dossierDraftPlaceholders";
import type {
  DocumentMetaMap,
  DocumentStatus,
  DriverProfileData,
} from "./dossier/dossierWizardTypes";
import { DossierProgressFill, DossierAccentGradientFill } from "./dossier/DossierProgressFill";
import { DossierProfilSection } from "./dossier/DossierProfilSection";
import { DossierProfessionnelSection } from "./dossier/DossierProfessionnelSection";
import {
  DossierDocumentsSection,
  REQUIRED_DOCUMENTS,
} from "./dossier/DossierDocumentsSection";
import { DossierValidationSection } from "./dossier/DossierValidationSection";
import { DossierWizardFooter } from "./dossier/DossierWizardFooter";

const PROGRESS_BAR_TIMING = {
  duration: 320,
  easing: Easing.out(Easing.cubic),
};

function isApprovedLikeStatus(status: string): boolean {
  return status === "approved" || status === "validated";
}

function isPendingLikeStatus(status: string): boolean {
  return status === "pending_review" || status === "submitted";
}

function nextSectionButtonOpacity(
  currentSection: number,
  lastSectionIndex: number,
  isEditable: boolean,
  canProceed: boolean,
): number {
  if (currentSection === lastSectionIndex) return 0.3;
  if (isEditable && !canProceed) return 0.8;
  return 1;
}

// Champs requis par section
const REQUIRED_FIELDS = {
  profil: [
    "first_name",
    "last_name",
    "phone",
    "date_of_birth",
    "address",
    "city",
    "postal_code",
    "emergency_contact_name",
    "emergency_contact_phone",
  ] as const,
  professionnel: [
    "license_number",
    "driving_license_expiry_date",
    "vtc_card_number",
    "vtc_card_expiry_date",
  ] as const,
};

const FORM_EXPIRY_TO_DOC: Partial<
  Record<keyof DriverProfileData, DocumentTypeKey>
> = {
  driving_license_expiry_date: "driving_license",
  vtc_card_expiry_date: "vtc_card",
};

// Sections du formulaire
const SECTIONS: ReadonlyArray<{
  id: string;
  label: string;
  icon: FeatherGlyphName;
  description: string;
}> = [
  {
    id: "profil",
    label: "Profil",
    icon: "user",
    description: "Informations personnelles",
  },
  {
    id: "professionnel",
    label: "Professionnel",
    icon: "briefcase",
    description: "Cartes et autorisations",
  },
  {
    id: "vehicule",
    label: "Véhicule",
    icon: "truck",
    description: "Immatriculation et modèle",
  },
  {
    id: "documents",
    label: "Documents",
    icon: "file-text",
    description: "Justificatifs à fournir",
  },
  {
    id: "validation",
    label: "Validation",
    icon: "shield",
    description: "Vérification et envoi",
  },
];

function mapSubmitDossierAlert(
  message: string,
  translate: (key: string) => string,
): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("already in review") ||
    lower.includes("déjà en cours de vérification")
  ) {
    return translate("profile.alreadyInReview");
  }
  if (lower.includes("cannot be submitted from current status")) {
    return translate("profile.cannotSubmitCurrentStatus");
  }
  return message;
}

function submitBlockedMessageKey(status: string): string {
  if (status === "suspended") return "profile.folderStatus.suspendedMessage";
  if (status === "on_vacation") return "profile.folderStatus.onVacationMessage";
  if (status === "inactive") return "profile.folderStatus.inactiveMessage";
  if (status === "active") return "profile.folderStatus.validatedNoSubmit";
  return "profile.cannotSubmitCurrentStatus";
}

interface DriverProfileSetupProps {
  onComplete?: () => void;
  /** Leave setup and return to the main map / bottom sheet. */
  onExitToHome?: () => void;
}

export default function DriverProfileSetup({
  onComplete,
  onExitToHome,
}: Readonly<DriverProfileSetupProps>) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentSection, setCurrentSection] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [dossierSynced, setDossierSynced] = useState(false);

  // Dossier state management
  const { status, dossierUpdateRequested, isEditable, opsStatusReason } =
    useDriverFolderStatus();
  const { setStatus, completeSubmission } = useDriverFolderStore();
  const [rejectedDocumentTypes, setRejectedDocumentTypes] = useState<string[]>(
    [],
  );
  const editMode: DossierEditMode = useMemo(
    () =>
      resolveDossierEditMode({
        status,
        dossierUpdateRequested,
        rejectedDocumentTypes,
      }),
    [status, dossierUpdateRequested, rejectedDocumentTypes],
  );
  const profileFieldsEditable = isProfileEditable(editMode) && !submitting;
  const {
    logger,
    logSubmissionStart,
    logProfileUpdate,
    logDocumentUpload,
    logSubmissionComplete,
  } = useDriverSubmissionLogger(driverId, userId);
  const scheduleFormExpirySync = useDebouncedExpiryPersist(450);

  // Valeurs animées
  const sectionProgress = useSharedValue(0);
  const completionProgress = useSharedValue(0);
  const headerOpacity = useSharedValue(0);
  const contentTranslateX = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const fieldOpacity = useSharedValue(0);

  const [formData, setFormData] = useState<DriverProfileData>({
    first_name: "",
    last_name: "",
    phone: "",
    date_of_birth: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    license_number: "",
    driving_license_expiry_date: "",
    vtc_card_number: "",
    vtc_card_expiry_date: "",
    insurance_number: "",
    company_siret: "",
    address: "",
    city: "",
    postal_code: "",
  });
  const [vehicleForm, setVehicleForm] =
    useState<DriverVehicleForm>(EMPTY_VEHICLE_FORM);

  const [documents, setDocuments] = useState<DocumentStatus>({
    driving_license: null,
    vtc_card: null,
    insurance: null,
    id_card: null,
    proof_of_address: null,
  });
  const [documentMeta, setDocumentMeta] = useState<DocumentMetaMap>({});
  const [missingForSubmit, setMissingForSubmit] = useState<string[]>([]);
  const [rpcCompletionPercentage, setRpcCompletionPercentage] = useState(0);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsLoadError, setDocumentsLoadError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const checklistInput = useMemo(
    () => ({
      formData: {
        ...formData,
        license_plate: vehicleForm.license_plate,
      },
      avatarUrl,
      documents,
      documentMeta,
      missingForSubmit,
    }),
    [formData, vehicleForm.license_plate, avatarUrl, documents, documentMeta, missingForSubmit],
  );
  const localCompletionPercentage = useMemo(
    () => computeWizardCompletion(checklistInput).percentage,
    [checklistInput],
  );
  const completionPercentage =
    rpcCompletionPercentage > 0
      ? Math.min(rpcCompletionPercentage, localCompletionPercentage)
      : localCompletionPercentage;

  // Smooth completion % — no spring overshoot
  useEffect(() => {
    completionProgress.value = withTiming(
      Math.min(100, Math.max(0, completionPercentage)) / 100,
      PROGRESS_BAR_TIMING,
    );
  }, [completionPercentage, completionProgress]);

  useEffect(() => {
    let cancelled = false;
    if (!avatarUrl) {
      setAvatarPreviewUri(null);
      return;
    }
    void resolveAvatarPreviewUrl(avatarUrl).then((url: string | null) => {
      if (!cancelled && url) setAvatarPreviewUri(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  // Refresh dossier status when landing on Documents or Validation
  useEffect(() => {
    if ((currentSection !== 3 && currentSection !== 4) || !driverId || !userId) {
      return;
    }
    void syncDossierStateWithBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on section entry only
  }, [currentSection, driverId, userId]);

  // Header fade-in on mount
  useEffect(() => {
    headerOpacity.value = withDelay(200, withTiming(1, { duration: 1000 }));
    fieldOpacity.value = withDelay(400, withTiming(1, { duration: 800 }));
  }, [headerOpacity, fieldOpacity]);

  // Step indicator fill — linear easing, matches section jumps
  useEffect(() => {
    sectionProgress.value = withTiming(
      currentSection / (SECTIONS.length - 1),
      PROGRESS_BAR_TIMING,
    );
    contentTranslateX.value = withTiming(0, { duration: 300 });
  }, [currentSection, sectionProgress, contentTranslateX]);

  // Charger le profil existant
  useEffect(() => {
    const loadExistingProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/(auth)/login");
          return;
        }

        setUserId(user.id);

        const { data: existingDriver, error } = await supabase
          .from("drivers")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (existingDriver && !error) {
          setDriverId(existingDriver.id);
          const folderStatus = normalizeFolderStatus(existingDriver.status);
          if (isUnsubmittedDossier(folderStatus)) {
            useDriverFolderStore.setState({
              status: folderStatus,
              isEditable: true,
              canEditDocuments: true,
            });
          }

          await syncDossierStateWithBackend();
          setFormData({
            first_name: toFormText(existingDriver.first_name),
            last_name: toFormText(existingDriver.last_name),
            phone: toFormPhone(existingDriver.phone),
            date_of_birth: toFormDate(existingDriver.date_of_birth),
            emergency_contact_name: toFormText(
              existingDriver.emergency_contact_name,
            ),
            emergency_contact_phone: toFormPhone(
              existingDriver.emergency_contact_phone,
            ),
            license_number: toFormText(existingDriver.driving_license_number),
            driving_license_expiry_date: toFormDate(
              existingDriver.driving_license_expiry_date,
            ),
            vtc_card_number: toFormText(existingDriver.vtc_card_number),
            vtc_card_expiry_date: toFormDate(
              existingDriver.vtc_card_expiry_date,
            ),
            insurance_number: toFormText(existingDriver.insurance_number),
            company_siret: toFormText(existingDriver.company_siret),
            address: toFormText(existingDriver.address_line1),
            city: toFormText(existingDriver.city),
            postal_code: toFormText(existingDriver.postal_code),
          });
          setAvatarUrl(existingDriver.avatar_url || null);
          const existingVehicle = await getOwnPrimaryVehicle();
          if (existingVehicle) {
            setVehicleForm(existingVehicle);
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      }
    };

    loadExistingProfile();
  }, []);

  // Synchroniser périodiquement l'état du dossier avec le backend
  useEffect(() => {
    if (!driverId || !userId) return;

    // Sync immédiate
    syncDossierStateWithBackend();

    // Sync périodique toutes les 30 secondes
    const interval = setInterval(() => {
      syncDossierStateWithBackend();
    }, 30000);

    return () => clearInterval(interval);
  }, [driverId, userId]);

  // Vérifier les documents existants
  // Load driver documents from DB and populate UI
  const loadDriverDocuments = async () => {
    if (!driverId) return;

    setDocumentsLoading(true);
    setDocumentsLoadError(null);

    try {
      const { rows, error } = await listOwnDriverDocuments(driverId);

      if (error && rows.length === 0) {
        setDocumentsLoadError(t("documents.loadFailedHint"));
        return;
      }

      const nextDocs: DocumentStatus = {
        driving_license: null,
        vtc_card: null,
        insurance: null,
        id_card: null,
        proof_of_address: null,
      };
      const nextMeta: typeof documentMeta = {};

      for (const doc of rows) {
        const key = doc.document_type as keyof DocumentStatus;
        if (!(key in nextDocs)) continue;
        if (nextDocs[key]) continue;
        if (doc.file_url) {
          nextDocs[key] = doc.file_url;
        }
        nextMeta[key] = {
          status: doc.validation_status ?? "pending",
          rejectionReason: doc.rejection_reason ?? null,
          expiryDate: doc.expiry_date ?? null,
        };
      }

      setDocuments(nextDocs);
      setDocumentMeta(nextMeta);
    } catch (error) {
      console.error("Error checking documents:", error);
      setDocumentsLoadError(t("documents.loadFailedHint"));
    } finally {
      setDocumentsLoading(false);
    }
  };

  useEffect(() => {
    loadDriverDocuments();
  }, [driverId]);

  // Styles animés améliorés
  const animatedHeaderStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [
      {
        translateY: interpolate(headerOpacity.value, [0, 1], [-30, 0]),
      },
      {
        scale: interpolate(headerOpacity.value, [0, 1], [0.9, 1]),
      },
    ],
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${sectionProgress.value * 100}%`,
  }));

  const animatedCompletionStyle = useAnimatedStyle(() => ({
    width: `${completionProgress.value * 100}%`,
  }));

  const animatedContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: contentTranslateX.value }],
    opacity: interpolate(
      contentTranslateX.value,
      [-100, 0, 100],
      [0.8, 1, 0.8],
    ),
  }));

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const animatedFieldStyle = useAnimatedStyle(() => ({
    opacity: fieldOpacity.value,
    transform: [
      {
        translateY: interpolate(fieldOpacity.value, [0, 1], [20, 0]),
      },
    ],
  }));

  const handleInputChange = (field: keyof DriverProfileData, value: string) => {
    // Vérifier si le dossier peut être modifié
    if (!profileFieldsEditable) {
      showAppAlert(
        t("profile.cannotEdit"),
        t("profile.submittedProfileLocked"),
      );
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: value }));

    const linkedDocType = FORM_EXPIRY_TO_DOC[field];
    if (linkedDocType && driverId) {
      const ymd = value.trim().slice(0, 10);
      if (
        hasDocumentFile(linkedDocType, documents, documentMeta) &&
        ymd.length >= 10
      ) {
        setDocumentMeta((prev) => ({
          ...prev,
          [linkedDocType]: {
            ...prev[linkedDocType],
            expiryDate: ymd,
          },
        }));
        scheduleFormExpirySync(() => {
          void persistDocumentExpiryIfNeeded(t, {
            driverId,
            documentType: linkedDocType,
            expiryDate: ymd,
            hasDocument: true,
            editMode,
            validationStatus: documentMeta[linkedDocType]?.status,
            rejectedDocumentTypes,
            serverExpiryDate: documentMeta[linkedDocType]?.expiryDate,
          });
        });
      }
    }

    // Log la mise à jour du profil
    if (logger) {
      const section = REQUIRED_FIELDS.profil.includes(field as any)
        ? "profil"
        : "professionnel";
      logProfileUpdate(section, field as string, completionPercentage);
    }
  };

  const handleDocumentExpiryChange = (
    documentType: string,
    expiryDate: string,
  ) => {
    const key = documentType as DocumentTypeKey;
    const ymd = expiryDate.trim().slice(0, 10);
    setDocumentMeta((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        expiryDate: ymd || null,
      },
    }));
    const formField = getFormExpiryFieldForDocument(documentType);
    if (formField) {
      setFormData((prev) => ({
        ...prev,
        [formField]: ymd,
      }));
    }
  };

  const handleDocumentUpload = (
    documentType: string,
    fileUrl: string,
    expiryDate?: string,
  ) => {
    const key = documentType as keyof DocumentStatus;
    const canReplaceDoc = canReplaceDocument(
      editMode,
      documentType,
      documentMeta[key]?.status,
      rejectedDocumentTypes,
    );
    if (!canReplaceDoc) {
      showAppAlert(
        t("profile.cannotEdit"),
        t("profile.submittedProfileLocked"),
      );
      return;
    }

    setDocuments((prev) => ({
      ...prev,
      [key]: fileUrl,
    }));
    setDocumentMeta((prev) => ({
      ...prev,
      [key]: {
        status: "pending",
        rejectionReason: null,
        expiryDate: expiryDate ?? prev[key]?.expiryDate ?? null,
      },
    }));
    if (expiryDate) {
      const formField = getFormExpiryFieldForDocument(documentType);
      if (formField) {
        setFormData((prev) => ({
          ...prev,
          [formField]: expiryDate.slice(0, 10),
        }));
      }
    }
    void (async () => {
      await syncDossierStateWithBackend();
      await loadDriverDocuments();
    })();

    if (logger) {
      logDocumentUpload(documentType, fileUrl, 0);
    }
  };

  // Profile/vehicle fields follow edit mode; document replace has its own rules.
  const isFieldEditable = () => profileFieldsEditable;

  // Synchroniser l'état du dossier avec le backend
  const syncDossierStateWithBackend = async () => {
    if (!driverId || !userId) return null;

    try {
      const syncedState = await syncDossierState(driverId, userId);
      if (syncedState) {
        useDriverFolderStore.setState({
          status: syncedState.status,
          dossierUpdateRequested: syncedState.dossierUpdateRequested,
          isEditable: syncedState.isEditable,
          canSubmit: syncedState.canSubmit,
          canEditDocuments: syncedState.canEditDocuments,
          rejectionReason: syncedState.rejectionReason,
          rejectedAt: syncedState.rejectedAt,
          opsStatusReason: syncedState.opsStatusReason,
        });
        setRejectedDocumentTypes(syncedState.rejectedDocumentTypes ?? []);
        setMissingForSubmit(syncedState.missingForSubmit ?? []);
        setRpcCompletionPercentage(syncedState.completionPercentage ?? 0);
        setDossierSynced(true);
        await loadDriverDocuments();
      }
      return syncedState;
    } catch (error) {
      console.error("Erreur lors de la synchronisation du dossier:", error);
      return null;
    }
  };

  const persistDriverRow = async (): Promise<string | false> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showAppAlert(t("common.error"), t("auth.userNotFound"));
        return false;
      }

      // Required CHECK columns must never be NULL; optional fields use emptyToNull.
      const driverData = {
        user_id: user.id,
        first_name: requiredDriverText(formData.first_name),
        last_name: requiredDriverText(formData.last_name),
        phone: requiredDriverPhone(formData.phone),
        date_of_birth: emptyToNull(formData.date_of_birth),
        emergency_contact_name: emptyToNull(formData.emergency_contact_name),
        emergency_contact_phone: emptyToNull(formData.emergency_contact_phone),
        driving_license_number: requiredDriverText(formData.license_number),
        driving_license_expiry_date: requiredDriverDate(
          formData.driving_license_expiry_date,
        ),
        vtc_card_number: requiredDriverText(formData.vtc_card_number),
        vtc_card_expiry_date: requiredDriverDate(formData.vtc_card_expiry_date),
        insurance_number: emptyToNull(formData.insurance_number),
        company_siret: emptyToNull(formData.company_siret),
        address_line1: emptyToNull(formData.address),
        city: emptyToNull(formData.city),
        postal_code: emptyToNull(formData.postal_code),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        updated_at: new Date().toISOString(),
      };

      if (driverId) {
        const { user_id: _userId, ...updateData } = driverData;
        const { error } = await supabase
          .from("drivers")
          .update(updateData)
          .eq("id", driverId);
        if (error) {
          showAppAlert(t("common.error"), error.message);
          return false;
        }
        return driverId;
      }

      const { data: newDriver, error } = await supabase
        .from("drivers")
        .insert([{ ...driverData, status: "draft" as const }])
        .select()
        .single();

      if (error) {
        showAppAlert(t("common.error"), error.message);
        return false;
      }

      if (newDriver) {
        setDriverId(newDriver.id);
        return newDriver.id;
      }

      return false;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("common.error");
      showAppAlert(t("common.error"), message);
      return false;
    }
  };

  const handleSave = async (
    options?: { silent?: boolean; syncExpiries?: boolean },
  ): Promise<string | false> => {
    const savedId = await persistDriverRow();
    if (!savedId) return false;

    if (options?.syncExpiries && editMode !== "locked") {
      await syncUploadedDocumentExpiries(t, savedId, checklistInput, {
        editMode,
        rejectedDocumentTypes,
        silent: options.silent,
      });
    }

    if (!options?.silent) {
      showAppAlert(t("common.success"), t("profile.profileSaved"));
    }
    return savedId;
  };

  const saveVehicle = async (options?: { force?: boolean }): Promise<boolean> => {
    if (!options?.force && !isFieldEditable()) return true;
    const result = await upsertOwnPrimaryVehicle(vehicleForm);
    if (!result.success) {
      const message =
        result.error === "license_plate_taken"
          ? t("profile.licensePlateTaken")
          : (result.error ?? t("profile.vehicleSaveFailed"));
      showAppAlert(t("common.error"), message);
      return false;
    }
    return true;
  };

  const finishSuccessfulSubmit = async (normalizedStatus: string) => {
    if (isApprovedLikeStatus(normalizedStatus)) {
      completeSubmission(true);
      showAppAlert(t("profile.success"), t("profile.profileSubmitted"));
      if (logger) {
        await logSubmissionComplete("submitting", "validated", {
          validation_result: "approved",
          completion_percentage: completionPercentage,
        });
      }
      return;
    }

    if (isPendingLikeStatus(normalizedStatus)) {
      completeSubmission(true);
      showAppAlert(
        t("profile.submissionPendingTitle"),
        t("profile.submissionPendingMessage"),
      );
      if (logger) {
        await logSubmissionComplete("submitting", "submitted", {
          validation_result: "pending",
          completion_percentage: completionPercentage,
        });
      }
    }
  };

  const alertMissingForSubmit = (missingForSubmit?: string[] | null) => {
    const missing = missingForSubmit?.length
      ? `\n\n• ${missingForSubmit.slice(0, 8).join("\n• ")}`
      : "";
    showAppAlert(
      t("profile.incomplete"),
      `${t("profile.completeAllFields")}${missing}`,
    );
  };

  const handleSubmitFailure = async (error: unknown) => {
    const message =
      error instanceof Error ? error.message : t("common.error");
    if (logger && driverId) {
      await logger.logError("submission", message, {
        completion_percentage: completionPercentage,
      });
    }

    const synced = await syncDossierStateWithBackend();
    if (!synced) {
      const serverLooksPending =
        message.toLowerCase().includes("already in review") ||
        message.toLowerCase().includes("déjà en cours de vérification");
      setStatus(serverLooksPending ? "pending_review" : "draft");
    }
    completeSubmission(false, message);
    showAppAlert(t("common.error"), mapSubmitDossierAlert(message, t));
  };

  const handleSubmit = async () => {
    if (!canShowDossierSubmit(status, dossierUpdateRequested) || !isEditable) {
      showAppAlert(
        t("profile.cannotEdit"),
        t(submitBlockedMessageKey(status)),
      );
      return;
    }

    setSubmitting(true);

    try {
      const savedDriverId = await handleSave({
        silent: true,
        syncExpiries: true,
      });
      if (!savedDriverId) return;
      const vehicleSaved = await saveVehicle({ force: true });
      if (!vehicleSaved) return;

      const syncedState = await syncDossierStateWithBackend();
      if (!syncedState?.canSubmit) {
        alertMissingForSubmit(syncedState?.missingForSubmit);
        return;
      }

      if (logger) {
        await logSubmissionStart();
      }

      setStatus("submitting");

      if (!userId || !driverId) return;

      const result = await submitDossier(driverId, userId);
      if (!result.success) {
        throw new Error(result.message);
      }

      await finishSuccessfulSubmit((result.new_status || "").toLowerCase());

      if (onComplete) {
        onComplete();
      } else {
        router.replace("/(tabs)");
      }
    } catch (error: unknown) {
      await handleSubmitFailure(error);
    } finally {
      setSubmitting(false);
    }
  };

  // Withdraw pending_review → draft via RPC (direct UPDATE is blocked / unreliable).
  const handleCancelSubmission = async () => {
    if (!driverId || !userId) return;
    try {
      const result = await cancelDossierReview(driverId, userId);
      if (!result.success) {
        showAppAlert(
          t("common.error"),
          result.message || t("profile.cannotCancelSubmission"),
        );
        return;
      }

      useDriverFolderStore.setState({
        status: "draft",
        dossierUpdateRequested: false,
        isEditable: true,
        canSubmit: true,
        canEditDocuments: true,
      });
      setRejectedDocumentTypes([]);
      await syncDossierStateWithBackend();
      showAppAlert(t("common.success"), t("profile.submissionCancelled"));
    } catch (e) {
      console.error("handleCancelSubmission exception", e);
      showAppAlert(t("common.error"), t("profile.cannotCancelSubmission"));
    }
  };

  const canProceedToNext = () => {
    console.log("canProceedToNext called, currentSection:", currentSection);

    let canProceed = false;
    switch (currentSection) {
      case 0: // Profil
        canProceed = REQUIRED_FIELDS.profil.every((field) => {
          const hasValue = formData[field]?.trim() !== "";
          console.log(`Field ${field}: ${hasValue ? "filled" : "empty"}`);
          return hasValue;
        });
        break;
      case 1: // Professionnel
        canProceed = REQUIRED_FIELDS.professionnel.every((field) => {
          const hasValue = formData[field]?.trim() !== "";
          console.log(`Field ${field}: ${hasValue ? "filled" : "empty"}`);
          return hasValue;
        });
        break;
      case 2: // Véhicule
        canProceed =
          vehicleForm.make.trim() !== "" &&
          vehicleForm.model.trim() !== "" &&
          vehicleForm.license_plate.trim() !== "";
        break;
      case 3: // Documents
        canProceed = REQUIRED_DOCUMENTS.every((docType) =>
          isDocumentUploaded(
            docType as DocumentTypeKey,
            documents,
            documentMeta,
          ),
        );
        console.log("Documents status:", documents);
        console.log("All documents uploaded:", canProceed);
        break;
      default:
        canProceed = true;
    }

    console.log("canProceedToNext result:", canProceed);
    return canProceed;
  };

  const changeSection = (newSection: number) => {
    setCurrentSection(newSection);
  };

  const navigateToSection = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= SECTIONS.length) return;
    if (targetIndex === currentSection) return;

    const goingForward = targetIndex > currentSection;
    const exitX = goingForward ? -100 : 100;

    buttonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 }),
    );

    contentTranslateX.value = withTiming(exitX, { duration: 200 }, () => {
      scheduleOnRN(changeSection, targetIndex);
      contentTranslateX.value = withTiming(0, { duration: 200 });
    });
  };

  const nextSection = async () => {
    if (currentSection >= SECTIONS.length - 1) {
      return;
    }

    if (!dossierSynced) {
      await syncDossierStateWithBackend();
    }

    // Persist driver row only — never touch driver_documents expiry on Next.
    if (currentSection <= 1 && isFieldEditable()) {
      const savedDriverId = await persistDriverRow();
      if (savedDriverId) {
        await syncDossierStateWithBackend();
      }
    }

    if (currentSection === 2 && isFieldEditable()) {
      const saved = await saveVehicle();
      if (saved) {
        await syncDossierStateWithBackend();
      }
    }

    // Leaving Documents → Validation: refresh % and missing list from RPC
    if (currentSection === 3) {
      await syncDossierStateWithBackend();
    }

    buttonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 }),
    );

    contentTranslateX.value = withTiming(-100, { duration: 200 }, () => {
      scheduleOnRN(changeSection, currentSection + 1);
      contentTranslateX.value = withTiming(0, { duration: 200 });
    });
  };

  const prevSection = () => {
    if (currentSection > 0) {
      // Effet de scale sur le bouton
      buttonScale.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withTiming(1, { duration: 100 }),
      );

      contentTranslateX.value = withTiming(100, { duration: 200 }, () => {
        scheduleOnRN(changeSection, currentSection - 1);
        contentTranslateX.value = withTiming(0, { duration: 200 });
      });
    }
  };

  const alertEnsureDriverFailure = (
    error: "no-user" | "ensure-failed",
    detail?: string,
  ) => {
    if (error === "no-user") {
      showAppAlert(t("common.error"), t("auth.userNotFound"));
      return;
    }
    showAppAlert(t("documents.error"), detail ?? t("profile.draftSaveFailed"));
  };

  const uploadAvatar = async () => {
    if (!isFieldEditable()) return;
    let previousPreview = avatarPreviewUri;
    try {
      const ready = await ensureActiveDriverId(driverId, userId);
      if ("error" in ready) {
        alertEnsureDriverFailure(ready.error, ready.detail);
        return;
      }
      if (ready.id !== driverId) setDriverId(ready.id);

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAppAlert(t("documents.error"), t("documents.pickFailed"));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;

      setUploadingAvatar(true);
      previousPreview = avatarPreviewUri;
      setAvatarPreviewUri(result.assets[0].uri);

      const stored = await storePickedDriverAvatar({
        driverId: ready.id,
        userId,
        uri: result.assets[0].uri,
      });
      if ("error" in stored) {
        setAvatarPreviewUri(previousPreview);
        showAppAlert(t("documents.error"), stored.error);
        return;
      }

      setAvatarUrl(stored.path);
      await syncDossierStateWithBackend();
    } catch (e) {
      setAvatarPreviewUri(previousPreview);
      showAppAlert(
        t("documents.error"),
        e instanceof Error ? e.message : t("documents.failedToUpload"),
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const confirmCancelReview = (messageKey: string) => {
    showAppAlert(t("common.confirm"), t(messageKey), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.ok"),
        onPress: async () => await handleCancelSubmission(),
      },
    ]);
  };

  const handleSaveProgress = async () => {
    const savedDriverId = await handleSave({
      silent: true,
      syncExpiries: true,
    });
    if (!savedDriverId) return;
    await saveVehicle();
    await syncDossierStateWithBackend();
    showAppAlert(t("common.success"), t("profile.profileSaved"));
  };

  const renderSectionContent = () => {
    if (currentSection === 0) {
      return (
        <DossierProfilSection
          formData={formData}
          onChange={handleInputChange}
          fieldsEditable={isFieldEditable()}
          animatedContentStyle={animatedContentStyle}
          animatedFieldStyle={animatedFieldStyle}
          avatarPreviewUri={avatarPreviewUri}
          avatarUrl={avatarUrl}
          uploadingAvatar={uploadingAvatar}
          onUploadAvatar={() => void uploadAvatar()}
        />
      );
    }
    if (currentSection === 1) {
      return (
        <DossierProfessionnelSection
          formData={formData}
          onChange={handleInputChange}
          fieldsEditable={isFieldEditable()}
          animatedContentStyle={animatedContentStyle}
        />
      );
    }
    if (currentSection === 2) {
      return (
        <DriverVehicleSection
          form={vehicleForm}
          editable={isFieldEditable()}
          onChange={(patch) => setVehicleForm((prev) => ({ ...prev, ...patch }))}
          contentStyle={animatedContentStyle}
        />
      );
    }
    if (currentSection === 3) {
      return (
        <DossierDocumentsSection
          animatedContentStyle={animatedContentStyle}
          documents={documents}
          documentMeta={documentMeta}
          documentsLoading={documentsLoading}
          documentsLoadError={documentsLoadError}
          driverId={driverId}
          submitting={submitting}
          editMode={editMode}
          rejectedDocumentTypes={rejectedDocumentTypes}
          onUploadComplete={handleDocumentUpload}
          onExpiryDateChange={handleDocumentExpiryChange}
        />
      );
    }
    if (currentSection === 4) {
      return (
        <DossierValidationSection
          animatedContentStyle={animatedContentStyle}
          animatedCompletionStyle={animatedCompletionStyle}
          completionPercentage={completionPercentage}
          checklistInput={checklistInput}
          status={status}
          opsStatusReason={opsStatusReason}
          dossierUpdateRequested={dossierUpdateRequested}
          actions={
            <DossierWizardFooter
              status={status}
              dossierUpdateRequested={dossierUpdateRequested}
              submitting={submitting}
              isEditable={isEditable}
              onSubmit={() => void handleSubmit()}
              onConfirmCancelReview={confirmCancelReview}
              onSaveProgress={() => void handleSaveProgress()}
            />
          }
        />
      );
    }
    return null;
  };



  return (
    <View className="flex-1 bg-black">
      {onExitToHome ? (
        <Pressable
          onPress={onExitToHome}
          accessibilityRole="button"
          accessibilityLabel={t("profile.backToHome")}
          className="absolute z-20 flex-row items-center rounded-full border border-white/20 bg-white/10 px-3 py-2"
          style={{ top: insets.top + 8, left: 16 }}
        >
          <FeatherGlyph name="map" size={16} />
          <Text className="text-white text-xs font-semibold ml-2">
            {t("profile.backToHome")}
          </Text>
        </Pressable>
      ) : null}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top + 16,
            paddingBottom: 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="py-10">
            {/* Header animé */}
            <Animated.View
              style={animatedHeaderStyle}
              className="items-center mb-8"
            >
              <DriverAvatar
                uri={avatarPreviewUri}
                size={80}
                className="mb-4"
              />
              <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-2 text-center">
                {t("profile.setupTitle")}
              </Text>
              <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase text-center">
                {SECTIONS[currentSection].description}
              </Text>

              {/* Barre de progression animée */}
              <View className="w-full mt-6">
                <View className="flex-row justify-between mb-2">
                  {SECTIONS.map((section, index) => {
                    const isActive = index === currentSection;
                    const isReached = index <= currentSection;
                    return (
                      <Pressable
                        key={section.id}
                        onPress={() => navigateToSection(index)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        className="items-center flex-1"
                      >
                        <View
                          className={`w-8 h-8 rounded-full items-center justify-center ${
                            isActive ? "border-2 border-white/50" : ""
                          }`}
                          style={{
                            backgroundColor: isReached
                              ? `${VE_BLUE.base}${VE_BLUE.tintAlpha}`
                              : "rgba(255, 255, 255, 0.2)",
                          }}
                        >
                          <FeatherGlyph
                            name={section.icon}
                            size={16}
                            color={isReached ? undefined : "#9ca3af"}
                          />
                        </View>
                        <Text
                          className={`text-xs mt-1 text-center ${
                            isActive ? "text-white font-semibold" : "text-slate-400"
                          }`}
                        >
                          {section.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Banner de statut du dossier */}
                <DriverFolderStatusBanner />
                <View className="bg-white/15 rounded-full h-1 mt-2 overflow-hidden">
                  <DossierProgressFill
                    animatedStyle={animatedProgressStyle}
                    height={4}
                  />
                </View>
              </View>
            </Animated.View>

            {/* Contenu de la section avec animation */}
            <View className="mx-6 pb-10">{renderSectionContent()}</View>

            {/* Boutons de navigation animés */}
            <Animated.View
              entering={FadeInUp.duration(600).delay(600)}
              className="flex-row justify-between mx-6"
            >
              <Animated.View style={animatedButtonStyle}>
                <Pressable
                  onPress={prevSection}
                  disabled={currentSection === 0}
                  className={`flex-row items-center py-3 px-6 rounded-full ${
                    currentSection === 0 ? "opacity-30" : "opacity-100"
                  }`}
                >
                  <Feather name="arrow-left" size={16} color="white" />
                  <Text className="text-white ml-2">
                    {t("common.previous")}
                  </Text>
                </Pressable>
              </Animated.View>

              <Animated.View style={animatedButtonStyle}>
                <Pressable
                  onPress={nextSection}
                  disabled={currentSection === SECTIONS.length - 1}
                  className="flex-row items-center py-3 px-6 rounded-full overflow-hidden"
                  style={{
                    opacity: nextSectionButtonOpacity(
                      currentSection,
                      SECTIONS.length - 1,
                      isEditable,
                      canProceedToNext(),
                    ),
                  }}
                >
                  <DossierAccentGradientFill />
                  <Text className="text-white mr-2">{t("common.next")}</Text>
                  <Feather name="arrow-right" size={16} color="white" />
                </Pressable>
              </Animated.View>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
