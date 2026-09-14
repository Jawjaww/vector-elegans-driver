import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

const EAS_PROJECT_ID =
  Constants.expoConfig?.extra?.eas?.projectId ??
  Constants.easConfig?.projectId;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function readNotificationData(
  notification: Notifications.Notification,
): Record<string, unknown> {
  const data = notification.request.content.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

export function useNotifications() {
  const router = useRouter();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

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

    if (!EAS_PROJECT_ID) {
      console.error('[Notifications] Missing EAS projectId in app.config extra.eas');
      return null;
    }

    try {
      const { data: pushToken } = await Notifications.getExpoPushTokenAsync({
        projectId: EAS_PROJECT_ID,
      });
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

      const { error } = await supabase.rpc('upsert_push_token', {
        p_token: token,
        p_platform: 'expo',
        p_device_label: Platform.OS,
      });
      if (error) {
        console.error('[Notifications] upsert_push_token:', error.message);
      }
    } catch (error) {
      console.error('[Notifications] Error sending token to server:', error);
    }
  }, []);

  const syncPushToken = useCallback(async () => {
    const token = await registerForPushNotifications();
    if (token) {
      await sendPushTokenToServer(token);
    }
  }, [registerForPushNotifications, sendPushTokenToServer]);

  const handleNotificationOpen = useCallback(
    (data: Record<string, unknown>) => {
      const type = typeof data.type === 'string' ? data.type : null;
      if (type === 'ride_offer' || data.ride_id) {
        router.push('/(tabs)/');
      }
    },
    [router],
  );

  useEffect(() => {
    void syncPushToken();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void syncPushToken();
      }
    });

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = readNotificationData(notification);
        console.log('[Notifications] Foreground data:', data);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = readNotificationData(response.notification);
        console.log('[Notifications] Opened from push:', data);
        handleNotificationOpen(data);
      });

    return () => {
      subscription.unsubscribe();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [syncPushToken, handleNotificationOpen]);

  return {
    requestPermissions,
    registerForPushNotifications,
  };
}
