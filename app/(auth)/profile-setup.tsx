import React, { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import DriverProfileSetup from '../../src/components/DriverProfileSetup';
import { ElegantBackground } from '../../src/components/ElegantBackground';

export default function ProfileSetupScreen() {
  const router = useRouter();

  const handleComplete = () => {
    router.replace('/(tabs)');
  };

  const handleExitToHome = () => {
    router.replace('/(tabs)');
  };

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(tabs)');
        return true;
      });
      return () => sub.remove();
    }, [router]),
  );

  return (
    <ElegantBackground>
      <DriverProfileSetup
        onComplete={handleComplete}
        onExitToHome={handleExitToHome}
      />
    </ElegantBackground>
  );
}