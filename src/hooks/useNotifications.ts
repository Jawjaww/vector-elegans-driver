import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useNotifications() {
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Permission not granted');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('rides', {
        name: 'Ride Requests',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF0000',
      });
    }

    return true;
  }, []);

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    try {
      const { data: pushToken } =
        await Notifications.getExpoPushTokenAsync();
      return pushToken;
    } catch (error) {
      console.error('[Notifications] Error getting token:', error);
      return null;
    }
  }, [requestPermissions]);

  const sendPushTokenToServer = useCallback(async (token: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('driver_locations').upsert({
        driver_id: user.id,
        battery_level: 100,
      });
    } catch (error) {
      console.error('[Notifications] Error sending token to server:', error);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const token = await registerForPushNotifications();
      if (token) {
        await sendPushTokenToServer(token);
      }
    };

    init();

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log('[Notifications] Received:', notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log('[Notifications] Response:', response);
      });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [registerForPushNotifications, sendPushTokenToServer]);

  return {
    requestPermissions,
    registerForPushNotifications,
  };
}
