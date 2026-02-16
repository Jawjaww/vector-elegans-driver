import React, { useState } from 'react';
import { View, Button, Text, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

export const DriverDocumentUploader: React.FC = () => {
  const [uploading, setUploading] = useState(false);

  // Helper to sanitize filenames (same as web version)
  const sanitizeFileName = (fileName: string): string => {
    return fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9.-]/g, '_');
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      await uploadImage(result.assets[0].uri, result.assets[0].fileName || 'document.jpg');
    }
  };

  const uploadImage = async (uri: string, fileName: string) => {
    try {
      setUploading(true);
      
      const sanitizedName = sanitizeFileName(fileName);
      const user = await supabase.auth.getUser();
      
      if (!user.data.user) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }

      // Fetch the file as blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload to Supabase Storage
      const filePath = `tmp/${user.data.user.id}/${Date.now()}_${sanitizedName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(filePath, blob);

      if (uploadError) {
        Alert.alert('Upload Error', uploadError.message);
        return;
      }

      Alert.alert('Success', 'Document uploaded successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to upload document');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Upload your documents</Text>
      {uploading ? (
        <ActivityIndicator size="large" />
      ) : (
        <Button title="Select Document" onPress={pickImage} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 10,
  },
});
