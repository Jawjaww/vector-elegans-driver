import * as Notifications from 'expo-notifications';
import { readNotificationData } from './notificationPayload';
import { isRideOfferPush, readString } from './rideOfferPushContent';

/**
 * Closing the tray entry once the driver has answered.
 *
 * The offer push is a data-only message and the tray entry is the fallback: a notification
 * message is drawn by the system even when the process cannot be started, where a data-only one
 * shows nothing in that same case. That fallback has no counterpart — nothing withdraws it. So
 * it stayed in the shade after the driver accepted or refused, still announcing an offer that
 * was long answered, and there is no timeout to retire it.
 *
 * Only the answer closes it. A movement-based dismissal was considered and rejected: nothing on
 * this side observes the vehicle moving, whereas the accept RPC and the same functions that stop
 * the offer ring already know the driver has replied. Leaving with the answer is also what the
 * ring does, and the two are one concern — the driver has been alerted enough.
 */

/**
 * Whether one presented notification is the tray entry for this answer.
 *
 * `rideId` of `null` matches every offer rather than none: it is the sweep that clears entries
 * left behind by an offer the driver answered before this code existed, and matching nothing
 * would silently make that call a no-op.
 */
export function shouldDismissOfferNotification(
  data: Record<string, unknown>,
  rideId: string | null,
): boolean {
  if (!isRideOfferPush(data)) return false;
  if (rideId === null) return true;
  return readString(data.ride_id) === rideId;
}

/**
 * Withdraw every tray entry the driver has answered. Never rejects, never throws.
 *
 * Swept rather than addressed by identifier, and that is deliberate: `ride-offer-<rideId>` is
 * only the identifier when the app draws the notification itself (the foreground path in
 * `useNotifications`). On the fallback path the entry is posted by Expo's own delegate — or by
 * the system for a notification-bearing message — and the identifier is not ours to predict.
 * Filtering on the payload covers both without depending on that detail.
 *
 * Best-effort by design. A tray entry left behind is a nuisance; an exception here would surface
 * as an unhandled rejection, which `expo-updates`' ErrorRecovery turns into a process kill.
 */
export async function dismissOfferNotification(rideId: string | null): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((notification) =>
          shouldDismissOfferNotification(readNotificationData(notification), rideId),
        )
        .map((notification) =>
          Notifications.dismissNotificationAsync(notification.request.identifier),
        ),
    );
  } catch {
    // Unsupported platform, or a tray that could not be read: the offer card is the source of
    // truth either way, and the entry expires with the offer.
  }
}
