import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
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
  runOnJS,
  interpolate,
  FadeInRight,
  FadeOutLeft,
  FadeInUp,
  FadeInDown,
  FadeIn,
  Layout,
  SlideInRight,
  SlideOutLeft,
  BounceIn,
  ZoomIn,
  ZoomOut,
  RotateInDownLeft,
  FlipInEasyX,
  LightSpeedInRight,
} from "react-native-reanimated";
import { supabase } from "../lib/supabase";
import { DriverDocumentUploader } from "./DriverDocumentUploader";
import { useDriverSubmissionLogger } from "../lib/services/driverSubmissionLogger";
import { DriverStatus } from "../lib/types/database.types";
import {
  useDriverFolderStore,
  useDriverFolderStatus,
} from "../lib/stores/driverFolderStore";
import { DriverFolderStatusBanner } from "./DynamicNotification";
import {
  syncDossierState,
  submitDossier,
} from "../lib/services/dossierService";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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

// Champs requis par section
const REQUIRED_FIELDS = {
  profil: [
    "first_name",
    "last_name",
    "phone",
    "address",
    "city",
    "postal_code",
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
}: DriverProfileSetupProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [currentSection, setCurrentSection] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Dossier state management
  const { status, isEditable, canSubmit } = useDriverFolderStatus();
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

  const [documents, setDocuments] = useState<DocumentStatus>({
    driving_license: null,
    vtc_card: null,
    insurance: null,
    id_card: null,
    proof_of_address: null,
  });

  // Calculer le pourcentage de complétion
  const calculateCompletion = (): number => {
    const profilFields = REQUIRED_FIELDS.profil.filter(
      (f) => formData[f]?.trim() !== "",
    ).length;
    const professionnelFields = REQUIRED_FIELDS.professionnel.filter(
      (f) => formData[f]?.trim() !== "",
    ).length;
    const documentsCount = Object.values(documents).filter(Boolean).length;

    const profilScore = (profilFields / REQUIRED_FIELDS.profil.length) * 30;
    const professionnelScore =
      (professionnelFields / REQUIRED_FIELDS.professionnel.length) * 30;
    const documentsScore = (documentsCount / REQUIRED_DOCUMENTS.length) * 40;

    return Math.min(100, profilScore + professionnelScore + documentsScore);
  };

  const completionPercentage = calculateCompletion();

  // Vérifier si le profil est complet
  const isProfileComplete = completionPercentage >= 100;

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

          // Synchroniser l'état du dossier avec le backend
          await syncDossierStateWithBackend();
          setFormData({
            first_name: existingDriver.first_name || "",
            last_name: existingDriver.last_name || "",
            phone: existingDriver.phone || "",
            date_of_birth: existingDriver.date_of_birth || "",
            emergency_contact_name: existingDriver.emergency_contact_name || "",
            emergency_contact_phone:
              existingDriver.emergency_contact_phone || "",
            license_number: existingDriver.driving_license_number || "",
            driving_license_expiry_date:
              existingDriver.driving_license_expiry_date || "",
            vtc_card_number: existingDriver.vtc_card_number || "",
            vtc_card_expiry_date: existingDriver.vtc_card_expiry_date || "",
            insurance_number: existingDriver.insurance_number || "",
            company_siret: existingDriver.company_siret || "",
            address: existingDriver.address_line1 || "",
            city: existingDriver.city || "",
            postal_code: existingDriver.postal_code || "",
          });
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

    try {
      const { data: docs, error } = await supabase
        .from("driver_documents")
        .select("document_type, validation_status, file_url")
        .eq("driver_id", driverId)
        .in("validation_status", ["approved", "pending"]);

      if (!error && docs) {
        const approvedDocs = docs.reduce((acc, doc) => {
          acc[doc.document_type as keyof DocumentStatus] = doc.file_url;
          return acc;
        }, {} as DocumentStatus);

        setDocuments((prev) => ({ ...prev, ...approvedDocs }));
        // Backfill from storage for any required docs missing DB records
        const missing = REQUIRED_DOCUMENTS.filter(
          (dt) => !approvedDocs[dt as keyof DocumentStatus],
        );
        if (missing.length > 0) {
          for (const docType of missing) {
            try {
              const path = `${driverId}/${docType}`;
              const { data: list, error: listErr } = await supabase.storage
                .from("driver-documents")
                .list(path);

              if (!list || list.length === 0 || listErr) continue;

              // pick the most recent file (last in list)
              const fileEntry = list[list.length - 1];
              const filePath = `${path}/${fileEntry.name}`;
              const {
                data: { publicUrl },
              } = supabase.storage
                .from("driver-documents")
                .getPublicUrl(filePath);

              setDocuments((prev) => ({ ...prev, [docType]: publicUrl }));
            } catch (e) {
              console.warn("Error backfilling from storage for", docType, e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking documents:", error);
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
      Alert.alert(t("profile.cannotEdit"), t("profile.submittedProfileLocked"));
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

  const handleDocumentUpload = (documentType: string, fileUrl: string) => {
    // Vérifier si le dossier peut être modifié
    if (!isEditable) {
      Alert.alert(t("profile.cannotEdit"), t("profile.submittedProfileLocked"));
      return;
    }

    setDocuments((prev) => ({
      ...prev,
      [documentType]: fileUrl,
    }));

    // Log l'upload du document
    if (logger) {
      logDocumentUpload(documentType, fileUrl, 0); // Taille du fichier non disponible ici
    }
  };

  // Fonction helper pour vérifier si un champ peut être édité
  const isFieldEditable = () => isEditable && !submitting;

  // Synchroniser l'état du dossier avec le backend
  const syncDossierStateWithBackend = async () => {
    if (!driverId || !userId) return;

    try {
      const syncedState = await syncDossierState(driverId, userId);
      if (syncedState) {
        // Mettre à jour le store local avec les données du backend
        setStatus(syncedState.status);
        // Recharger les documents après changement de statut pour refléter uploads récents
        await loadDriverDocuments();
        // Les autres propriétés sont déjà gérées par le hook useDriverFolderStatus
      }
    } catch (error) {
      console.error("Erreur lors de la synchronisation du dossier:", error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert(t("common.error"), t("auth.userNotFound"));
        return;
      }

      const driverData = {
        user_id: user.id,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        date_of_birth: formData.date_of_birth,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        driving_license_number: formData.license_number,
        driving_license_expiry_date: formData.driving_license_expiry_date,
        vtc_card_number: formData.vtc_card_number,
        vtc_card_expiry_date: formData.vtc_card_expiry_date,
        insurance_number: formData.insurance_number,
        company_siret: formData.company_siret,
        address_line1: formData.address,
        city: formData.city,
        postal_code: formData.postal_code,
        updated_at: new Date().toISOString(),
      };

      if (driverId) {
        const { user_id, ...updateData } = driverData;
        await supabase.from("drivers").update(updateData).eq("id", driverId);
      } else {
        const { data: newDriver } = await supabase
          .from("drivers")
          .insert([driverData])
          .select()
          .single();

        if (newDriver) {
          setDriverId(newDriver.id);
        }
      }

      Alert.alert(t("common.success"), t("profile.profileSaved"));
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!isProfileComplete) {
      Alert.alert(t("profile.incomplete"), t("profile.completeAllFields"));
      return;
    }

    // Vérifier si le dossier peut être soumis
    if (!canSubmit || !isEditable) {
      Alert.alert(
        t("profile.alreadySubmitted"),
        t("profile.cannotModifySubmitted"),
      );
      return;
    }

    setSubmitting(true);

    try {
      // Log du début de la soumission
      if (logger) {
        await logSubmissionStart();
      }

      // Mettre à jour le statut du dossier
      setStatus("submitting");

      await handleSave();

      if (userId && driverId) {
        // Soumettre le dossier via l'API
        const result = await submitDossier(driverId, userId);

        if (result.success) {
          // Normaliser et accepter plusieurs variantes de statuts renvoyés par la DB
          const normalized = (result.new_status || "").toLowerCase();
          if (normalized === "approved" || normalized === "validated") {
            // Le dossier est validé
            completeSubmission(true);
            Alert.alert(t("profile.success"), t("profile.profileSubmitted"));

            // Log de la validation
            if (logger) {
              await logSubmissionComplete("submitting", "validated", {
                validation_result: "approved",
                completion_percentage: completionPercentage,
              });
            }
          } else if (
            normalized === "pending_review" ||
            normalized === "submitted"
          ) {
            // Le dossier est soumis et en attente de validation
            completeSubmission(true);
            Alert.alert(
              t("profile.pendingReview"),
              t("profile.waitingForValidation"),
            );

            // Log de la soumission en attente
            if (logger) {
              await logSubmissionComplete("submitting", "submitted", {
                validation_result: "pending",
                completion_percentage: completionPercentage,
              });
            }
          }

          if (onComplete) {
            onComplete();
          } else {
            router.replace("/(tabs)");
          }
        } else {
          // Erreur lors de la soumission
          throw new Error(result.message);
        }
      }
    } catch (error: any) {
      // Log de l'erreur
      if (logger && driverId) {
        await logger.logError("submission", error.message, {
          completion_percentage: completionPercentage,
        });
      }

      // Rétablir le statut en cas d'erreur
      setStatus("draft");
      completeSubmission(false, error.message);

      Alert.alert(t("common.error"), error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Annuler la soumission: remettre le statut en draft pour permettre modifications
  const handleCancelSubmission = async () => {
    if (!driverId) return;
    try {
      // Update DB
      const { error } = await supabase
        .from("drivers")
        .update({
          submission_status: "draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", driverId);

      if (error) {
        console.error("Error cancelling submission:", error);
        Alert.alert(t("common.error"), t("profile.cannotCancelSubmission"));
        return;
      }

      // Update local state
      setStatus("draft");
      // reload documents to allow edits
      await loadDriverDocuments();

      Alert.alert(t("common.success"), t("profile.submissionCancelled"));
    } catch (e) {
      console.error("handleCancelSubmission exception", e);
      Alert.alert(t("common.error"), t("common.error"));
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
      case 2: // Documents
        canProceed = Object.values(documents).every(Boolean);
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

  const nextSection = () => {
    console.log("nextSection called, currentSection:", currentSection);
    console.log("SECTIONS.length - 1:", SECTIONS.length - 1);

    if (currentSection < SECTIONS.length - 1) {
      console.log("Proceeding to next section");
      // Effet de scale sur le bouton
      buttonScale.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withTiming(1, { duration: 100 }),
      );

      contentTranslateX.value = withTiming(-100, { duration: 200 }, () => {
        console.log(
          "Animation complete, setting new section:",
          currentSection + 1,
        );
        runOnJS(changeSection)(currentSection + 1);
        contentTranslateX.value = withTiming(0, { duration: 200 });
      });
    } else {
      console.log("Cannot proceed - already at last section");
    }
  };

  const prevSection = () => {
    if (currentSection > 0) {
      // Effet de scale sur le bouton
      buttonScale.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withTiming(1, { duration: 100 }),
      );

      contentTranslateX.value = withTiming(100, { duration: 200 }, () => {
        runOnJS(changeSection)(currentSection - 1);
        contentTranslateX.value = withTiming(0, { duration: 200 });
      });
    }
  };

  const renderSectionContent = () => {
    switch (currentSection) {
      case 0: // Profil
        return (
          <Animated.View
            entering={FadeInRight.duration(400).springify()}
            exiting={FadeOutLeft.duration(300)}
            layout={Layout.springify()}
            style={animatedContentStyle}
            className="space-y-6"
          >
            <Animated.Text
              entering={FadeInDown.duration(500).delay(100)}
              className="text-xl font-bold text-white mb-4"
            >
              {t("profile.personalInfo")}
            </Animated.Text>

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

            <Animated.View
              style={[animatedFieldStyle, { opacity: fieldOpacity.value }]}
            >
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
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="calendar" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder={t("profile.dateOfBirthPlaceholder")}
                  placeholderTextColor="#6b7280"
                  value={formData.date_of_birth}
                  onChangeText={(text) =>
                    handleInputChange("date_of_birth", text)
                  }
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
                  />
                </Animated.View>
              </Animated.View>
            </View>
          </Animated.View>
        );

      case 1: // Professionnel
        return (
          <Animated.View
            entering={FadeInRight.duration(300)}
            exiting={FadeOutLeft.duration(300)}
            layout={Layout.springify()}
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
              <Animated.View
                entering={FadeInRight.duration(400).delay(400)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="calendar" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder="MM/YYYY"
                  placeholderTextColor="#6b7280"
                  value={formData.driving_license_expiry_date}
                  onChangeText={(text) =>
                    handleInputChange("driving_license_expiry_date", text)
                  }
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
              <Animated.View
                entering={FadeInRight.duration(400).delay(800)}
                className="flex-row items-center bg-white/10 rounded-lg px-4 h-14 border border-white/20"
              >
                <Feather name="calendar" size={20} color="#10b981" />
                <TextInput
                  className="flex-1 text-white ml-3 text-base"
                  placeholder="MM/YYYY"
                  placeholderTextColor="#6b7280"
                  value={formData.vtc_card_expiry_date}
                  onChangeText={(text) =>
                    handleInputChange("vtc_card_expiry_date", text)
                  }
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

      case 2: // Documents
        return (
          <Animated.View
            entering={FadeInRight.duration(300)}
            exiting={FadeOutLeft.duration(300)}
            layout={Layout.springify()}
            style={animatedContentStyle}
            className="space-y-6"
          >
            <Text className="text-xl font-bold text-white mb-4">
              {t("profile.requiredDocuments")}
            </Text>
            <Text className="text-sm text-slate-400 mb-6">
              {t("profile.uploadAllDocuments")}
            </Text>

            {REQUIRED_DOCUMENTS.map((docType, index) => (
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
                  {documents[docType] && (
                    <Animated.View
                      entering={BounceIn.duration(500).delay(index * 150 + 100)}
                    >
                      <Feather name="check-circle" size={16} color="#10b981" />
                    </Animated.View>
                  )}
                </Animated.View>
                <Animated.View
                  entering={FadeInRight.duration(400).delay(index * 150 + 100)}
                >
                  <DriverDocumentUploader
                    documentType={docType}
                    onUploadComplete={(fileUrl) =>
                      handleDocumentUpload(docType, fileUrl)
                    }
                    currentUrl={documents[docType] || undefined}
                    isEditable={isEditable}
                  />
                </Animated.View>
              </Animated.View>
            ))}
          </Animated.View>
        );

      case 3: // Validation
        return (
          <Animated.View
            entering={FadeInRight.duration(300)}
            exiting={FadeOutLeft.duration(300)}
            layout={Layout.springify()}
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
                <Animated.View
                  style={animatedProgressStyle}
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-3 rounded-full"
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
                {!isProfileComplete && (
                  <Text className="text-amber-300 text-xs">
                    {t("profile.missingFields")}
                  </Text>
                )}
              </Animated.View>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.duration(500).delay(500)}
              className="space-y-3"
            >
              <Animated.View
                entering={ZoomIn.duration(300).delay(600)}
                className="flex-row items-center"
              >
                <Animated.View
                  entering={
                    REQUIRED_FIELDS.profil.every(
                      (f) => formData[f]?.trim() !== "",
                    )
                      ? BounceIn.duration(500).delay(600)
                      : undefined
                  }
                >
                  <Feather
                    name="check-circle"
                    size={16}
                    color={
                      REQUIRED_FIELDS.profil.every(
                        (f) => formData[f]?.trim() !== "",
                      )
                        ? "#10b981"
                        : "#6b7280"
                    }
                  />
                </Animated.View>
                <Text className="text-white ml-3">
                  Informations personnelles
                </Text>
              </Animated.View>
              <Animated.View
                entering={ZoomIn.duration(300).delay(700)}
                className="flex-row items-center"
              >
                <Animated.View
                  entering={
                    REQUIRED_FIELDS.professionnel.every(
                      (f) => formData[f]?.trim() !== "",
                    )
                      ? BounceIn.duration(500).delay(700)
                      : undefined
                  }
                >
                  <Feather
                    name="check-circle"
                    size={16}
                    color={
                      REQUIRED_FIELDS.professionnel.every(
                        (f) => formData[f]?.trim() !== "",
                      )
                        ? "#10b981"
                        : "#6b7280"
                    }
                  />
                </Animated.View>
                <Text className="text-white ml-3">
                  Informations professionnelles
                </Text>
              </Animated.View>
              <Animated.View
                entering={ZoomIn.duration(300).delay(800)}
                className="flex-row items-center"
              >
                <Animated.View
                  entering={
                    Object.values(documents).every(Boolean)
                      ? BounceIn.duration(500).delay(800)
                      : undefined
                  }
                >
                  <Feather
                    name="check-circle"
                    size={16}
                    color={
                      Object.values(documents).every(Boolean)
                        ? "#10b981"
                        : "#6b7280"
                    }
                  />
                </Animated.View>
                <Text className="text-white ml-3">Documents</Text>
              </Animated.View>
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
                      onPress={() => {
                        // Sauvegarde en mémoire seulement - pas d'appel à la base de données
                        Alert.alert(
                          t("common.success"),
                          t("profile.progressSavedLocally"),
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
                      disabled={submitting || !isProfileComplete || !canSubmit}
                      className={`overflow-hidden rounded-lg py-3 px-4 items-center shadow ${submitting || !isProfileComplete || !canSubmit ? "opacity-50" : "opacity-100"}`}
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

      default:
        return null;
    }
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
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="py-8">
            {/* Header animé */}
            <Animated.View
              style={animatedHeaderStyle}
              className="items-center mb-8"
            >
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4 border border-white/10 bg-white/5">
                <Text className="text-4xl">👤</Text>
              </View>
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
                  <Animated.View
                    style={animatedProgressStyle}
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1 rounded-full"
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
                  disabled={
                    !canProceedToNext() ||
                    currentSection === SECTIONS.length - 1
                  }
                  className={`flex-row items-center py-3 px-6 rounded-full bg-emerald-500 ${
                    !canProceedToNext() ||
                    currentSection === SECTIONS.length - 1
                      ? "opacity-30"
                      : "opacity-100"
                  }`}
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
