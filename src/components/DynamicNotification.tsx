import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDriverNotifications, useDriverFolderStatus } from '../lib/stores/driverFolderStore';

interface DynamicNotificationProps {
  className?: string;
}

export const DynamicNotification: React.FC<DynamicNotificationProps> = ({ className }) => {
  const { t } = useTranslation();
  const { notifications, unreadCount, markNotificationAsRead } = useDriverNotifications();
  
  const fadeAnim = new Animated.Value(0);
  const slideAnim = new Animated.Value(-20);

  useEffect(() => {
    if (notifications.length > 0 && unreadCount > 0) {
      // Animation d'entrée
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [notifications.length, unreadCount]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return 'check-circle';
      case 'warning':
        return 'alert-circle';
      case 'error':
        return 'x-circle';
      default:
        return 'info';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'À l\instant';
    if (diffInMinutes < 60) return `Il y a ${diffInMinutes} min`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `Il y a ${diffInHours}h`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `Il y a ${diffInDays}j`;
  };

  const handleNotificationPress = (id: string) => {
    markNotificationAsRead(id);
  };

  // Afficher la notification la plus récente non lue
  const latestNotification = notifications.find(n => !n.read);
  
  if (!latestNotification) {
    return null;
  }

  return (
    <Animated.View 
      className={`${getNotificationColor(latestNotification.type)} rounded-lg p-4 mb-4 ${className}`}
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }]
      }}
    >
      <Pressable 
        onPress={() => handleNotificationPress(latestNotification.id)}
        className="flex-row items-center"
      >
        <Feather 
          name={getNotificationIcon(latestNotification.type)} 
          size={20} 
          color="white" 
          className="mr-3"
        />
        <View className="flex-1">
          <Text className="text-white font-semibold text-sm">
            {latestNotification.title}
          </Text>
          <Text className="text-white text-xs opacity-90 mt-1">
            {latestNotification.message}
          </Text>
          <Text className="text-white text-xs opacity-70 mt-1">
            {formatTimestamp(latestNotification.timestamp)}
          </Text>
        </View>
        <Feather name="x" size={16} color="white" className="ml-2 opacity-70" />
      </Pressable>
    </Animated.View>
  );
};

/**
 * Composant pour afficher le statut actuel du dossier
 */
export const DriverFolderStatusBanner: React.FC = () => {
  const { t } = useTranslation();
  const { status, submittedAt, validatedAt, rejectedAt, rejectionReason } = useDriverFolderStatus();

  const getStatusConfig = () => {
    switch (status) {
      case 'submitted':
        return {
          icon: 'clock' as const,
          title: 'Profil en cours de validation',
          message: 'Votre dossier a été soumis et est en cours de vérification par notre équipe.',
          color: 'bg-yellow-500'
        };
      case 'validated':
        return {
          icon: 'check-circle' as const,
          title: 'Profil validé',
          message: 'Félicitations ! Votre dossier a été validé. Vous pouvez maintenant accepter des courses.',
          color: 'bg-green-500'
        };
      case 'rejected':
        return {
          icon: 'x-circle' as const,
          title: 'Profil rejeté',
          message: rejectionReason || 'Votre dossier a été rejeté. Veuillez corriger les éléments mentionnés.',
          color: 'bg-red-500'
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <View className={`${config.color} rounded-lg p-4 mb-4`}>
      <View className="flex-row items-center">
        <Feather name={config.icon} size={20} color="white" className="mr-3" />
        <View className="flex-1">
          <Text className="text-white font-semibold text-sm">
            {config.title}
          </Text>
          <Text className="text-white text-xs opacity-90 mt-1">
            {config.message}
          </Text>
          {submittedAt && (
            <Text className="text-white text-xs opacity-70 mt-1">
              Soumis le: {new Date(submittedAt).toLocaleDateString('fr-FR')}
            </Text>
          )}
          {validatedAt && (
            <Text className="text-white text-xs opacity-70 mt-1">
              Validé le: {new Date(validatedAt).toLocaleDateString('fr-FR')}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

/**
 * Hook pour gérer les notifications dynamiques
 */
export const useDynamicNotifications = () => {
  const { addNotification } = useDriverNotifications();

  const showSubmissionSuccess = () => {
    addNotification({
      type: 'success',
      title: 'Dossier soumis',
      message: 'Votre dossier a été soumis avec succès et est en cours de validation.'
    });
  };

  const showValidationSuccess = () => {
    addNotification({
      type: 'success',
      title: 'Dossier validé',
      message: 'Félicitations ! Votre dossier a été validé.'
    });
  };

  const showRejection = (reason: string) => {
    addNotification({
      type: 'warning',
      title: 'Dossier rejeté',
      message: `Votre dossier a été rejeté. Raison : ${reason}`
    });
  };

  const showError = (message: string) => {
    addNotification({
      type: 'error',
      title: 'Erreur',
      message: message
    });
  };

  return {
    showSubmissionSuccess,
    showValidationSuccess,
    showRejection,
    showError
  };
};