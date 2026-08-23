import React, { useState } from "react";
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { NativeDateField } from "./NativeDateField";

const decodeBase64 = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.codePointAt(i) ?? 0;
  }
  return bytes.buffer;
};

interface DriverDocumentUploaderProps {
  documentType: string;
  onUploadComplete?: (fileUrl: string, expiryDate: string) => void;
  driverId?: string;
  currentUrl?: string;
  currentExpiry?: string | null;
  isEditable?: boolean;
}

function isValidFutureDate(isoDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

function subtitleForDoc(opts: {
  currentUrl?: string;
  currentExpiry?: string | null;
  expiresOn: string;
  replaceFile: string;
  formats: string;
}): string {
  if (opts.currentExpiry) {
    return `${opts.expiresOn} ${opts.currentExpiry.slice(0, 10)}`;
  }
  if (opts.currentUrl) {
    return opts.replaceFile;
  }
  return opts.formats;
}

export const DriverDocumentUploader: React.FC<
  Readonly<DriverDocumentUploaderProps>
> = ({
  documentType,
  onUploadComplete,
  driverId,
  currentUrl,
  currentExpiry,
  isEditable = true,
}) => {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [expiryDate, setExpiryDate] = useState(
    currentExpiry?.slice(0, 10) ?? "",
  );

  const sanitizeFileName = (fileName: string): string => {
    return fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9.-]/g, "_");
  };

  const resolveDriverId = async (userId: string): Promise<string | null> => {
    if (driverId) return driverId;
    const { data: driverData, error: driverError } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", userId)
      .single();
    if (driverError || !driverData) return null;
    return driverData.id;
  };

  const persistDocumentRow = async (
    actualDriverId: string,
    filePath: string,
    sanitizedName: string,
    byteLength: number,
    expiry: string,
  ): Promise<boolean> => {
    const { data: replaceResult, error: replaceError } = await supabase.rpc(
      "replace_driver_document",
      {
        p_driver_id: actualDriverId,
        p_document_type: documentType,
        p_file_url: filePath,
        p_file_name: sanitizedName,
        p_file_size: byteLength,
        p_expiry_date: expiry,
      },
    );

    if (replaceError) {
      Alert.alert(
        t("documents.error"),
        replaceError.message || t("documents.failedToUpload"),
      );
      return false;
    }

    const replaceOk =
      replaceResult &&
      typeof replaceResult === "object" &&
      "success" in replaceResult &&
      (replaceResult as { success?: boolean }).success;

    if (!replaceOk) {
      const errMsg =
        replaceResult &&
        typeof replaceResult === "object" &&
        "error" in replaceResult
          ? String((replaceResult as { error?: string }).error)
          : t("documents.failedToUpload");
      Alert.alert(t("documents.error"), errMsg);
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    if (!isEditable) {
      Alert.alert(t("profile.cannotEdit"), t("profile.submittedProfileLocked"));
      return;
    }

    if (!isValidFutureDate(expiryDate.trim())) {
      Alert.alert(t("documents.error"), t("documents.expiryRequired"));
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        await uploadImage(
          result.assets[0].uri,
          result.assets[0].fileName || "document.jpg",
          expiryDate.trim(),
        );
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert(t("common.error"), t("documents.pickFailed"));
    }
  };

  const uploadImage = async (
    uri: string,
    fileName: string,
    expiry: string,
  ) => {
    try {
      setUploading(true);

      const sanitizedName = sanitizeFileName(fileName);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert(t("documents.error"), t("documents.notAuthenticated"));
        return;
      }

      const actualDriverId = await resolveDriverId(user.id);
      if (!actualDriverId) {
        Alert.alert(t("documents.error"), t("documents.driverNotFound"));
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
      const arrayBuffer = decodeBase64(base64);
      const mimeType = fileName.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg";

      const filePath = `${actualDriverId}/${documentType}/${Date.now()}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(filePath, arrayBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        const rlsHint = /row-level security|rls|policy/i.test(
          uploadError.message,
        )
          ? " (storage RLS — run infra-supabase/scripts/apply-storage-policies.sh)"
          : "";
        Alert.alert(
          t("documents.error"),
          `${t("documents.failedToUpload")}: ${uploadError.message}${rlsHint}`,
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

      const ok = await persistDocumentRow(
        actualDriverId,
        filePath,
        sanitizedName,
        arrayBuffer.byteLength,
        expiry,
      );
      if (!ok) return;

      onUploadComplete?.(previewUrl, expiry);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("documents.failedToUpload");
      Alert.alert(t("documents.error"), message);
    } finally {
      setUploading(false);
    }
  };

  const subtitle = subtitleForDoc({
    currentUrl,
    currentExpiry,
    expiresOn: t("documents.expiresOn"),
    replaceFile: t("documents.replaceFile"),
    formats: t("documents.formats"),
  });

  return (
    <View className="w-full gap-2">
      <View className="mb-1">
        <Text className="text-xs text-slate-400 mb-1">
          {t("documents.expiryDate")}
        </Text>
        <NativeDateField
          value={expiryDate}
          onChange={setExpiryDate}
          editable={isEditable && !uploading}
          placeholder="YYYY-MM-DD"
          minimumDate={new Date()}
        />
      </View>

      <Pressable
        onPress={pickImage}
        disabled={uploading || !isEditable}
        className={`w-full overflow-hidden rounded-xl border-2 border-dashed ${
          currentUrl
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-slate-600 bg-slate-800/50"
        }`}
      >
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
          <Animated.View
            entering={FadeIn}
            className="py-6 px-4 flex-row items-center justify-between"
          >
            <View className="flex-row items-center flex-1">
              <View
                className={`w-12 h-12 rounded-full items-center justify-center ${
                  currentUrl ? "bg-emerald-500/20" : "bg-slate-700"
                }`}
              >
                <Feather
                  name={currentUrl ? "check" : "upload-cloud"}
                  size={24}
                  color={currentUrl ? "#10b981" : "#94a3b8"}
                />
              </View>
              <View className="ml-4 flex-1">
                <Text
                  className={`font-semibold ${
                    currentUrl ? "text-emerald-400" : "text-slate-400"
                  }`}
                >
                  {currentUrl
                    ? t("documents.uploadSuccess")
                    : t("documents.tapToUpload")}
                </Text>
                <Text className="text-slate-400 text-xs mt-1">{subtitle}</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color="#64748b" />
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
};
