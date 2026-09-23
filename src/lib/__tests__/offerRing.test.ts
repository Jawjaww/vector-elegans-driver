// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

/**
 * The sound a woken driver hears, and the two ways it goes wrong without anyone noticing.
 *
 * On the wake path the tray entry is deliberately withdrawn, so the `rides` channel never
 * fires and the system has nothing to play: the app is the only thing that can make a sound.
 * That is also what makes the failure modes quiet —
 *
 *  - ringing where a notification is *also* drawn, so the driver hears two sounds, and
 *  - ringing past the offer itself, so the driver chases a ride that has already moved on.
 *
 * The assertions below pin the sound to `confirmLaunch`, the one place where the wake is
 * proven *and* the pending notification is cancelled in the same resume, and bound it to the
 * front card's own countdown — read from `OfferRideCard.tsx` rather than copied, because it is
 * one decision taken in two languages.
 *
 * `MediaPlayer` rather than `Ringtone` is load-bearing: `Ringtone.isLooping` only exists from
 * API 28 and `stop()` on a non-looping one is unreliable, so a `Ringtone` could not have been
 * stopped at all on the versions the app still ships to.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const CONTROLLER =
  'modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeOverlayController.kt';
const MODULE = 'modules/ve-overlay/android/src/main/java/expo/modules/veoverlay/VeOverlayModule.kt';
const MODULE_TS = 'modules/ve-overlay/index.ts';
const OVERLAY_SERVICE = 'src/lib/overlay/overlayService.ts';
const DASHBOARD = 'app/(tabs)/index.tsx';
const OFFER_CARD = 'src/components/OfferRideCard.tsx';

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * Kotlin source with its comments removed.
 *
 * Every assertion here is about code, and the comments around the ring quote the same
 * vocabulary (`USAGE_NOTIFICATION_EVENT`, `COUNTDOWN_SECONDS`, `stopOfferRing`). An assertion
 * that prose can satisfy is one that survives the code being gutted. The `//` rule only fires
 * after whitespace, so a `scheme://` inside a literal is left alone.
 */
function stripKotlinComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const kotlin = stripKotlinComments(readSource(CONTROLLER));
const moduleKt = stripKotlinComments(readSource(MODULE));
const moduleTs = readSource(MODULE_TS);
const overlayService = readSource(OVERLAY_SERVICE);
const dashboard = readSource(DASHBOARD);
const offerCard = readSource(OFFER_CARD);

/**
 * The braces-balanced body of a function, from its signature.
 *
 * Slicing to a fixed offset would cut the body away as soon as the comment above it grows, and
 * a `toContain` on an empty string passes for the wrong reason. Balancing braces makes the
 * helper independent of how much prose precedes the code.
 */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`signature not found: ${signature}`);
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error(`no body after: ${signature}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced body: ${signature}`);
}

/** Call sites only: the declaration `private fun startOfferRing()` is not one. */
function callSites(source: string, name: string): RegExpMatchArray[] {
  return [...source.matchAll(new RegExp(`${name}\\(\\)`, 'g'))].filter(
    (match) => !/fun\s+$/.test(source.slice(Math.max(0, (match.index ?? 0) - 8), match.index)),
  );
}

describe('offer ring', () => {
  describe('starts only where nothing else will ring', () => {
    it('is requested from exactly one place in the controller', () => {
      expect(callSites(kotlin, 'startOfferRing')).toHaveLength(1);
    });

    it('is requested from confirmLaunch, the proof that the wake landed', () => {
      expect(functionBody(kotlin, 'private fun confirmLaunch(')).toContain('startOfferRing()');
    });

    it('never rings on the fallback path, which already rings through the channel', () => {
      const fallback = functionBody(kotlin, 'private fun presentOfferFallback(');
      // The proof that this path *does* make a sound: it goes through Expo's delegate, which
      // builds a notification on `rides` — and that channel carries `sound: 'default'`.
      expect(fallback).toContain('onMessageReceived');
      expect(fallback).not.toContain('startOfferRing');
    });

    it('cannot overlap with the tray entry: one resume confirms the wake and withdraws it', () => {
      const foregrounded = functionBody(kotlin, 'private fun onAppForegrounded(');
      expect(foregrounded).toContain('resolveLaunchVerdict()');
      expect(foregrounded).toContain('cancelPendingPresentation(');
      expect(functionBody(kotlin, 'private fun resolveLaunchVerdict(')).toContain('confirmLaunch(');
    });
  });

  describe('respects the driver rather than the app', () => {
    it('uses the notification usage, so silent mode and do-not-disturb are honoured', () => {
      const ring = functionBody(kotlin, 'private fun startOfferRing(');
      expect(ring).toContain('USAGE_NOTIFICATION_EVENT');
      // `USAGE_MEDIA` would ignore the notification volume, and a bare player would ring at
      // 3 a.m. for a driver who had silenced their phone.
      expect(ring).not.toContain('USAGE_MEDIA');
    });

    it("plays the driver's own notification sound, and accepts silence as an answer", () => {
      const ring = functionBody(kotlin, 'private fun startOfferRing(');
      expect(ring).toContain('RingtoneManager.TYPE_NOTIFICATION');
      // The elvis return: a driver who chose "None" gets no sound, and that is not an error.
      expect(ring).toMatch(/getDefaultUri\(RingtoneManager\.TYPE_NOTIFICATION\)\s*\?:/);
    });
  });

  describe('cannot outlive the offer', () => {
    it('bounds the ring to the front card countdown, read from the card itself', () => {
      const windowMs = Number(
        /OFFER_RING_WINDOW_MS\s*=\s*([\d_]+)L/.exec(kotlin)?.[1].replace(/_/g, ''),
      );
      const countdownSeconds = Number(/const COUNTDOWN_SECONDS\s*=\s*(\d+)/.exec(offerCard)?.[1]);
      expect(countdownSeconds).toBeGreaterThan(0);
      expect(windowMs).toBe(countdownSeconds * 1000);
    });

    it('arms the stop at the same moment, so no path can ring forever', () => {
      expect(functionBody(kotlin, 'private fun startOfferRing(')).toMatch(
        /postDelayed\(stopOfferRingRunnable,\s*OFFER_RING_WINDOW_MS\)/,
      );
    });

    it('stops on every way an offer can be answered or abandoned', () => {
      expect(functionBody(kotlin, 'private fun onAppBackgrounded(')).toContain('stopOfferRing(');
      expect(functionBody(kotlin, 'fun setDriverOnline(')).toContain('stopOfferRing(');
    });

    it('releases the player whichever way it stopped', () => {
      const stop = functionBody(kotlin, 'fun stopOfferRing(');
      expect(stop).toContain('release()');
      expect(stop).toContain('player.stop()');
    });
  });

  describe('stops from the driver answer', () => {
    it('exposes the stop to JS, at every layer', () => {
      expect(moduleKt).toMatch(/Function\("stopOfferRing"\)/);
      expect(moduleTs).toContain('stopOfferRing(reason: string): void');
      expect(overlayService).toContain('export function stopOfferRing(');
    });

    it('marshals onto the main looper, because the module Function runs on the JS thread', () => {
      const stop = functionBody(kotlin, 'fun stopOfferRing(');
      expect(stop).toContain('Looper.getMainLooper()');
      expect(stop).toMatch(/mainHandler\.post\s*\{/);
    });

    it('stops before the accept is sent, so the answer feels immediate', () => {
      const accept = functionBody(dashboard, 'const handleAcceptRide = async');
      expect(accept).toContain('stopOfferRing(');
      expect(accept.indexOf('stopOfferRing(')).toBeLessThan(accept.indexOf('acceptTrackedRide('));
    });

    it('stops on the decline funnel the reflex button and the countdown share', () => {
      const decline = functionBody(dashboard, 'const handleDeclineRide = async');
      expect(decline).toContain('stopOfferRing(');
      // Named apart on purpose: a driver who timed out is not a driver who refused, and the
      // diagnostic log is the only place that difference is still visible afterwards.
      expect(decline).toContain('"timed_out"');
      expect(decline).toContain('"declined"');
    });
  });
});
