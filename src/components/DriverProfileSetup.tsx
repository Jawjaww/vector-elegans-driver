import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  interpolate,
  FadeInRight,
  FadeOutLeft,
  FadeInUp,
  FadeInDown,
  FadeIn,
  BounceIn,
  FlipInEasyX,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { supabase } from "../lib/supabase";
import { DriverDocumentUploader } from "./DriverDocumentUploader";
import { DossierValidationChecklist } from "./DossierValidationChecklist";
import { DriverVehicleSection } from "./DriverVehicleSection";
import {
  computeWizardCompletion,
  hasDocumentFile,
  isDocumentUploaded,
  type DocumentTypeKey,
} from "../lib/dossierChecklist";
import { resolveAvatarPreviewUrl } from "../lib/avatarPreview";
import { DriverAvatar } from "./DriverAvatar";
import { NativeDateField } from "./NativeDateField";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
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
  ensureDriverProfile,
  listOwnDriverDocuments,
} from "../lib/services/dossierService";
import { isUnsubmittedDossier, normalizeFolderStatus } from "../lib/folderStatus";
import {
  EMPTY_VEHICLE_FORM,
  getOwnPrimaryVehicle,
  upsertOwnPrimaryVehicle,
  type DriverVehicleForm,
} from "../lib/services/vehicleService";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

function avatarButtonLabel(
  uploading: boolean,
  hasAvatar: boolean,
  labels: { uploading: string; ready: string; upload: string },
): string {
  if (uploading) return labels.uploading;
  if (hasAvatar) return labels.ready;
  return labels.upload;
}

/** Reanimated NativeWind gradients are ignored — paint the fill with LinearGradient. */
function EmeraldProgressFill({
  animatedStyle,
  height,
}: Readonly<{
  animatedStyle: StyleProp<ViewStyle>;
  height: number;
}>) {
  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          height,
          borderRadius: 9999,
          overflow: "hidden",
          backgroundColor: "#10b981",
        },
      ]}
    >
      <LinearGradient
        colors={["#10b981", "#2dd4bf"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height, width: "100%" }}
      />
    </Animated.View>
  );
}

function isApprovedLikeStatus(status: string): boolean {
  return status === "approved" || status === "validated";
}

function isPendingLikeStatus(status: string): boolean {
  return status === "pending_review" || status === "submitted";
}

function nextSectionButtonClass(
  currentSection: number,
  lastSectionIndex: number,
  isEditable: boolean,
  canProceed: boolean,
): string {
  const base = "flex-row items-center py-3 px-6 rounded-full bg-emerald-500";
  if (currentSection === lastSectionIndex) return `${base} opacity-30`;
  if (isEditable && !canProceed) return `${base} opacity-80`;
  return `${base} opacity-100`;
}

// Structure des données du profil
interface DriverProfileData {
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  license_number: string;
  driving_license_expiry_date: string;
  vtc_card_number: string;
  vtc_card_expiry_date: string;
  insurance_number: string;
  company_siret: string;
  address: string;
  city: string;
  postal_code: string;
}

// Statut des documents
interface DocumentStatus {
  driving_license: string | null;
  vtc_card: string | null;
  insurance: string | null;
  id_card: string | null;
  proof_of_address: string | null;
}

const emptyToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** DB CHECK placeholders — treated as empty in the form and by completeness RPCs. */
const DRAFT_PLACEHOLDER_TEXT = "À compléter";
const DRAFT_PLACEHOLDER_PHONE = "+00000000000";
const DRAFT_PLACEHOLDER_DATE = "2099-12-31";

const isPlaceholderText = (value: string | null | undefined): boolean =>
  !value || value === DRAFT_PLACEHOLDER_TEXT;

const isPlaceholderPhone = (value: string | null | undefined): boolean =>
  !value ||
  value === DRAFT_PLACEHOLDER_TEXT ||
  value === DRAFT_PLACEHOLDER_PHONE;

const isPlaceholderDate = (value: string | null | undefined): boolean =>
  !value || value === DRAFT_PLACEHOLDER_DATE;

const toFormText = (value: string | null | undefined): string =>
  isPlaceholderText(value) ? "" : (value ?? "");

const toFormPhone = (value: string | null | undefined): string =>
  isPlaceholderPhone(value) ? "" : (value ?? "");

const toFormDate = (value: string | null | undefined): string =>
  isPlaceholderDate(value) ? "" : (value ?? "");

/** Never NULL — satisfies drivers.required_fields and related CHECK constraints. */
const requiredDriverText = (value: string): string => {
  const trimmed = value.trim();
  return trimmed === "" ? DRAFT_PLACEHOLDER_TEXT : trimmed;
};

const requiredDriverPhone = (value: string): string => {
  const trimmed = value.trim();
  return trimmed === "" ? DRAFT_PLACEHOLDER_PHONE : trimmed;
};

const requiredDriverDate = (value: string): string => {
  const trimmed = value.trim();
  return trimmed === "" ? DRAFT_PLACEHOLDER_DATE : trimmed;
};

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

// Documents requis
const REQUIRED_DOCUMENTS: (keyof DocumentStatus)[] = [
  "driving_license",
  "vtc_card",
  "insurance",
  "id_card",
  "proof_of_address",
];

// Labels des documents
const DOC_LABELS: Record<keyof DocumentStatus, string> = {
  driving_license: "Permis de conduire",
  vtc_card: "Carte VTC",
  insurance: "Assurance",
  id_card: "Pièce d'identité",
  proof_of_address: "Justificatif de domicile",
};

// Sections du formulaire
const SECTIONS = [
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

interface DriverProfileSetupProps {
  onComplete?: () => void;
}

export default function DriverProfileSetup({
  onComplete,
}: Readonly<DriverProfileSetupProps>) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentSection, setCurrentSection] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Dossier state management
  const { status, isEditable, canEditDocuments } =
    useDriverFolderStatus();
  const { setStatus, completeSubmission } = useDriverFolderStore();
  const {
    logger,
    logSubmissionStart,
    logProfileUpdate,
    logDocumentUpload,
    logSubmissionComplete,
  } = useDriverSubmissionLogger(driverId, userId);

  // Valeurs animées
  const sectionProgress = useSharedValue(0);
  const completionProgress = useSharedValue(0);
  const headerOpacity = useSharedValue(0);
  const contentTranslateX = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const fieldOpacity = useSharedValue(0);
  const documentPulse = useSharedValue(1);
  const particleAnimation = useSharedValue(0);
  const shimmerAnimation = useSharedValue(0);

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
  const [documentMeta, setDocumentMeta] = useState<
    Partial<
      Record<
        keyof DocumentStatus,
        {
          status: string;
          rejectionReason: string | null;
          expiryDate: string | null;
        }
      >
    >
  >({});
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
  const isProfileComplete = completionPercentage >= 100;

  // Keep validation progress bar in sync with RPC completeness %
  useEffect(() => {
    completionProgress.value = withSpring(
      Math.min(100, Math.max(0, completionPercentage)) / 100,
      { damping: 14, stiffness: 120 },
    );
  }, [completionPercentage, completionProgress]);

  useEffect(() => {
    let cancelled = false;
    if (!avatarUrl) {
      setAvatarPreviewUri(null);
      return;
    }
    void resolveAvatarPreviewUrl(avatarUrl).then((url) => {
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

  // Animer l'entête au montage avec effet de séquence
  useEffect(() => {
    headerOpacity.value = withDelay(200, withTiming(1, { duration: 1000 }));
    fieldOpacity.value = withDelay(400, withTiming(1, { duration: 800 }));

    // Animation shimmer pour la barre de progression
    shimmerAnimation.value = withRepeat(
      withTiming(1, { duration: 2000 }),
      -1,
      true,
    );

    // Animation particules pour la validation
    if (isProfileComplete) {
      particleAnimation.value = withSequence(
        withTiming(1, { duration: 500 }),
        withTiming(0, { duration: 500 }),
      );
    }
  }, [isProfileComplete]);

  // Animer la progression quand la section change
  useEffect(() => {
    sectionProgress.value = withSpring(currentSection / (SECTIONS.length - 1), {
      damping: 12,
      stiffness: 150,
    });

    contentTranslateX.value = withTiming(0, { duration: 300 });

    // Effet de pulse sur les boutons de section
    documentPulse.value = withSequence(
      withTiming(1.1, { duration: 150 }),
      withTiming(1, { duration: 150 }),
    );
  }, [currentSection]);

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
    width: `${interpolate(sectionProgress.value, [0, 1], [0, 100])}%`,
    opacity: interpolate(sectionProgress.value, [0, 0.1, 1], [0.5, 1, 1]),
  }));

  const animatedCompletionStyle = useAnimatedStyle(() => ({
    width: `${interpolate(completionProgress.value, [0, 1], [0, 100])}%`,
    opacity: interpolate(completionProgress.value, [0, 0.05, 1], [0.5, 1, 1]),
  }));

  // Style pour l'effet shimmer
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(shimmerAnimation.value, [0, 1], [-100, 100]),
      },
    ],
    opacity: interpolate(shimmerAnimation.value, [0, 0.5, 1], [0, 0.5, 0]),
  }));

  // Style pour les particules d'animation
  const particleStyle = useAnimatedStyle(() => ({
    opacity: particleAnimation.value,
    transform: [
      {
        scale: interpolate(particleAnimation.value, [0, 1], [0.5, 1.5]),
      },
    ],
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
    if (!isEditable) {
      Alert.alert(
        t("profile.cannotEdit"),
        t("profile.submittedProfileLocked"),
      );
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: value }));

    // Log la mise à jour du profil
    if (logger) {
      const section = REQUIRED_FIELDS.profil.includes(field as any)
        ? "profil"
        : "professionnel";
      logProfileUpdate(section, field as string, completionPercentage);
    }
  };

  const handleDocumentUpload = (
    documentType: string,
    fileUrl: string,
    expiryDate?: string,
  ) => {
    const key = documentType as keyof DocumentStatus;
    const canReplaceRejected =
      canEditDocuments && documentMeta[key]?.status === "rejected";
    if (!isEditable && !canEditDocuments && !canReplaceRejected) {
      Alert.alert(
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
    void (async () => {
      await syncDossierStateWithBackend();
      await loadDriverDocuments();
    })();

    if (logger) {
      logDocumentUpload(documentType, fileUrl, 0);
    }
  };

  // Fonction helper pour vérifier si un champ peut être édité
  const isFieldEditable = () => isEditable && !submitting;

  // Synchroniser l'état du dossier avec le backend
  const syncDossierStateWithBackend = async () => {
    if (!driverId || !userId) return null;

    try {
      const syncedState = await syncDossierState(driverId, userId);
      if (syncedState) {
        setStatus(syncedState.status);
        useDriverFolderStore.setState({
          isEditable: syncedState.isEditable,
          canSubmit: syncedState.canSubmit,
          canEditDocuments: syncedState.canEditDocuments,
          rejectionReason: syncedState.rejectionReason,
          rejectedAt: syncedState.rejectedAt,
        });
        setMissingForSubmit(syncedState.missingForSubmit ?? []);
        setRpcCompletionPercentage(syncedState.completionPercentage ?? 0);
        await loadDriverDocuments();
      }
      return syncedState;
    } catch (error) {
      console.error("Erreur lors de la synchronisation du dossier:", error);
      return null;
    }
  };

  const handleSave = async (
    options?: { silent?: boolean },
  ): Promise<string | false> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert(t("common.error"), t("auth.userNotFound"));
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
          Alert.alert(t("common.error"), error.message);
          return false;
        }
        if (!options?.silent) {
          Alert.alert(t("common.success"), t("profile.profileSaved"));
        }
        return driverId;
      }

      const { data: newDriver, error } = await supabase
        .from("drivers")
        .insert([{ ...driverData, status: "draft" as const }])
        .select()
        .single();

      if (error) {
        Alert.alert(t("common.error"), error.message);
        return false;
      }

      if (newDriver) {
        setDriverId(newDriver.id);
        if (!options?.silent) {
          Alert.alert(t("common.success"), t("profile.profileSaved"));
        }
        return newDriver.id;
      }

      return false;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("common.error");
      Alert.alert(t("common.error"), message);
      return false;
    }
  };

  const saveVehicle = async (): Promise<boolean> => {
    if (!isFieldEditable()) return true;
    const result = await upsertOwnPrimaryVehicle(vehicleForm);
    if (!result.success) {
      const message =
        result.error === "license_plate_taken"
          ? t("profile.licensePlateTaken")
          : (result.error ?? t("profile.vehicleSaveFailed"));
      Alert.alert(t("common.error"), message);
      return false;
    }
    return true;
  };

  const finishSuccessfulSubmit = async (normalizedStatus: string) => {
    if (isApprovedLikeStatus(normalizedStatus)) {
      completeSubmission(true);
      Alert.alert(t("profile.success"), t("profile.profileSubmitted"));
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
      Alert.alert(
        t("profile.pendingReview"),
        t("profile.waitingForValidation"),
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
    Alert.alert(
      t("profile.incomplete"),
      `${t("profile.completeAllFields")}${missing}`,
    );
  };

  const handleSubmit = async () => {
    if (!isEditable) {
      Alert.alert(
        t("profile.alreadySubmitted"),
        t("profile.cannotModifySubmitted"),
      );
      return;
    }

    setSubmitting(true);

    try {
      const savedDriverId = await handleSave({ silent: true });
      if (!savedDriverId) return;
      const vehicleSaved = await saveVehicle();
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
      const message =
        error instanceof Error ? error.message : t("common.error");
      if (logger && driverId) {
        await logger.logError("submission", message, {
          completion_percentage: completionPercentage,
        });
      }

      setStatus("draft");
      completeSubmission(false, message);
      Alert.alert(t("common.error"), message);
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
        Alert.alert(
          t("common.error"),
          result.message || t("profile.cannotCancelSubmission"),
        );
        return;
      }

      await syncDossierStateWithBackend();
      Alert.alert(t("common.success"), t("profile.submissionCancelled"));
    } catch (e) {
      console.error("handleCancelSubmission exception", e);
      Alert.alert(t("common.error"), t("profile.cannotCancelSubmission"));
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

  const nextSection = async () => {
    if (currentSection >= SECTIONS.length - 1) {
      return;
    }

    // Best-effort save / sync; never block section navigation in editable draft flow.
    if (currentSection <= 1 && isFieldEditable()) {
      const savedDriverId = await handleSave({ silent: true });
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

  const uploadAvatar = async () => {
    if (!isFieldEditable()) return;
    let previousPreview = avatarPreviewUri;
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t("documents.error"), t("documents.pickFailed"));
        return;
      }

      let activeDriverId = driverId;
      if (!activeDriverId) {
        if (!userId) {
          Alert.alert(t("common.error"), t("auth.userNotFound"));
          return;
        }
        const ensured = await ensureDriverProfile(userId);
        if (!ensured.id) {
          Alert.alert(
            t("documents.error"),
            ensured.error ?? t("profile.draftSaveFailed"),
          );
          return;
        }
        setDriverId(ensured.id);
        activeDriverId = ensured.id;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;

      setUploadingAvatar(true);
      const asset = result.assets[0];
      previousPreview = avatarPreviewUri;
      setAvatarPreviewUri(asset.uri);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: "base64",
      });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.codePointAt(i) ?? 0;
      }
      const path = `${activeDriverId}/avatar_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("driver-avatars")
        .upload(path, bytes.buffer, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (upErr) {
        setAvatarPreviewUri(previousPreview);
        Alert.alert(t("documents.error"), upErr.message);
        return;
      }
      const { error: updErr } = await supabase
        .from("drivers")
        .update({ avatar_url: path })
        .eq("id", activeDriverId);
      if (updErr) {
        setAvatarPreviewUri(previousPreview);
        Alert.alert(t("documents.error"), updErr.message);
        return;
      }
      setAvatarUrl(path);
      await syncDossierStateWithBackend();
    } catch (e) {
      setAvatarPreviewUri(previousPreview);
      Alert.alert(
        t("documents.error"),
        e instanceof Error ? e.message : t("documents.failedToUpload"),
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const renderSectionContent = () => {
    if (currentSection === 0) return renderProfilSection();
    if (currentSection === 1) return renderProfessionnelSection();
    if (currentSection === 2) return renderVehicleSection();
    if (currentSection === 3) return renderDocumentsSection();
    if (currentSection === 4) return renderValidationSection();
    return null;
  };

  const renderVehicleSection = () => (
    <DriverVehicleSection
      form={vehicleForm}
      editable={isFieldEditable()}
      onChange={(patch) => setVehicleForm((prev) => ({ ...prev, ...patch }))}
      contentStyle={animatedContentStyle}
    />
  );

  const renderProfilSection = () => {
        return (
          <Animated.View
            entering={FadeInRight.duration(400).springify()}
            exiting={FadeOutLeft.duration(300)}
            style={animatedContentStyle}
            className="space-y-6"
          >
            <Animated.Text
              entering={FadeInDown.duration(500).delay(100)}
              className="text-xl font-bold text-white mb-4"
            >
              {t("profile.personalInfo")}
            </Animated.Text>

            <Animated.View entering={FadeInDown.duration(400).delay(120)} className="mb-4">
              <Text className="text-sm text-white font-medium mb-2">
                {t("profile.avatar")} *
              </Text>
              <Pressable
                onPress={uploadAvatar}
                disabled={!isFieldEditable() || uploadingAvatar}
                className="flex-row items-center bg-white/10 rounded-lg px-4 py-3 border border-white/20"
              >
                <DriverAvatar
                  uri={avatarPreviewUri}
                  size={48}
                  fallback="camera"
                  className="mr-3 bg-emerald-500/20"
                />
                <View className="flex-1">
                  <Text className="text-white font-medium">
                    {avatarButtonLabel(uploadingAvatar, Boolean(avatarUrl), {
                      uploading: t("documents.uploading"),
                      ready: t("profile.avatarReady"),
                      upload: t("profile.avatarUpload"),
                    })}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-0.5">
                    {t("profile.avatarHint")}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#64748b" />
              </Pressable>
            </Animated.View>

            <Animated.View style={animatedFieldStyle}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(200)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.firstName")} *
              </Animated.Text>
              <Animated.View
                entering={FadeInRight.duration(400).delay(300)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="user" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder={t("profile.firstNamePlaceholder")}
                  placeholderTextColor="#6b7280"
                  value={formData.first_name}
                  onChangeText={(text) => handleInputChange("first_name", text)}
                  autoCapitalize="words"
                  editable={isFieldEditable()}
                />
              </Animated.View>
            </Animated.View>

            <Animated.View style={animatedFieldStyle}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(400)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.lastName")} *
              </Animated.Text>
              <Animated.View
                entering={FadeInRight.duration(400).delay(500)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="user" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder={t("profile.lastNamePlaceholder")}
                  placeholderTextColor="#6b7280"
                  value={formData.last_name}
                  onChangeText={(text) => handleInputChange("last_name", text)}
                  autoCapitalize="words"
                />
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(700)}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(600)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.phone")} *
              </Animated.Text>
              <Animated.View
                entering={FadeInRight.duration(400).delay(700)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="phone" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder={t("profile.phonePlaceholder")}
                  placeholderTextColor="#6b7280"
                  value={formData.phone}
                  onChangeText={(text) => handleInputChange("phone", text)}
                  keyboardType="phone-pad"
                />
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(900)}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(800)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.dateOfBirth")}
              </Animated.Text>
              <Animated.View
                entering={FadeInRight.duration(400).delay(900)}
                className="mt-0"
              >
                <NativeDateField
                  value={(formData.date_of_birth || "").slice(0, 10)}
                  onChange={(ymd) => handleInputChange("date_of_birth", ymd)}
                  placeholder={t("profile.dateOfBirthPlaceholder")}
                  editable={isFieldEditable()}
                  maximumDate={new Date()}
                />
              </Animated.View>
            </Animated.View>

            <View className="pt-4 border-t border-white/10">
              <Text className="text-lg font-bold text-white mb-4">
                {t("profile.address")}
              </Text>

              <Animated.View
                className="mb-4"
                entering={FadeInDown.duration(400).delay(1100)}
              >
                <Animated.Text
                  entering={FadeInDown.duration(400).delay(1000)}
                  className="text-sm text-white font-medium mb-2"
                >
                  {t("profile.address")} *
                </Animated.Text>
                <Animated.View
                  entering={FadeInRight.duration(400).delay(1100)}
                  className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
                >
                  <Feather name="map-pin" size={20} color="#10b981" />
                  <TextInput
                    className="flex-1 text-white ml-3 text-base"
                    placeholder={t("profile.addressPlaceholder")}
                    placeholderTextColor="#6b7280"
                    value={formData.address}
                    onChangeText={(text) => handleInputChange("address", text)}
                  />
                </Animated.View>
              </Animated.View>

              <Animated.View
                className="mb-4"
                entering={FadeInDown.duration(400).delay(1300)}
              >
                <Animated.Text
                  entering={FadeInDown.duration(400).delay(1200)}
                  className="text-sm text-white font-medium mb-2"
                >
                  {t("profile.city")} *
                </Animated.Text>
                <Animated.View
                  entering={FadeInRight.duration(400).delay(1300)}
                  className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
                >
                  <Feather name="home" size={20} color="#10b981" />
                  <TextInput
                    className="flex-1 text-white ml-3 text-base"
                    placeholder={t("profile.cityPlaceholder")}
                    placeholderTextColor="#6b7280"
                    value={formData.city}
                    onChangeText={(text) => handleInputChange("city", text)}
                  />
                </Animated.View>
              </Animated.View>

              <Animated.View entering={FadeInDown.duration(400).delay(1500)}>
                <Animated.Text
                  entering={FadeInDown.duration(400).delay(1400)}
                  className="text-sm text-white font-medium mb-2"
                >
                  {t("profile.postalCode")} *
                </Animated.Text>
                <Animated.View
                  entering={FadeInRight.duration(400).delay(1500)}
                  className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
                >
                  <Feather name="hash" size={20} color="#10b981" />
                  <TextInput
                    className="flex-1 text-white ml-3 text-base"
                    placeholder={t("profile.postalCodePlaceholder")}
                    placeholderTextColor="#6b7280"
                    value={formData.postal_code}
                    onChangeText={(text) =>
                      handleInputChange("postal_code", text)
                    }
                    editable={isFieldEditable()}
                  />
                </Animated.View>
              </Animated.View>
            </View>

            <View className="pt-4 border-t border-white/10">
              <Text className="text-lg font-bold text-white mb-4">
                {t("profile.emergencyContact")}
              </Text>

              <Animated.View
                className="mb-4"
                entering={FadeInDown.duration(400).delay(1600)}
              >
                <Text className="text-sm text-white font-medium mb-2">
                  {t("profile.emergencyContactName")} *
                </Text>
                <View className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20">
                  <Feather name="users" size={20} color="#10b981" />
                  <TextInput
                    className="flex-1 text-white ml-3 text-base"
                    placeholder={t("profile.emergencyContactNamePlaceholder")}
                    placeholderTextColor="#6b7280"
                    value={formData.emergency_contact_name}
                    onChangeText={(text) =>
                      handleInputChange("emergency_contact_name", text)
                    }
                    autoCapitalize="words"
                    editable={isFieldEditable()}
                  />
                </View>
              </Animated.View>

              <Animated.View entering={FadeInDown.duration(400).delay(1700)}>
                <Text className="text-sm text-white font-medium mb-2">
                  {t("profile.emergencyContactPhone")} *
                </Text>
                <View className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20">
                  <Feather name="phone-call" size={20} color="#10b981" />
                  <TextInput
                    className="flex-1 text-white ml-3 text-base"
                    placeholder={t(
                      "profile.emergencyContactPhonePlaceholder",
                    )}
                    placeholderTextColor="#6b7280"
                    value={formData.emergency_contact_phone}
                    onChangeText={(text) =>
                      handleInputChange("emergency_contact_phone", text)
                    }
                    keyboardType="phone-pad"
                    editable={isFieldEditable()}
                  />
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        );
  };
  const renderProfessionnelSection = () => {
        return (
          <Animated.View
            entering={FadeInRight.duration(300)}
            exiting={FadeOutLeft.duration(300)}
            style={animatedContentStyle}
            className="space-y-6"
          >
            <Text className="text-xl font-bold text-white mb-4">
              {t("profile.professionalInfo")}
            </Text>

            <Animated.View entering={FadeInDown.duration(400).delay(200)}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(100)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.licenseNumber")} *
              </Animated.Text>
              <Animated.View
                entering={FadeInRight.duration(400).delay(200)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="credit-card" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder={t("profile.licenseNumberPlaceholder")}
                  placeholderTextColor="#6b7280"
                  value={formData.license_number}
                  onChangeText={(text) =>
                    handleInputChange("license_number", text)
                  }
                />
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(400)}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(300)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.licenseExpiry")} *
              </Animated.Text>
              <Animated.View entering={FadeInRight.duration(400).delay(400)}>
                <NativeDateField
                  value={(formData.driving_license_expiry_date || "").slice(
                    0,
                    10,
                  )}
                  onChange={(ymd) =>
                    handleInputChange("driving_license_expiry_date", ymd)
                  }
                  placeholder="YYYY-MM-DD"
                  editable={isFieldEditable()}
                  minimumDate={new Date()}
                />
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(600)}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(500)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.vtcCardNumber")} *
              </Animated.Text>
              <Animated.View
                entering={FadeInRight.duration(400).delay(600)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="award" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder={t("profile.vtcCardNumberPlaceholder")}
                  placeholderTextColor="#6b7280"
                  value={formData.vtc_card_number}
                  onChangeText={(text) =>
                    handleInputChange("vtc_card_number", text)
                  }
                />
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(800)}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(700)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.vtcCardExpiry")} *
              </Animated.Text>
              <Animated.View entering={FadeInRight.duration(400).delay(800)}>
                <NativeDateField
                  value={(formData.vtc_card_expiry_date || "").slice(0, 10)}
                  onChange={(ymd) =>
                    handleInputChange("vtc_card_expiry_date", ymd)
                  }
                  placeholder="YYYY-MM-DD"
                  editable={isFieldEditable()}
                  minimumDate={new Date()}
                />
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(1000)}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(900)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.insuranceNumber")}
              </Animated.Text>
              <Animated.View
                entering={FadeInRight.duration(400).delay(1000)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="shield" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder={t("profile.insuranceNumberPlaceholder")}
                  placeholderTextColor="#6b7280"
                  value={formData.insurance_number}
                  onChangeText={(text) =>
                    handleInputChange("insurance_number", text)
                  }
                />
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(1200)}>
              <Animated.Text
                entering={FadeInDown.duration(400).delay(1100)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.companySiret")}
              </Animated.Text>
              <Animated.View
                entering={FadeInRight.duration(400).delay(1200)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="briefcase" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder={t("profile.companySiretPlaceholder")}
                  placeholderTextColor="#6b7280"
                  value={formData.company_siret}
                  onChangeText={(text) =>
                    handleInputChange("company_siret", text)
                  }
                  keyboardType="numeric"
                />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        );
  };
  const renderDocumentsSection = () => {
        return (
          <Animated.View
            entering={FadeInRight.duration(300)}
            exiting={FadeOutLeft.duration(300)}
            style={animatedContentStyle}
            className="space-y-6"
          >
            <Text className="text-xl font-bold text-white mb-4">
              {t("profile.requiredDocuments")}
            </Text>
            <Text className="text-sm text-slate-400 mb-2">
              {t("profile.documentsSectionHint")}
            </Text>

            {documentsLoading ? (
              <Text className="text-xs text-slate-400 mb-2">
                {t("documents.loadingDocuments")}
              </Text>
            ) : null}
            {documentsLoadError ? (
              <Text className="text-xs text-amber-300 mb-2">
                {documentsLoadError}
              </Text>
            ) : null}

            {REQUIRED_DOCUMENTS.map((docType, index) => {
              const meta = documentMeta[docType];
              const isRejected = meta?.status === "rejected";
              const filePresent = hasDocumentFile(
                docType as DocumentTypeKey,
                documents,
                documentMeta,
              );
              const canReplace =
                !submitting && (isEditable || canEditDocuments);
              const docValidationStatus = (meta?.status ?? "pending") as
                | "pending"
                | "approved"
                | "rejected";

              return (
              <Animated.View
                key={docType}
                entering={FadeInDown.duration(400).delay(index * 150)}
                className="mb-4"
              >
                <Animated.View
                  entering={FadeInRight.duration(400).delay(index * 150 + 50)}
                  className="flex-row items-center justify-between mb-2"
                >
                  <Animated.Text
                    entering={FadeInDown.duration(400).delay(index * 150 + 25)}
                    className="text-sm text-white font-medium"
                  >
                    {t(`documents.${docType}`) || DOC_LABELS[docType]}
                  </Animated.Text>
                  {isRejected ? (
                    <Text className="text-xs text-rose-400 font-medium">
                      {t("documents.status.rejected")}
                    </Text>
                  ) : null}
                </Animated.View>
                {isRejected && meta?.rejectionReason ? (
                  <Text className="text-xs text-rose-300 mb-2">
                    {t("documents.rejectionReason")}: {meta.rejectionReason}
                  </Text>
                ) : null}
                {isRejected && !meta?.rejectionReason ? (
                  <Text className="text-xs text-rose-300 mb-2">
                    {t("documents.replaceRejectedHint")}
                  </Text>
                ) : null}
                <Animated.View
                  entering={FadeInRight.duration(400).delay(index * 150 + 100)}
                >
                  <DriverDocumentUploader
                    documentType={docType}
                    onUploadComplete={(fileUrl, expiry) =>
                      handleDocumentUpload(docType, fileUrl, expiry)
                    }
                    driverId={driverId ?? undefined}
                    currentUrl={documents[docType] || undefined}
                    currentExpiry={meta?.expiryDate}
                    documentStatus={docValidationStatus}
                    canReplace={canReplace}
                    hasFile={filePresent}
                  />
                </Animated.View>
              </Animated.View>
            );
            })}
          </Animated.View>
        );
  };
  const renderValidationSection = () => {
        return (
          <Animated.View
            entering={FadeInRight.duration(300)}
            exiting={FadeOutLeft.duration(300)}
            style={animatedContentStyle}
            className="space-y-6"
          >
            <Animated.Text
              entering={FadeInDown.duration(400).delay(100)}
              className="text-xl font-bold text-white mb-4"
            >
              {t("profile.validation")}
            </Animated.Text>

            <Animated.View
              entering={BounceIn.duration(600).delay(200)}
              className="bg-white/10 rounded-lg p-4 border border-white/20"
            >
              <Animated.Text
                entering={FadeInDown.duration(300).delay(300)}
                className="text-sm text-white font-medium mb-2"
              >
                {t("profile.completion")}
              </Animated.Text>
              <View className="bg-white/20 rounded-full h-3 mb-2 overflow-hidden relative">
                <EmeraldProgressFill
                  animatedStyle={animatedCompletionStyle}
                  height={12}
                />
                {/* Effet shimmer sur la barre de progression */}
                <Animated.View
                  style={[
                    shimmerStyle,
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: "rgba(255, 255, 255, 0.3)",
                      width: "100%",
                    },
                  ]}
                />
                {/* Particules de validation */}
                {isProfileComplete && (
                  <Animated.View
                    style={[
                      particleStyle,
                      {
                        position: "absolute",
                        top: -2,
                        right: -2,
                        width: 8,
                        height: 8,
                        backgroundColor: "#fbbf24",
                        borderRadius: 4,
                      },
                    ]}
                  />
                )}
              </View>
              <Animated.View
                entering={FadeIn.duration(300).delay(400)}
                className="flex-row justify-between items-center mt-2"
              >
                <Text className="text-xs text-slate-400">
                  {Math.round(completionPercentage)}% {t("common.complete")}
                </Text>
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInUp.duration(500).delay(500)}>
              <DossierValidationChecklist input={checklistInput} />
            </Animated.View>

            <Animated.View
              entering={FadeInUp.duration(500).delay(900)}
              className="flex-row space-x-3 pt-4"
            >
              {status === "pending_review" || status === "submitted" ? (
                <Animated.View
                  className="flex-1"
                  entering={FlipInEasyX.duration(600).delay(1000)}
                >
                  <Pressable
                    onPress={async () => {
                      // Annuler la soumission pour permettre modification
                      Alert.alert(
                        t("common.confirm"),
                        t("profile.confirmCancelSubmission") ||
                          "Annuler la soumission ?",
                        [
                          { text: t("common.cancel"), style: "cancel" },
                          {
                            text: t("common.ok"),
                            onPress: async () => await handleCancelSubmission(),
                          },
                        ],
                      );
                    }}
                    className="overflow-hidden rounded-lg py-3 px-4 items-center shadow"
                  >
                    <LinearGradient
                      colors={["#f97316", "#ef4444"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      className="absolute inset-0 rounded-lg"
                    />
                    <Animated.Text
                      entering={FadeIn.duration(300).delay(1100)}
                      className="text-white font-semibold"
                    >
                      {t("profile.cancelSubmission")}
                    </Animated.Text>
                  </Pressable>
                </Animated.View>
              ) : (
                <>
                  <Animated.View
                    className="flex-1"
                    entering={FlipInEasyX.duration(600).delay(1000)}
                  >
                    <Pressable
                      onPress={async () => {
                        const savedDriverId = await handleSave({ silent: true });
                        if (!savedDriverId) return;
                        await saveVehicle();
                        await syncDossierStateWithBackend();
                        Alert.alert(
                          t("common.success"),
                          t("profile.profileSaved"),
                        );
                      }}
                      className="overflow-hidden rounded-lg py-3 px-4 items-center shadow"
                    >
                      <LinearGradient
                        colors={["#374151", "#4b5563"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        className="absolute inset-0 rounded-lg"
                      />
                      <Animated.Text
                        entering={FadeIn.duration(300).delay(1100)}
                        className="text-white font-semibold"
                      >
                        {t("profile.saveProgress")}
                      </Animated.Text>
                    </Pressable>
                  </Animated.View>

                  <Animated.View
                    className="flex-1"
                    entering={FlipInEasyX.duration(600).delay(1200)}
                  >
                    <Pressable
                      onPress={handleSubmit}
                      disabled={submitting || !isEditable}
                      className={`overflow-hidden rounded-lg py-3 px-4 items-center shadow ${submitting || !isEditable ? "opacity-50" : "opacity-100"}`}
                    >
                      <LinearGradient
                        colors={["#10b981", "#059669"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        className="absolute inset-0 rounded-lg"
                      />
                      <Animated.Text
                        entering={FadeIn.duration(300).delay(1300)}
                        className="text-white font-semibold"
                      >
                        {submitting
                          ? t("profile.submitting")
                          : t("profile.submitForReview")}
                      </Animated.Text>
                    </Pressable>
                  </Animated.View>
                </>
              )}
            </Animated.View>
          </Animated.View>
        );
  };


  return (
    <View className="flex-1 bg-black">
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
                  {SECTIONS.map((section, index) => (
                    <View key={section.id} className="items-center flex-1">
                      <View
                        className={`w-8 h-8 rounded-full items-center justify-center ${
                          index <= currentSection
                            ? "bg-emerald-500"
                            : "bg-white/20"
                        }`}
                      >
                        <Feather
                          name={section.icon as any}
                          size={16}
                          color={index <= currentSection ? "white" : "#9ca3af"}
                        />
                      </View>
                      <Text className="text-xs text-slate-400 mt-1 text-center">
                        {section.label}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Banner de statut du dossier */}
                <DriverFolderStatusBanner />
                <View className="bg-white/20 rounded-full h-1 mt-2 relative overflow-hidden">
                  <EmeraldProgressFill
                    animatedStyle={animatedProgressStyle}
                    height={4}
                  />
                  {/* Effet shimmer */}
                  <Animated.View
                    style={[
                      shimmerStyle,
                      {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(255, 255, 255, 0.3)",
                        width: "100%",
                      },
                    ]}
                  />
                  {/* Particules de validation */}
                  {isProfileComplete && (
                    <Animated.View
                      style={[
                        particleStyle,
                        {
                          position: "absolute",
                          top: -2,
                          right: -2,
                          width: 8,
                          height: 8,
                          backgroundColor: "#fbbf24",
                          borderRadius: 4,
                        },
                      ]}
                    />
                  )}
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
                  className={nextSectionButtonClass(
                    currentSection,
                    SECTIONS.length - 1,
                    isEditable,
                    canProceedToNext(),
                  )}
                >
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
