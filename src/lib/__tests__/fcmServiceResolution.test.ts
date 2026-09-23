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
 * screen 41 s after the app had returned to the foreground — a withdrawal that only
 * `onRideOfferPush` can schedule.
 *
 * These assertions pin the fix, because reverting any one line restores a bug that
 * nothing else in the suite can see.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const MANIFEST = 'modules/ve-overlay/android/src/main/AndroidManifest.xml';
const CONTROLLER =
  'modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeOverlayController.kt';

const OUR_SERVICE = 'expo.modules.veoverlay.VeFirebaseMessagingService';
const EXPO_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const FIREBASE_SERVICE = 'com.google.firebase.messaging.FirebaseMessagingService';

const MESSAGING_EVENT = 'com.google.firebase.MESSAGING_EVENT';

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** A single `<service …>` tag that declares `name`, up to its `/>` or `</service>`. */
function serviceTag(source: string, name: string): string {
  const at = source.indexOf(`android:name="${name}"`);
  expect(at).toBeGreaterThan(-1);
  const start = source.lastIndexOf('<service', at);
  const openEnd = source.indexOf('>', start);
  // A self-closing tag ends its opening tag with `/>`; a tag with children does not,
  // and its `<action … />` children would otherwise be mistaken for the end.
  if (source[openEnd - 1] === '/') return source.slice(start, openEnd + 1);
  const close = source.indexOf('</service>', start);
  return source.slice(start, close === -1 ? source.length : close + '</service>'.length);
}

/** What the merger actually reads: comments may explain the history, code may not. */
function stripComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

describe('FCM service resolution', () => {
  it('declares our service as the handler of com.google.firebase.MESSAGING_EVENT', () => {
    const manifest = readSource(MANIFEST);
    const tag = serviceTag(manifest, OUR_SERVICE);

    expect(tag).toContain(MESSAGING_EVENT);
  });

  it.each([EXPO_SERVICE, FIREBASE_SERVICE])(
    'removes the competing declaration of %s',
    (competitor) => {
      const manifest = readSource(MANIFEST);
      const tag = serviceTag(manifest, competitor);

      expect(tag).toContain('tools:node="remove"');
    },
  );

  it('declares the tools namespace the removal markers need', () => {
    const manifest = readSource(MANIFEST);

    // Without it `tools:node` is an unknown attribute and the merge would keep the
    // competitor silently, which is indistinguishable from not having written it.
    expect(manifest).toContain('xmlns:tools="http://schemas.android.com/tools"');
  });

  it('no longer relies on android:priority to win the resolution', () => {
    const manifest = stripComments(readSource(MANIFEST));

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
