import { useNotifications } from '../hooks/useNotifications';

/** Registers Expo push token and notification listeners for signed-in drivers. */
export function PushNotificationsBootstrap() {
  useNotifications();
  return null;
}
