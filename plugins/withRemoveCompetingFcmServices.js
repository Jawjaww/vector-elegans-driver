const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Makes `VeFirebaseMessagingService` the only handler of the FCM message intent.
 *
 * Firebase starts exactly one service for `com.google.firebase.MESSAGING_EVENT`, and it
 * is the first declared one: `android:priority` is not a contract despite reading like
 * one. The merged manifest declared three, ours last, so our service was never started —
 * no offer push ever reached the code that brings the app back to the foreground.
 *
 * The removal is applied **here, in the app manifest**, and not in the module's own
 * manifest. A library manifest cannot remove a node contributed by another library of
 * higher merge priority: declarations merge in dependency order (and `expo-notifications`
 * precedes our module), so a `tools:node="remove"` written in the module is silently
 * ignored — the exact class of silent failure this fixes. The app manifest has the
 * highest priority, which is the documented place for removing library-declared nodes.
 *
 * Both competitors declare nothing but this one action, so removing them costs nothing
 * else. Notification presentation lives in `NotificationsService`, a separate receiver
 * that is left alone; our service extends `ExpoFirebaseMessagingService` and calls
 * `super`, so presentation is unchanged either way.
 */

const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

/** Services that must not receive the intent, in merged-manifest order. */
const COMPETING_SERVICES = [
  'expo.modules.notifications.service.ExpoFirebaseMessagingService',
  'com.google.firebase.messaging.FirebaseMessagingService',
];

module.exports = (config) =>
  withAndroidManifest(config, (config) => {
    const { manifest } = config.modResults;

    // `tools:node` is meaningless without the namespace, and Android would keep the
    // competitor without a word — the removal would look applied and not be.
    manifest.$ = manifest.$ ?? {};
    manifest.$['xmlns:tools'] = TOOLS_NAMESPACE;

    const application = manifest.application?.[0];
    if (!application) {
      throw new Error(
        'withRemoveCompetingFcmServices: the app manifest has no <application>, so the competing FCM services cannot be removed.',
      );
    }

    application.service = application.service ?? [];
    for (const name of COMPETING_SERVICES) {
      const already = application.service.some(
        (service) =>
          service?.$?.['android:name'] === name &&
          service?.$?.['tools:node'] === 'remove',
      );
      if (already) continue;
      application.service.push({
        $: { 'android:name': name, 'tools:node': 'remove' },
      });
    }

    return config;
  });
