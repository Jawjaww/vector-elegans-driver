import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DriverDocumentUploader } from '../components/DriverDocumentUploader';

interface DocumentUploadScreenProps {
  navigation: any;
  route?: {
    params?: {
      documentType?: string;
    };
  };
}

export const DocumentUploadScreen: React.FC<DocumentUploadScreenProps> = ({ route }) => {
  const documentType = route?.params?.documentType || 'general';
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Document Upload</Text>
      <DriverDocumentUploader documentType={documentType} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
});