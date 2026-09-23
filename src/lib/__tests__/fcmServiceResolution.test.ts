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
const BUILD_SCRIPT = 'scripts/build-local-apk.sh';
const MODULE_MANIFEST = 'modules/ve-overlay/android/src/main/AndroidManifest.xml';
const CONTROLLER =
  'modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeOverlayController.kt';
const SERVICE =
  'modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeFirebaseMessagingService.kt';
const NOTIFICATIONS_HOOK = 'src/hooks/useNotifications.ts';
const PIPELINE_DIAG = 'src/lib/notifications/offerPipelineDiag.ts';
const PUSH_CONTENT = 'src/lib/notifications/rideOfferPushContent.ts';

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

/**
 * Kotlin source with its comments removed.
 *
 * Needed wherever an assertion is about *order* or about a detail string: a comment quoting
 * the same vocabulary would otherwise be enough to satisfy it, and an assertion that prose can
 * satisfy is an assertion that survives the code being gutted. The `//` rule only fires after
 * whitespace, so a `scheme://` inside a literal is left alone.
 */
function stripKotlinComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
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
    const controller = stripKotlinComments(readSource(CONTROLLER));

    expect(controller).toMatch(
      /private fun attemptForeground\(\s*\n?\s*context: Context,\s*\n?\s*origin: String\s*\n?\s*\)/,
    );
  });

  it('is passed by every call site', () => {
    const controller = stripKotlinComments(readSource(CONTROLLER));

    // The pill is the second caller. While the log did not name it, a
    // `launch_confirmed` read like proof that the push had arrived — which is how a
    // never-started service stayed hidden through a whole diagnostic run.
    expect(controller).toContain('attemptForeground(application, LAUNCH_ORIGIN_PUSH)');
    expect(controller).toContain('attemptForeground(it, LAUNCH_ORIGIN_PILL)');
  });

  it.each(['launch_requested', 'launch_confirmed', 'launch_refused'])(
    'records the origin on %s',
    (event) => {
      const controller = stripKotlinComments(readSource(CONTROLLER));
      const at = controller.indexOf(`"${event}"`);
      expect(at).toBeGreaterThan(-1);
      // The detail string is the argument that follows the event name.
      const detail = controller.slice(at, at + 220);

      expect(detail).toContain('origin=$origin');
    },
  );
});

describe('the FCM probe is unconditional', () => {
  it('records fcm_received before it parses anything', () => {
    const service = stripKotlinComments(readSource(SERVICE));
    const probe = service.indexOf('"fcm_received"');
    const parse = service.indexOf('rideOfferData(remoteMessage)');

    expect(probe).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(-1);
    // Before, not after: a probe behind the payload guard cannot see the case it exists for —
    // a message that arrived and was not recognised as an offer.
    expect(probe).toBeLessThan(parse);
  });

  it('names the keys it received, so the envelope is readable', () => {
    const service = stripKotlinComments(readSource(SERVICE));

    expect(service).toMatch(/keys=\$\{remoteMessage\.data\.keys/);
  });

  it('records why a message was not recognised instead of staying silent', () => {
    const service = stripKotlinComments(readSource(SERVICE));

    expect(service).toContain('"fcm_rejected"');
    expect(service).toMatch(/describeBody\(remoteMessage\)/);
    // Bounded: the body is a whole Expo envelope and it ends up in a log row.
    expect(service).toContain('MAX_LOGGED_BODY');
  });

  it('accepts the same payloads as the JS guard', () => {
    const service = stripKotlinComments(readSource(SERVICE));
    const js = readSource(PUSH_CONTENT);

    // Both halves of one pipeline have to agree. Native requiring `type` alone while JS
    // accepted `ride_id` is what produced a tap that worked and a wake that never fired.
    expect(js).toContain("data.type === 'ride_offer'");
    expect(js).toContain("typeof data.ride_id === 'string'");
    expect(service).toContain('data["type"] == "ride_offer"');
    expect(service).toMatch(/data\["ride_id"\]\.isNullOrBlank\(\)/);
  });
});

describe('the notification is the fallback, not the entry point', () => {
  it('holds the tray entry back while a wake is in flight', () => {
    const service = stripKotlinComments(readSource(SERVICE));

    expect(service).toContain('VeOverlayController.holdOfferPresentation(');
    // Conditional on the wake, and `super` only on the other branch: presenting
    // unconditionally is precisely the behaviour being removed.
    expect(service).toMatch(
      /if \(wakeRequested\) \{[\s\S]*?holdOfferPresentation\([\s\S]*?\} else \{[\s\S]*?super\.onMessageReceived\(remoteMessage\)/,
    );
  });

  it('replays the very message it held back', () => {
    const controller = stripKotlinComments(readSource(CONTROLLER));

    expect(controller).toContain(
      'FirebaseMessagingDelegate(context).onMessageReceived(remoteMessage)',
    );
    // Through the application context: the service is stopped the moment
    // `onMessageReceived` returns, and presenting from it would be presenting from a dead
    // component.
    expect(controller).toMatch(/private fun presentOfferFallback[\s\S]*?appContext \?: return/);
  });

  it('withdraws the hold the moment the app is back', () => {
    const controller = stripKotlinComments(readSource(CONTROLLER));
    const at = controller.indexOf('private fun onAppForegrounded(');

    expect(at).toBeGreaterThan(-1);
    expect(controller.slice(at, at + 400)).toContain('cancelPendingPresentation(');
  });

  it('never asks for a wake that has nowhere to go', () => {
    const controller = stripKotlinComments(readSource(CONTROLLER));

    // Already on screen: Expo's own path is the shortest one and holding the banner back
    // would only delay the notification the app shows itself.
    expect(controller).toMatch(
      /if \(isAppForeground\(\)\) \{[\s\S]*?"no_launch", "app_foreground"[\s\S]*?return false/,
    );
    // Offline: the notification is all the driver gets, so it must not wait either.
    expect(controller).toMatch(
      /if \(!isDriverOnline\(\)\) \{[\s\S]*?"no_launch", "driver_offline"[\s\S]*?return false/,
    );
  });
});

describe('the launch verdict comes from the lifecycle', () => {
  it('confirms on the resume rather than sampling after a delay', () => {
    const controller = stripKotlinComments(readSource(CONTROLLER));

    expect(controller).toMatch(/private fun resolveLaunchVerdict\(\)/);
    expect(controller).toContain('pendingLaunchRequestedAt');
    // The sample reported a refusal for a launch that had in fact succeeded (resumed 127 ms
    // after the request, sampled three seconds later). It survives only as the timeout path.
    expect(controller).toContain('launchVerdict');
  });

  it('reports how long the driver waited', () => {
    const controller = stripKotlinComments(readSource(CONTROLLER));

    expect(controller).toContain('latency_ms=');
  });

  it('keeps ON_START and ON_RESUME apart in the log', () => {
    const controller = stripKotlinComments(readSource(CONTROLLER));

    // The event name is what says whether the window reached RESUMED or stopped at STARTED.
    expect(controller).toMatch(/recordDiagnostic\("app_foregrounded", event\.name\)/);
  });
});

describe('the build identifies itself', () => {
  it('carries an explicit, monotonic versionCode', () => {
    const appConfig = readSource(APP_CONFIG);
    const version = /version:\s*'(\d+)\.(\d+)\.(\d+)'/.exec(appConfig);
    const code = /versionCode:\s*(\d+)/.exec(appConfig);

    expect(version).not.toBeNull();
    expect(code).not.toBeNull();
    // Derived from the version so it can only move forward: Android refuses an in-place
    // update whose versionCode did not increase, and this is the number Settings > Apps
    // shows. Left unset it was 1 for every release, so two builds were indistinguishable.
    const [, major, minor, patch] = version as RegExpExecArray;
    expect(Number((code as RegExpExecArray)[1])).toBe(
      Number(major) * 10000 + Number(minor) * 100 + Number(patch),
    );
  });

  // The assertion above is worthless on its own, and that is not hypothetical: with
  // `appVersionSource: "remote"`, EAS resolves the versionCode from its own servers and
  // ignores `android.versionCode` entirely. An APK was built from a config reading 10007 and
  // shipped versionCode 1 — `aapt2 dump badging` on the binary contradicted the source, while
  // this suite stayed green. The version source is therefore the invariant that has to hold,
  // and it is checked here rather than described in a comment.
  it('has a local version source, without which the config value is ignored', () => {
    const easConfig = JSON.parse(readSource('eas.json')) as {
      cli?: { appVersionSource?: string };
      build?: Record<string, { autoIncrement?: boolean }>;
    };

    expect(easConfig.cli?.appVersionSource).toBe('local');

    // `autoIncrement` with a local source makes EAS bump and write the value back, which on a
    // cloud build means a commit to a `main` this repository protects with a ruleset that no
    // build actor can bypass. The version stays a reviewed value in a pull request.
    const autoIncrementing = Object.entries(easConfig.build ?? {}).filter(
      ([, profile]) => profile.autoIncrement === true,
    );
    expect(autoIncrementing.map(([name]) => name)).toEqual([]);
  });

  it('names the APK after it, so two builds cannot share a name', () => {
    const script = readSource(BUILD_SCRIPT);

    expect(script).toContain('expo.android.versionCode');
    expect(script).toMatch(/ve-driver-\$\{VERSION\}\+\$\{VERSION_CODE\}\.apk/);
    // The fixed name is what let a stale APK pass for the build under test.
    expect(script).not.toContain('ve-driver-${VERSION}-local.apk');
  });

  it('writes the native identity into the decision log', () => {
    const controller = stripKotlinComments(readSource(CONTROLLER));

    // The native log survives an APK update, so a record from an older build reads exactly
    // like a fresh one unless every entry carries the identity of its process.
    expect(controller).toContain('"process_start"');
    expect(controller).toContain('buildIdentity(');
    expect(controller).toContain('longVersionCode');
  });

  it('records which JS bundle is running', () => {
    const hook = readSource(NOTIFICATIONS_HOOK);

    // The APK identity alone is not enough: an update can swap the bundle underneath it.
    expect(hook).toContain("logOfferStage('app_build'");
    expect(hook).toContain('Updates.updateId');
    expect(readSource(PIPELINE_DIAG)).toContain("'app_build'");
  });
});

describe('the native read runs once per runtime', () => {
  it('guards the mount-time read', () => {
    const hook = readSource(NOTIFICATIONS_HOOK);

    // Twenty-one `no_payload` rows in five seconds: the read ran per mount, and every row
    // after the first could only ever be noise — the first one consumes the native payload.
    expect(hook).toContain('initialNativeReadDone');
    expect(hook).toMatch(/if \(initialNativeReadDone\) return;/);
  });

  it('leaves the return to the foreground unguarded', () => {
    const hook = readSource(NOTIFICATIONS_HOOK);

    // Over-guarding would drop a payload that lands while JS is merely in the background.
    expect(hook).toMatch(/consumeSilentWake\(\);\s*\n\s*void registerAndUpsertPushToken/);
  });
});
