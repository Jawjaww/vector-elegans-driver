import type * as Notifications from 'expo-notifications';

/**
 * The data bag of a presented or received notification, never null.
 *
 * Lives here rather than beside the registration code it used to share a module with, because
 * that module reaches `supabase`, `expo-secure-store` and the native overlay service on import.
 * Any caller that only wants to read a payload would drag all of it along, and the unit tests —
 * which run under `ts-jest` with no module transformation — cannot load it at all. This file
 * imports nothing but a type, so it is usable from everywhere and testable from anywhere.
 *
 * Returning an empty object rather than null keeps every caller from repeating the same guard:
 * a notification with no data is a payload with no fields, not a special case.
 */
export function readNotificationData(
  notification: Notifications.Notification,
): Record<string, unknown> {
  const data = notification.request.content.data;
  return data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : {};
}
