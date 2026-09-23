// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

/**
 * Which service actually receives `com.google.firebase.MESSAGING_EVENT`.
 *
 * Firebase starts exactly one: the first declared, and `android:priority` is not a
 * contract despite reading like one. The merged manifest used to declare three, ours
 * last, so our service was never started — and the failure was invisible from every
 * side. The push arrived, the notification appeared, JS saw nothing unusual; simply no
 * silent wake ever happened, and the only way to reach an offer stayed the tray.
 *
 * A diagnostic run settled it: `push_received` was absent from 23 native records while
 * `pill_shown` and `launch_confirmed` were present, and the notification was still on
 * screen 41 s after the app had returned to the foreground — a withdrawal only
 * `onRideOfferPush` can schedule.
 *
 * The removal must happen in the **app** manifest, not in the module's. A library cannot
 * remove a node contributed by another library of higher merge priority, and the first
 * attempt at this fix was dropped in silence for exactly that reason — a built APK still
 * carried all three services. These assertions therefore pin the mechanism to the config
 * plugin, which writes at the only level where removal is honoured.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const PLUGIN = 'plugins/withRemoveCompetingFcmServices.js';
const APP_CONFIG = 'app.config.js';
const MODULE_MANIFEST = 'modules/ve-overlay/android/src/main/AndroidManifest.xml';
const CONTROLLER =
  'modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeOverlayController.kt';

const OUR_SERVICE = 'expo.modules.veoverlay.VeFirebaseMessagingService';
const EXPO_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const FIREBASE_SERVICE = 'com.google.firebase.messaging.FirebaseMessagingService';

const MESSAGING_EVENT = 'com.google.firebase.MESSAGING_EVENT';

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** What the merger reads: comments may explain the history, code may not. */
function stripComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * The plugin's code, with block comments removed.
 *
 * The mechanism lives in the `module.exports` body, so slicing at that line would cut
 * away the very thing being asserted — the mistake this helper exists to avoid. Comments
 * are stripped because they quote the same vocabulary (`tools:node`), and an assertion
 * satisfied by prose would pass on a plugin whose code had been gutted.
 */
function pluginCode(): string {
  return readSource(PLUGIN).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('FCM service resolution', () => {
  it.each([EXPO_SERVICE, FIREBASE_SERVICE])(
    'removes the competing declaration of %s',
    (competitor) => {
      expect(pluginCode()).toContain(competitor);
    },
  );

  it('marks the removals with tools:node so the merger drops the nodes', () => {
    const plugin = pluginCode();

    // The marker is the whole mechanism: without it the names would be inert strings.
    expect(plugin).toContain("'tools:node': 'remove'");
  });

  it('declares the tools namespace the removal markers need', () => {
    const plugin = pluginCode();

    // Without it `tools:node` is an unknown attribute and the merger keeps the
    // competitor silently, which is indistinguishable from not having written it.
    expect(plugin).toContain("xmlns:tools");
    expect(plugin).toContain('http://schemas.android.com/tools');
  });

  it('is registered by the app config the prebuild reads', () => {
    const appConfig = readSource(APP_CONFIG);

    // Where the removal is *applied* is the whole point: a plugin that exists but is
    // not listed removes nothing, and the build would look identical.
    expect(appConfig).toContain('./plugins/withRemoveCompetingFcmServices');
  });

  it('applies the removal at app level, never in the module manifest', () => {
    const manifest = stripComments(readSource(MODULE_MANIFEST));

    // The first attempt at this fix lived here and was dropped silently, because a
    // library cannot remove a node from a library of higher merge priority. Its return
    // would look like a fix while building an APK that still carries three services.
    expect(manifest).not.toContain('tools:node');
    expect(manifest).not.toContain('xmlns:tools');
  });

  it('declares our service as the handler of the FCM message intent', () => {
    const manifest = readSource(MODULE_MANIFEST);
    const at = manifest.indexOf(`android:name="${OUR_SERVICE}"`);

    expect(at).toBeGreaterThan(-1);
    expect(manifest.slice(at)).toContain(MESSAGING_EVENT);
  });

  it('no longer relies on android:priority to win the resolution', () => {
    const manifest = stripComments(readSource(MODULE_MANIFEST));

    // The removed crutch: `priority="1"` against Expo's `-1` reads like a guarantee and
    // is not one. Its presence now would mean someone reintroduced the wrong defence.
    expect(manifest).not.toContain('android:priority');
  });
});

describe('launch origin', () => {
  it('is a required argument of attemptForeground', () => {
    const controller = readSource(CONTROLLER);

    expect(controller).toMatch(
      /private fun attemptForeground\(\s*\n?\s*context: Context,\s*\n?\s*origin: String\s*\n?\s*\)/,
    );
  });

  it('is passed by every call site', () => {
    const controller = readSource(CONTROLLER);

    // The pill is the second caller. While the log did not name it, a
    // `launch_confirmed` read like proof that the push had arrived — which is how a
    // never-started service stayed hidden through a whole diagnostic run.
    expect(controller).toContain('attemptForeground(application, LAUNCH_ORIGIN_PUSH)');
    expect(controller).toContain('attemptForeground(it, LAUNCH_ORIGIN_PILL)');
  });

  it.each(['launch_requested', 'launch_confirmed', 'launch_refused'])(
    'records the origin on %s',
    (event) => {
      const controller = readSource(CONTROLLER);
      const at = controller.indexOf(`"${event}"`);
      expect(at).toBeGreaterThan(-1);
      // The detail string is the argument that follows the event name.
      const detail = controller.slice(at, at + 220);

      expect(detail).toContain('origin=$origin');
    },
  );
});
