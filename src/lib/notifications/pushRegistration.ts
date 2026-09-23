import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import i18n from '../../i18n';
import { supabase } from '../supabase';
import { publishPushRegisterResult } from './pushStatusStore';
import { getOfferSound } from '../overlay/overlayService';
import { rideChannelSound } from './offerSound';
import {
  RIDE_OFFER_ACCEPT_ACTION,
  RIDE_OFFER_BRAND_COLOR,
  RIDE_OFFER_CATEGORY_ID,
  RIDE_OFFER_DECLINE_ACTION,
} from './rideOfferPushContent';

export {
  consumePendingOfferOpen,
  notificationResponseEventKey,
  offerActionFromIdentifier,
  queueOfferOpen,
  rideIdFromPushData,
  shouldOpenHomeFromPushData,
} from './pushOpen';

/** Android channel id — must match dispatch-push `channelId`. */
export const RIDES_PUSH_CHANNEL_ID = 'rides';

/**
 * Register Accept / Decline buttons on ride_offer notifications.
 *
 * This is what lets a driver answer straight from the tray, locked screen
 * included, instead of waiting for a full-screen takeover. Both titles come from
 * the app locale, and the category id matches what dispatch-push sends.
 */
export async function ensureRideOfferNotificationCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(RIDE_OFFER_CATEGORY_ID, [
    {
      identifier: RIDE_OFFER_ACCEPT_ACTION,
      buttonTitle: i18n.t('ride.offerAccept'),
    },
    {
      identifier: RIDE_OFFER_DECLINE_ACTION,
      buttonTitle: i18n.t('ride.offerDecline'),
      options: { isDestructive: true },
    },
  ]);
}

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
  await applyRideChannelSound(rideChannelSound(getOfferSound()));
}

/**
 * Marker of the sound the `rides` channel currently carries.
 *
 * Needed because Android gives an app no way to change a channel's sound in place — the only
 * lever is to delete and recreate it, which resets whatever the driver had customised on that
 * channel. Remembering what was applied is what keeps that destruction to the single moment the
 * choice actually changed, instead of every launch.
 */
const RIDES_CHANNEL_SOUND_KEY = 'rides_channel_sound_v1';

function rideChannelOptions(sound: string | null) {
  return {
    name: 'Offres de course',
    description: 'Nouvelles courses à accepter sur Vector Elegans',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: RIDE_OFFER_BRAND_COLOR,
    sound,
    enableVibrate: true,
  };
}

/**
 * Give the `rides` channel the same sound the native ring plays.
 *
 * The two must agree or the sound depends on which path the offer took: the silent wake plays
 * through the native player, and a tray notification plays through this channel.
 *
 * Returns `recreated` when the channel was rebuilt, so the caller can warn the driver that their
 * per-channel settings were reset — a change they would otherwise discover as a channel that
 * quietly stopped obeying them.
 */
export async function applyRideChannelSound(
  sound: string | null,
): Promise<'unchanged' | 'recreated'> {
  if (Platform.OS !== 'android') return 'unchanged';
  const marker = sound ?? '';
  const applied = await AsyncStorage.getItem(RIDES_CHANNEL_SOUND_KEY);
  if (applied === marker) {
    // Re-asserted so a channel deleted from the system settings comes back.
    await Notifications.setNotificationChannelAsync(
      RIDES_PUSH_CHANNEL_ID,
      rideChannelOptions(sound),
    );
    return 'unchanged';
  }
  await Notifications.deleteNotificationChannelAsync(RIDES_PUSH_CHANNEL_ID);
  await Notifications.setNotificationChannelAsync(
    RIDES_PUSH_CHANNEL_ID,
    rideChannelOptions(sound),
  );
  await AsyncStorage.setItem(RIDES_CHANNEL_SOUND_KEY, marker);
  return 'recreated';
}

export async function requestRideNotificationPermission(): Promise<boolean> {
  await ensureAndroidRideChannel();
  await ensureRideOfferNotificationCategory();

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
  const result = await registerAndUpsertPushTokenInner();
  publishPushRegisterResult(result);
  return result;
}

async function registerAndUpsertPushTokenInner(): Promise<PushRegisterResult> {
  // Session first, permission second. This runs from the app root, so on a cold start it
  // fires before the driver has signed in; requesting POST_NOTIFICATIONS there would raise
  // the system prompt over the login screen, and a prompt declined once cannot be re-asked.
  // getSession() reads the stored session, so the check costs no round-trip.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { ok: false, reason: 'not_authenticated' };
  }

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
