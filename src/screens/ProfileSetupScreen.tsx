import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import type { StackNavigationProp } from '@react-navigation/stack';

type ProfileSetupScreenProps = {
  navigation: StackNavigationProp<any>;
};

interface FormData {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  vtcCardNumber: string;
  vtcCardExpiry: string;
  licenseNumber: string;
  licenseExpiry: string;
  insuranceNumber: string;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    vtcCardNumber: '',
    vtcCardExpiry: '',
    licenseNumber: '',
    licenseExpiry: '',
    insuranceNumber: '',
  });

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Not authenticated');
        return;
      }

      const { error } = await supabase.from('drivers').insert({
        user_id: user.id,
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        address_line1: formData.address,
        city: formData.city,
        postal_code: formData.postalCode,
        vtc_card_number: formData.vtcCardNumber,
        vtc_card_expiry_date: formData.vtcCardExpiry,
        driving_license_number: formData.licenseNumber,
        driving_license_expiry_date: formData.licenseExpiry,
        insurance_number: formData.insuranceNumber,
        status: 'pending_validation',
      });

      if (error) throw error;

      Alert.alert(
        t('common.success'),
        t('profile.pendingValidation'),
        [{ text: 'OK', onPress: () => navigation.replace('Auth') }]
      );
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View>
            <Text style={styles.stepTitle}>{t('profile.personalInfo')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('profile.firstName')}
              value={formData.firstName}
              onChangeText={(v) => updateField('firstName', v)}
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.lastName')}
              value={formData.lastName}
              onChangeText={(v) => updateField('lastName', v)}
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.phone')}
              value={formData.phone}
              onChangeText={(v) => updateField('phone', v)}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.address')}
              value={formData.address}
              onChangeText={(v) => updateField('address', v)}
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.city')}
              value={formData.city}
              onChangeText={(v) => updateField('city', v)}
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.postalCode')}
              value={formData.postalCode}
              onChangeText={(v) => updateField('postalCode', v)}
              keyboardType="numeric"
            />
          </View>
        );
      case 2:
        return (
          <View>
            <Text style={styles.stepTitle}>{t('profile.professionalInfo')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('profile.vtcCardNumber')}
              value={formData.vtcCardNumber}
              onChangeText={(v) => updateField('vtcCardNumber', v)}
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.vtcCardExpiry')}
              value={formData.vtcCardExpiry}
              onChangeText={(v) => updateField('vtcCardExpiry', v)}
              placeholderTextColor="#999"
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.licenseNumber')}
              value={formData.licenseNumber}
              onChangeText={(v) => updateField('licenseNumber', v)}
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.licenseExpiry')}
              value={formData.licenseExpiry}
              onChangeText={(v) => updateField('licenseExpiry', v)}
              placeholderTextColor="#999"
            />
            <TextInput
              style={styles.input}
              placeholder={t('profile.insuranceNumber')}
              value={formData.insuranceNumber}
              onChangeText={(v) => updateField('insuranceNumber', v)}
            />
          </View>
        );
      case 3:
        return (
          <View>
            <Text style={styles.stepTitle}>{t('profile.documents')}</Text>
            <Text style={styles.documentInfo}>
              {t('documents.upload')}
            </Text>
            <TouchableOpacity style={styles.uploadButton}>
              <Text style={styles.uploadButtonText}>
                {t('profile.uploadDocument')}
              </Text>
            </TouchableOpacity>
          </View>
        );
      case 4:
        return (
          <View>
            <Text style={styles.stepTitle}>{t('profile.validation')}</Text>
            <Text style={styles.summaryText}>
              {t('profile.firstName')}: {formData.firstName}
            </Text>
            <Text style={styles.summaryText}>
              {t('profile.lastName')}: {formData.lastName}
            </Text>
            <Text style={styles.summaryText}>
              {t('profile.phone')}: {formData.phone}
            </Text>
            <Text style={styles.summaryText}>
              {t('profile.city')}: {formData.city}
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('profile.setup')}</Text>
        <Text style={styles.stepIndicator}>
          {step} / 4
        </Text>
      </View>

      <View style={styles.form}>{renderStep()}</View>

      <View style={styles.buttons}>
        {step > 1 && (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        )}

        {step < 4 ? (
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>{t('common.next')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>{t('common.submit')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  stepIndicator: {
    marginTop: 10,
    color: '#666',
  },
  form: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  documentInfo: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  uploadButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  summaryText: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  backButton: {
    backgroundColor: '#9E9E9E',
    padding: 15,
    borderRadius: 8,
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  nextButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 8,
    flex: 1,
    marginLeft: 10,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
});
