import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

export { shouldOpenHomeFromPushData } from './pushOpen';

/** Android channel id — must match dispatch-push `channelId`. */
export const RIDES_PUSH_CHANNEL_ID = 'rides';

export type PushRegisterFailureReason =
  | 'permission_denied'
  | 'no_project_id'
  | 'token_failed'
  | 'not_authenticated'
  | 'upsert_failed';

export type PushRegisterResult =
  | { ok: true }
  | { ok: false; reason: PushRegisterFailureReason };

export function readNotificationData(
  notification: Notifications.Notification,
): Record<string, unknown> {
  const data = notification.request.content.data;
  return data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : {};
}

/**
 * Android 13+ shows POST_NOTIFICATIONS only after a channel exists.
 * Call this before get/requestPermissions and getExpoPushTokenAsync.
 */
export async function ensureAndroidRideChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(RIDES_PUSH_CHANNEL_ID, {
    name: 'Ride Requests',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF0000',
    sound: 'default',
    enableVibrate: true,
  });
}

export async function requestRideNotificationPermission(): Promise<boolean> {
  await ensureAndroidRideChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === 'granted';
}

function resolveEasProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

/** Request permission (channel-first on Android), then upsert the Expo token. */
export async function registerAndUpsertPushToken(): Promise<PushRegisterResult> {
  const granted = await requestRideNotificationPermission();
  if (!granted) {
    console.warn('[Notifications] Permission not granted');
    return { ok: false, reason: 'permission_denied' };
  }

  const projectId = resolveEasProjectId();
  if (!projectId) {
    console.error(
      '[Notifications] Missing EAS projectId in app.config extra.eas',
    );
    return { ok: false, reason: 'no_project_id' };
  }

  let pushToken: string;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    pushToken = data;
  } catch (error) {
    console.error('[Notifications] Error getting token:', error);
    return { ok: false, reason: 'token_failed' };
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, reason: 'not_authenticated' };
    }

    const { error } = await supabase.rpc('upsert_push_token', {
      p_token: pushToken,
      p_platform: 'expo',
      p_device_label: Platform.OS,
    });
    if (error) {
      console.error('[Notifications] upsert_push_token:', error.message);
      return { ok: false, reason: 'upsert_failed' };
    }
    return { ok: true };
  } catch (error) {
    console.error('[Notifications] Error sending token to server:', error);
    return { ok: false, reason: 'upsert_failed' };
  }
}
