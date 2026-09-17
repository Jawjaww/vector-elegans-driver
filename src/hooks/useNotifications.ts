import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  readNotificationData,
  registerAndUpsertPushToken,
  requestRideNotificationPermission,
  notificationResponseEventKey,
  offerActionFromIdentifier,
  queueOfferOpen,
  rideIdFromPushData,
  RIDES_PUSH_CHANNEL_ID,
  shouldOpenHomeFromPushData,
} from '../lib/notifications/pushRegistration';
import { presentationForIncomingPush, SUPPRESS_INCOMING_PUSH } from '../lib/notifications/pushPresentation';
import { bringAppToForeground } from '../lib/overlay/overlayService';
import {
  buildRideOfferPushContent,
  isRideOfferPush,
  RIDE_OFFER_BRAND_COLOR,
  rideOfferNotificationId,
} from '../lib/notifications/rideOfferPushContent';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = readNotificationData(notification);
    const appState = AppState.currentState;

    // A ride offer is handled natively when the overlay pill is on screen: the
    // pill unlocks a background activity launch, so the app comes forward on
    // its own offer card and a tray entry would be a duplicate of it.
    //
    // Suppression is conditional on the launch being *accepted*. Without the
    // overlay permission — or offline, when there is no pill — the launch is
    // refused and the notification keeps its role as the only path to the
    // offer, so the tray and its Accept / Decline buttons still work.
    if (isRideOfferPush(data) && bringAppToForeground()) {
      return SUPPRESS_INCOMING_PUSH;
    }

    if (isRideOfferPush(data) && appState === 'active') {
      const content = buildRideOfferPushContent(
        data,
        notification.request.content,
        { includeSubtitle: Platform.OS === 'ios' },
      );
      await Notifications.scheduleNotificationAsync({
        identifier: rideOfferNotificationId(data),
        content: {
          ...content,
          data,
          ...(Platform.OS === 'android' && {
            channelId: RIDES_PUSH_CHANNEL_ID,
            color: RIDE_OFFER_BRAND_COLOR,
            priority: Notifications.AndroidNotificationPriority.MAX,
          }),
        },
        trigger: null,
      });
      return SUPPRESS_INCOMING_PUSH;
    }

    return presentationForIncomingPush(appState, data);
  },
});

export function useNotifications() {
  const router = useRouter();
  const notificationListener = useRef<Notifications.EventSubscription | null>(
    null,
  );
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastHandledEventKey = useRef<string | null>(null);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  const handleNotificationOpen = useCallback(
    (data: Record<string, unknown>, actionIdentifier: string) => {
      if (!shouldOpenHomeFromPushData(data)) return;
      // Remember the opened ride (and the tray action) so the dashboard can
      // surface it in the overlay even when it already sits in the deferred
      // bottomsheet.
      const rideId = rideIdFromPushData(data);
      if (rideId) {
        queueOfferOpen(rideId, offerActionFromIdentifier(actionIdentifier));
      }
      router.push('/(tabs)/');
    },
    [router],
  );

  const openFromResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      // Keyed by event, not by identifier: the identifier is stable per ride, so
      // identifier-only dedup swallowed the same ride re-offered 30 min later.
      const eventKey = notificationResponseEventKey(response);
      if (lastHandledEventKey.current === eventKey) return;
      lastHandledEventKey.current = eventKey;
      const data = readNotificationData(response.notification);
      console.log('[Notifications] Opened from push:', data);
      handleNotificationOpen(data, response.actionIdentifier);
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
