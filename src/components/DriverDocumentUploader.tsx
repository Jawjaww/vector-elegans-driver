import React, { useState } from "react";
import { View, Text, Alert, ActivityIndicator, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
// Use legacy import for readAsStringAsync as main entry point deprecates it in SDK 54+
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

// Fonction de décodage base64 vers ArrayBuffer pour l'upload
const decodeBase64 = (base64: string) => {
  // Sur React Native (Hermes), atob est disponible globalement
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

interface DriverDocumentUploaderProps {
  documentType: string;
  onUploadComplete?: (fileUrl: string) => void;
  driverId?: string;
  currentUrl?: string;
  isEditable?: boolean;
}

export const DriverDocumentUploader: React.FC<DriverDocumentUploaderProps> = ({
  documentType,
  onUploadComplete,
  driverId,
  currentUrl,
  isEditable = true,
}) => {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);

  // Helper to sanitize filenames
  const sanitizeFileName = (fileName: string): string => {
    return fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9.-]/g, "_");
  };

  const pickImage = async () => {
    if (!isEditable) {
      Alert.alert(t("profile.cannotEdit"), t("profile.submittedProfileLocked"));
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
        );
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert(t("common.error"), "Impossible de sélectionner l'image");
    }
  };

  const uploadImage = async (uri: string, fileName: string) => {
    try {
      setUploading(true);
      console.log("Starting upload for:", fileName);

      const sanitizedName = sanitizeFileName(fileName);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error("User not authenticated");
        Alert.alert(t("documents.error"), t("documents.notAuthenticated"));
        setUploading(false);
        return;
      }

      // Récupérer le driver_id depuis la base de données
      let actualDriverId = driverId;
      if (!actualDriverId) {
        const { data: driverData, error: driverError } = await supabase
          .from("drivers")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (driverError || !driverData) {
          console.error("Driver not found for user:", user.id, driverError);
          Alert.alert(t("documents.error"), "Conducteur non trouvé");
          setUploading(false);
          return;
        }

        actualDriverId = driverData.id;
        console.log("Found driver_id:", actualDriverId);
      }

      console.log("Reading file as base64 from URI:", uri);

      // Use FileSystem to read file as base64 (most reliable method for Supabase/RN)
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });

      const arrayBuffer = decodeBase64(base64);
      const mimeType = fileName.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg";

      console.log("ArrayBuffer created, size:", arrayBuffer.byteLength);

      // Upload to Supabase Storage
      const filePath = `${actualDriverId}/${documentType}/${Date.now()}_${sanitizedName}`;
      console.log("Uploading to path:", filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(filePath, arrayBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error("Supabase Storage Upload Error:", uploadError);
        Alert.alert(
          t("documents.error"),
          `Upload failed: ${uploadError.message}`,
        );
        setUploading(false);
        return;
      }

      console.log("Upload successful:", uploadData);

      // Get the public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("driver-documents").getPublicUrl(filePath);

      console.log("Public URL generated:", publicUrl);

      // Call the callback immediately with the URL so the UI updates
      if (onUploadComplete) {
        onUploadComplete(publicUrl);
      }

      // Try to create driver document record in database, but don't block if it fails
      // (The driver might not exist yet in the database)
      try {
        const { error: dbError } = await supabase
          .from("driver_documents")
          .insert([
            {
              driver_id: actualDriverId, // use the resolved driver UUID, not the auth user id
              document_type: documentType,
              file_url: publicUrl,
              file_name: sanitizedName,
              upload_date: new Date().toISOString(),
              validation_status: "pending",
            },
          ]);

        if (dbError) {
          console.warn(
            "Database insertion warning (non-fatal):",
            dbError.message,
          );
          // We don't alert here because the upload was successful and we have the URL
        } else {
          console.log("Database record created successfully");
        }
      } catch (dbErr) {
        console.warn("Database insertion error (non-fatal):", dbErr);
      }
    } catch (error: any) {
      console.error("Unexpected error during upload:", error);
      Alert.alert(t("documents.error"), error.message || "Unknown error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Animated.View layout={Layout.springify()} className="w-full">
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
                <Text className="text-slate-400 text-xs mt-1">
                  {currentUrl
                    ? t("documents.changeFile")
                    : t("documents.formats")}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color="#64748b" />
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
};
