import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import { openDocumentPreview } from "../lib/documentPreview";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { NativeDateField } from "./NativeDateField";
import { isValidDocumentExpiry } from "../lib/dossierChecklist";

const decodeBase64 = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.codePointAt(i) ?? 0;
  }
  return bytes.buffer;
};

type DocumentValidationStatus = "pending" | "approved" | "rejected";

interface DriverDocumentUploaderProps {
  documentType: string;
  onUploadComplete?: (fileUrl: string, expiryDate: string) => void;
  driverId?: string;
  currentUrl?: string;
  currentExpiry?: string | null;
  documentStatus?: DocumentValidationStatus;
  canReplace?: boolean;
  hasFile?: boolean;
}

function isValidFutureDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.-]/g, "_");
}

function mimeTypeForFileName(fileName: string): string {
  if (fileName.toLowerCase().endsWith(".png")) return "image/png";
  return "image/jpeg";
}

function storageRlsHint(message: string): string {
  if (/row-level security|rls|policy/i.test(message)) {
    return " (storage RLS — run infra-supabase/scripts/apply-storage-policies.sh)";
  }
  return "";
}

function documentStatusLabel(
  hasDocument: boolean,
  isRejected: boolean,
  expiryMissing: boolean,
  t: TFunction,
): string {
  if (!hasDocument) return t("documents.missingDocument");
  if (isRejected) return t("documents.rejectedReplace");
  if (expiryMissing) return t("documents.expiryMissing");
  return t("documents.uploadedPendingReview");
}

function documentStatusColor(
  hasDocument: boolean,
  isRejected: boolean,
  expiryMissing: boolean,
): string {
  if (!hasDocument) return "#94a3b8";
  if (isRejected || expiryMissing) return "#f59e0b";
  return "#10b981";
}

function documentCardClass(
  hasDocument: boolean,
  isRejected: boolean,
  expiryMissing: boolean,
): string {
  const base = "w-full overflow-hidden rounded-xl border-2";
  if (!hasDocument) {
    return `${base} border-dashed border-slate-600 bg-slate-800/50`;
  }
  if (isRejected || expiryMissing) {
    return `${base} border-amber-500/50 bg-amber-500/10`;
  }
  return `${base} border-emerald-500/50 bg-emerald-500/10`;
}

function documentStatusIcon(
  hasDocument: boolean,
  isRejected: boolean,
  expiryMissing: boolean,
): keyof typeof Feather.glyphMap {
  if (!hasDocument) return "upload-cloud";
  if (isRejected || expiryMissing) return "alert-circle";
  return "file-text";
}

function documentIconBackgroundClass(
  hasDocument: boolean,
  isRejected: boolean,
  expiryMissing: boolean,
): string {
  if (!hasDocument) return "bg-slate-700";
  if (isRejected || expiryMissing) return "bg-amber-500/20";
  return "bg-emerald-500/20";
}

function documentHintText(
  expiryMissing: boolean,
  currentExpiry: string | null | undefined,
  t: TFunction,
): string {
  if (expiryMissing) return t("documents.expiryMissingHint");
  if (currentExpiry) {
    return `${t("documents.expiresOn")} ${currentExpiry.slice(0, 10)}`;
  }
  return t("documents.formats");
}

function replaceRpcErrorMessage(replaceResult: unknown, fallback: string): string {
  if (
    replaceResult &&
    typeof replaceResult === "object" &&
    "error" in replaceResult
  ) {
    return String((replaceResult as { error?: string }).error);
  }
  return fallback;
}

function isReplaceRpcSuccess(replaceResult: unknown): boolean {
  return Boolean(
    replaceResult &&
      typeof replaceResult === "object" &&
      "success" in replaceResult &&
      (replaceResult as { success?: boolean }).success,
  );
}

async function resolveDriverId(
  userId: string,
  driverId?: string,
): Promise<string | null> {
  if (driverId) return driverId;
  const { data: driverData, error: driverError } = await supabase
    .from("drivers")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (driverError || !driverData) return null;
  return driverData.id;
}

async function persistDocumentRow(
  t: TFunction,
  params: {
    actualDriverId: string;
    documentType: string;
    filePath: string;
    sanitizedName: string;
    byteLength: number;
    expiry: string;
  },
): Promise<boolean> {
  const { data: replaceResult, error: replaceError } = await supabase.rpc(
    "replace_driver_document",
    {
      p_driver_id: params.actualDriverId,
      p_document_type: params.documentType,
      p_file_url: params.filePath,
      p_file_name: params.sanitizedName,
      p_file_size: params.byteLength,
      p_expiry_date: params.expiry,
    },
  );

  if (replaceError) {
    Alert.alert(
      t("documents.error"),
      replaceError.message || t("documents.failedToUpload"),
    );
    return false;
  }

  if (!isReplaceRpcSuccess(replaceResult)) {
    Alert.alert(
      t("documents.error"),
      replaceRpcErrorMessage(replaceResult, t("documents.failedToUpload")),
    );
    return false;
  }
  return true;
}

async function uploadDriverDocument(
  t: TFunction,
  params: {
    uri: string;
    fileName: string;
    expiry: string;
    documentType: string;
    driverId?: string;
    onUploadComplete?: (fileUrl: string, expiryDate: string) => void;
  },
): Promise<void> {
  const sanitizedName = sanitizeFileName(params.fileName);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    Alert.alert(t("documents.error"), t("documents.notAuthenticated"));
    return;
  }

  const actualDriverId = await resolveDriverId(user.id, params.driverId);
  if (!actualDriverId) {
    Alert.alert(t("documents.error"), t("documents.driverNotFound"));
    return;
  }

  const base64 = await FileSystem.readAsStringAsync(params.uri, {
    encoding: "base64",
  });
  const arrayBuffer = decodeBase64(base64);
  const filePath = `${actualDriverId}/${params.documentType}/${Date.now()}_${sanitizedName}`;

  const { error: uploadError } = await supabase.storage
    .from("driver-documents")
    .upload(filePath, arrayBuffer, {
      contentType: mimeTypeForFileName(params.fileName),
      upsert: false,
    });

  if (uploadError) {
    Alert.alert(
      t("documents.error"),
      `${t("documents.failedToUpload")}: ${uploadError.message}${storageRlsHint(uploadError.message)}`,
    );
    return;
  }

  let previewUrl = filePath;
  const { data: signedData } = await supabase.storage
    .from("driver-documents")
    .createSignedUrl(filePath, 60 * 60 * 24);
  if (signedData?.signedUrl) {
    previewUrl = signedData.signedUrl;
  }

  const ok = await persistDocumentRow(t, {
    actualDriverId,
    documentType: params.documentType,
    filePath,
    sanitizedName,
    byteLength: arrayBuffer.byteLength,
    expiry: params.expiry,
  });
  if (!ok) return;

  params.onUploadComplete?.(previewUrl, params.expiry);
}

const GLASS_BUTTON =
  "flex-1 flex-row items-center justify-center py-2.5 rounded-lg bg-white/10 border border-white/20";
const GLASS_BUTTON_ACCENT =
  "flex-1 flex-row items-center justify-center py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40";
const PRIMARY_BUTTON =
  "flex-1 flex-row items-center justify-center py-2.5 rounded-lg bg-emerald-600 border border-emerald-500/50";

const DocumentActionRow: React.FC<
  Readonly<{
    hasDocument: boolean;
    canReplace: boolean;
    viewing: boolean;
    onView: () => void;
    onPick: () => void;
    t: TFunction;
  }>
> = ({ hasDocument, canReplace, viewing, onView, onPick, t }) => {
  if (!canReplace) {
    return (
      <Pressable
        onPress={() =>
          Alert.alert(
            t("profile.cannotEdit"),
            t("profile.submittedProfileLocked"),
          )
        }
        className={`${GLASS_BUTTON} opacity-80`}
      >
        <Feather name="lock" size={16} color="#94a3b8" />
        <Text className="text-slate-400 text-sm ml-2">
          {t("documents.lockedHint")}
        </Text>
      </Pressable>
    );
  }

  return (
    <>
      {hasDocument ? (
        <Pressable
          onPress={onView}
          disabled={viewing}
          className={GLASS_BUTTON}
        >
          {viewing ? (
            <ActivityIndicator size="small" color="#e2e8f0" />
          ) : (
            <>
              <Feather name="eye" size={16} color="#e2e8f0" />
              <Text className="text-white text-sm font-medium ml-2">
                {t("documents.viewDocument")}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPick}
        className={hasDocument ? GLASS_BUTTON_ACCENT : PRIMARY_BUTTON}
      >
        <Feather
          name={hasDocument ? "refresh-cw" : "upload"}
          size={16}
          color={hasDocument ? "#34d399" : "#fff"}
        />
        <Text
          className={`text-sm font-medium ml-2 ${
            hasDocument ? "text-emerald-300" : "text-white"
          }`}
        >
          {hasDocument
            ? t("documents.replaceDocument")
            : t("documents.tapToUpload")}
        </Text>
      </Pressable>
    </>
  );
};

async function pickDocumentImage(
  t: TFunction,
  canReplace: boolean,
  expiryDate: string,
): Promise<{ uri: string; fileName: string } | null> {
  if (!canReplace) {
    Alert.alert(t("profile.cannotEdit"), t("profile.submittedProfileLocked"));
    return null;
  }

  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("documents.error"), t("documents.pickFailed"));
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    });
    if (result.canceled) return null;

    if (!isValidFutureDate(expiryDate.trim())) {
      Alert.alert(t("documents.error"), t("documents.expiryRequired"));
      return null;
    }

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      fileName: asset.fileName || "document.jpg",
    };
  } catch (error) {
    console.error("Error picking image:", error);
    Alert.alert(t("common.error"), t("documents.pickFailed"));
    return null;
  }
}

async function viewDriverDocument(
  t: TFunction,
  currentUrl: string,
  driverId: string | undefined,
  documentType: string,
): Promise<void> {
  await openDocumentPreview(currentUrl, t, { driverId, documentType });
}

export const DriverDocumentUploader: React.FC<
  Readonly<DriverDocumentUploaderProps>
> = ({
  documentType,
  onUploadComplete,
  driverId,
  currentUrl,
  currentExpiry,
  documentStatus = "pending",
  canReplace = true,
  hasFile,
}) => {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [expiryDate, setExpiryDate] = useState(
    currentExpiry?.slice(0, 10) ?? "",
  );

  useEffect(() => {
    if (currentExpiry) {
      setExpiryDate(currentExpiry.slice(0, 10));
    }
  }, [currentExpiry]);

  const hasDocument = hasFile ?? Boolean(currentUrl);
  const isRejected = documentStatus === "rejected";
  const expiryMissing =
    hasDocument && !isRejected && !isValidDocumentExpiry(currentExpiry);
  const statusColor = documentStatusColor(
    hasDocument,
    isRejected,
    expiryMissing,
  );

  const handlePick = async () => {
    const asset = await pickDocumentImage(t, canReplace, expiryDate);
    if (!asset) return;
    setUploading(true);
    try {
      await uploadDriverDocument(t, {
        uri: asset.uri,
        fileName: asset.fileName,
        expiry: expiryDate.trim(),
        documentType,
        driverId,
        onUploadComplete,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleView = async () => {
    if (!hasDocument) return;
    setViewing(true);
    try {
      await viewDriverDocument(t, currentUrl ?? "", driverId, documentType);
    } finally {
      setViewing(false);
    }
  };

  return (
    <View className="w-full gap-2">
      <View className="mb-1">
        <Text className="text-xs text-slate-400 mb-1">
          {t("documents.expiryDate")}
        </Text>
        <NativeDateField
          value={expiryDate}
          onChange={setExpiryDate}
          editable={canReplace && !uploading}
          placeholder="YYYY-MM-DD"
          minimumDate={new Date()}
        />
      </View>

      <View className={documentCardClass(hasDocument, isRejected, expiryMissing)}>
        {uploading ? (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            className="py-8 items-center justify-center"
          >
            <ActivityIndicator size="large" color="#10b981" />
            <Text className="text-slate-400 mt-3 text-sm font-medium">
              {t("documents.uploading")}
            </Text>
          </Animated.View>
        ) : (
          <View className="py-4 px-4 gap-3">
            <View className="flex-row items-center">
              <View
                className={`w-12 h-12 rounded-full items-center justify-center ${documentIconBackgroundClass(
                  hasDocument,
                  isRejected,
                  expiryMissing,
                )}`}
              >
                <Feather
                  name={documentStatusIcon(
                    hasDocument,
                    isRejected,
                    expiryMissing,
                  )}
                  size={24}
                  color={statusColor}
                />
              </View>
              <View className="ml-4 flex-1">
                <Text className="font-semibold" style={{ color: statusColor }}>
                  {documentStatusLabel(
                    hasDocument,
                    isRejected,
                    expiryMissing,
                    t,
                  )}
                </Text>
                <Text className="text-slate-400 text-xs mt-1">
                  {documentHintText(expiryMissing, currentExpiry, t)}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <DocumentActionRow
                hasDocument={hasDocument}
                canReplace={canReplace}
                viewing={viewing}
                onView={() => {
                  void handleView();
                }}
                onPick={() => {
                  void handlePick();
                }}
                t={t}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
};
