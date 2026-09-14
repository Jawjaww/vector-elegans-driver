import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  readNotificationData,
  registerAndUpsertPushToken,
  requestRideNotificationPermission,
  shouldOpenHomeFromPushData,
} from '../lib/notifications/pushRegistration';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useNotifications() {
  const router = useRouter();
  const notificationListener = useRef<Notifications.EventSubscription | null>(
    null,
  );
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastHandledResponseId = useRef<string | null>(null);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  const handleNotificationOpen = useCallback(
    (data: Record<string, unknown>) => {
      if (shouldOpenHomeFromPushData(data)) {
        router.push('/(tabs)/');
      }
    },
    [router],
  );

  const openFromResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (lastHandledResponseId.current === id) return;
      lastHandledResponseId.current = id;
      const data = readNotificationData(response.notification);
      console.log('[Notifications] Opened from push:', data);
      handleNotificationOpen(data);
      Notifications.clearLastNotificationResponse();
    },
    [handleNotificationOpen],
  );

  useEffect(() => {
    if (!lastNotificationResponse) return;
    openFromResponse(lastNotificationResponse);
  }, [lastNotificationResponse, openFromResponse]);

  useEffect(() => {
    void registerAndUpsertPushToken();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void registerAndUpsertPushToken();
      }
    });

    const appStateSub = AppState.addEventListener('change', (next) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = next;
      if (wasBackground && next === 'active') {
        void registerAndUpsertPushToken();
      }
    });

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        const data = readNotificationData(notification);
        console.log('[Notifications] Foreground data:', data);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openFromResponse(response);
      });

    return () => {
      subscription.unsubscribe();
      appStateSub.remove();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [openFromResponse]);

  return {
    requestPermissions: requestRideNotificationPermission,
    registerForPushNotifications: registerAndUpsertPushToken,
  };
}
