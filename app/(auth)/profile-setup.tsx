import React from 'react';
import { useRouter } from 'expo-router';
import DriverProfileSetup from '../../src/components/DriverProfileSetup';
import { ElegantBackground } from '../../src/components/ElegantBackground';

export default function ProfileSetupScreen() {
  const router = useRouter();

  const handleComplete = () => {
    router.replace('/(tabs)');
  };

  return (
    <ElegantBackground>
      <DriverProfileSetup onComplete={handleComplete} />
    </ElegantBackground>
  );
}