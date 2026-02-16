import React, { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthScreen } from '../screens/AuthScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { DocumentUploadScreen } from '../screens/DocumentUploadScreen';
import { supabase } from '../lib/supabase';

export type RootStackParamList = {
  Auth: undefined;
  ProfileSetup: undefined;
  Dashboard: undefined;
  DocumentUpload: { documentType?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const [initialRoute, setInitialRoute] = useState<string>('Auth');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const { data: driver } = await supabase
              .from('drivers')
              .select('status')
              .eq('user_id', user.id)
              .single();

            if (!driver) {
              setInitialRoute('ProfileSetup');
            } else if (driver.status === 'active') {
              setInitialRoute('Dashboard');
            } else if (driver.status === 'incomplete') {
              setInitialRoute('ProfileSetup');
            }
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return null;
  }

  return (
    <Stack.Navigator initialRouteName={initialRoute as keyof RootStackParamList}>
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProfileSetup"
        component={ProfileSetupScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DocumentUpload"
        component={DocumentUploadScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};
