// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import {
  arrivalSourceFromStage,
  isTerminalRingAction,
  resolveOfferLiveness,
  resolveOfferRingAction,
} from '../notifications/offerRing';
import {
  classifyOfferSoundPick,
  offerSoundLabel,
  offerSoundStateFromNative,
  rideChannelSound,
} from '../notifications/offerSound';

/**
 * The sound a woken driver hears.
 *
 * On the wake path the tray entry is deliberately withdrawn, so the `rides` channel never fires
 * and the system has nothing to play: the app is the only thing that can make a sound. That is
 * also what makes the failure modes quiet — a ring for an offer that died in flight, a ring for
 * a tray tap that already sounded, a ring the driver cannot stop.
 *
 * The invariant is one sentence: **the ring exists only where nothing else has sounded, and only
 * while a live offer is on screen**. The native `confirmLaunch()` satisfies neither half — it
 * proves a launch landed — so the decision lives in JS, in `resolveOfferRingAction`, which is
 * tested here for behaviour, and the Kotlin side is pinned to being a player and nothing more.
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
const PUSH_REGISTRATION = 'src/lib/notifications/pushRegistration.ts';
const DASHBOARD = 'app/(tabs)/index.tsx';
const PROFILE = 'app/(tabs)/profile.tsx';
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
const pushRegistration = readSource(PUSH_REGISTRATION);
const dashboard = readSource(DASHBOARD);
const profile = readSource(PROFILE);
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

describe('the ring gate decides, and Kotlin only plays', () => {
  describe('the launch is no longer allowed to arm it', () => {
    // The inverse of what this suite used to assert, and the core of the fix: a confirmed launch
    // proves the wake landed, not that an offer is on screen.
    it('never rings from confirmLaunch', () => {
      expect(functionBody(kotlin, 'fun confirmLaunch(')).not.toContain('startOfferRing');
      expect(functionBody(kotlin, 'fun resolveLaunchVerdict(')).not.toContain('startOfferRing');
      expect(functionBody(kotlin, 'fun onAppForegrounded(')).not.toContain('startOfferRing');
    });

    it('has no call site at all outside its own re-post onto the main thread', () => {
      // Exactly one `startOfferRing()` in the controller, and it is the marshalling hop inside
      // the function itself. A second one anywhere would be a path that rings without asking
      // whether an offer exists.
      expect(callSites(kotlin, 'startOfferRing')).toHaveLength(1);
      expect(callSites(functionBody(kotlin, 'fun startOfferRing('), 'startOfferRing')).toHaveLength(
        1,
      );
    });

    it('is reachable from JS, at every layer', () => {
      expect(moduleKt).toMatch(/Function\("startOfferRing"\)/);
      expect(moduleTs).toContain('startOfferRing(): void');
      expect(overlayService).toContain('export function ringOffer(');
    });

    it('arms only from JS', () => {
      expect(dashboard).toContain('ringOffer()');
      expect(dashboard).toContain('resolveOfferRingAction({');
    });
  });

  describe('what the gate refuses, and why', () => {
    const base = {
      arrivalSource: 'wake' as const,
      isOnline: true,
      liveness: 'live' as const,
      handledArrival: false,
      answered: false,
    };

    it('rings on a wake with a live offer on screen', () => {
      expect(resolveOfferRingAction(base)).toEqual({ kind: 'ring' });
    });

    it('never rings on a tap, which already sounded through the channel', () => {
      expect(
        resolveOfferRingAction({ ...base, arrivalSource: 'tap' }),
      ).toEqual({ kind: 'idle', reason: 'tap_origin' });
    });

    it('never rings for an offer that is not painted yet', () => {
      expect(resolveOfferRingAction({ ...base, liveness: 'pending' })).toEqual({
        kind: 'idle',
        reason: 'not_confirmed',
      });
      expect(resolveOfferRingAction({ ...base, liveness: 'none' })).toEqual({
        kind: 'idle',
        reason: 'no_offer',
      });
    });

    it('stops the ring when the offer dies, even after it started', () => {
      // The case that made the sound lie loudest: the offer is gone, the ring keeps going, and
      // nothing can reach it because the driver has nothing to answer.
      expect(
        resolveOfferRingAction({ ...base, liveness: 'dead', handledArrival: true }),
      ).toEqual({ kind: 'stop', reason: 'offer_dead' });
    });

    it('stops the ring when the driver has already accepted the ride', () => {
      // The measured defect. The accept RPC started at 22:01:02.356 and took 1083 ms, so the
      // ride was still in the deck and the offer confirmed at 02.645 still read as `live`. The
      // effect armed the ring 290 ms after `handleAcceptRide` had stopped it, and a stop with
      // nothing playing cannot cancel a start that has not run yet: the ring played its full
      // 20 s window at a driver who had taken the ride.
      expect(resolveOfferRingAction({ ...base, answered: true })).toEqual({
        kind: 'stop',
        reason: 'answered',
      });

      // Above the latch, which is what makes it survive the paths that set the latch first: an
      // arrival handled by a tray tap, or one re-evaluated by a later render, would come back
      // `already_handled` from a check placed below, and the ring would keep going.
      expect(
        resolveOfferRingAction({ ...base, answered: true, handledArrival: true }),
      ).toEqual({ kind: 'stop', reason: 'answered' });
      expect(
        resolveOfferRingAction({ ...base, answered: true, arrivalSource: 'tap' }),
      ).toEqual({ kind: 'stop', reason: 'answered' });
      // And ahead of the offline refusal, which is also an idle.
      expect(
        resolveOfferRingAction({ ...base, answered: true, isOnline: false }),
      ).toEqual({ kind: 'stop', reason: 'answered' });

      // A dead offer keeps its own reason: the outcome is the same stop, and the more specific
      // cause is the one worth reading in the timeline.
      expect(
        resolveOfferRingAction({ ...base, answered: true, liveness: 'dead' }),
      ).toEqual({ kind: 'stop', reason: 'offer_dead' });

      // Terminal, so the latch is taken and the answer is not re-decided on every render.
      expect(isTerminalRingAction({ kind: 'stop', reason: 'answered' })).toBe(true);
    });

    it('refuses without an online driver, and without an arrival', () => {
      expect(resolveOfferRingAction({ ...base, isOnline: false })).toEqual({
        kind: 'idle',
        reason: 'driver_offline',
      });
      expect(resolveOfferRingAction({ ...base, arrivalSource: null })).toEqual({
        kind: 'idle',
        reason: 'no_arrival',
      });
    });

    it('never rings twice for one arrival', () => {
      expect(resolveOfferRingAction({ ...base, handledArrival: true })).toEqual({
        kind: 'idle',
        reason: 'already_handled',
      });
    });

    it('treats "not yet" as transient, so the decision is revisited', () => {
      // Latching those two would be latching "not yet" as "never", and the offer would come on
      // screen in silence.
      expect(
        isTerminalRingAction({ kind: 'idle', reason: 'not_confirmed' }),
      ).toBe(false);
      expect(isTerminalRingAction({ kind: 'idle', reason: 'no_offer' })).toBe(false);
      expect(isTerminalRingAction({ kind: 'ring' })).toBe(true);
      expect(isTerminalRingAction({ kind: 'idle', reason: 'tap_origin' })).toBe(true);
      expect(isTerminalRingAction({ kind: 'stop', reason: 'offer_dead' })).toBe(true);
    });

    it('reads the arrival source from the stage the notification path reports', () => {
      expect(arrivalSourceFromStage('silent_wake')).toBe('wake');
      expect(arrivalSourceFromStage('tap_received')).toBe('tap');
    });
  });

  describe('the liveness the gate reads', () => {
    it('prefers a painted offer over a notice about another one', () => {
      expect(
        resolveOfferLiveness({ hasLiveOffer: true, hasProvisionalCard: true, hasNotice: true }),
      ).toBe('live');
    });

    it('reads the server verdict as dead, not as pending', () => {
      expect(
        resolveOfferLiveness({ hasLiveOffer: false, hasProvisionalCard: false, hasNotice: true }),
      ).toBe('dead');
    });

    it('reads the unconfirmed payload card as pending', () => {
      expect(
        resolveOfferLiveness({ hasLiveOffer: false, hasProvisionalCard: true, hasNotice: false }),
      ).toBe('pending');
    });

    it('reads nothing at all as none', () => {
      expect(
        resolveOfferLiveness({ hasLiveOffer: false, hasProvisionalCard: false, hasNotice: false }),
      ).toBe('none');
    });
  });

  describe('the ring is logged, so a silence can be told from a fault', () => {
    it('records both outcomes with their reason', () => {
      expect(dashboard).toContain("logOfferStage('ring_armed'");
      expect(dashboard).toContain("logOfferStage('ring_skipped'");
    });

    it('keeps the stages in the pipeline vocabulary', () => {
      const diag = readSource('src/lib/notifications/offerPipelineDiag.ts');
      expect(diag).toContain("'ring_armed'");
      expect(diag).toContain("'ring_skipped'");
      expect(diag).toContain("'sound_picked'");
    });
  });
});

describe('the sound the driver chose', () => {
  describe('three states, none of them collapsed', () => {
    it('reads "never chosen" as the system default', () => {
      expect(offerSoundStateFromNative({ configured: false, silent: false })).toEqual({
        kind: 'default',
      });
      expect(offerSoundStateFromNative(null)).toEqual({ kind: 'default' });
    });

    it('keeps "None" as silence rather than handing the default back', () => {
      expect(offerSoundStateFromNative({ configured: true, silent: true, uri: null })).toEqual({
        kind: 'silent',
      });
      // A configured-but-empty URI is the same answer arriving by the other route.
      expect(offerSoundStateFromNative({ configured: true, silent: false, uri: '' })).toEqual({
        kind: 'silent',
      });
    });

    it('carries a picked URI through', () => {
      expect(
        offerSoundStateFromNative({
          configured: true,
          silent: false,
          uri: 'content://media/internal/audio/media/42',
        }),
      ).toEqual({ kind: 'custom', uri: 'content://media/internal/audio/media/42' });
    });

    it('gives the rides channel the same sound, and silence when silence was chosen', () => {
      expect(rideChannelSound({ kind: 'default' })).toBe('default');
      // `null` is expo-notifications' "this channel is silent", which is not the same request as
      // `'default'`.
      expect(rideChannelSound({ kind: 'silent' })).toBeNull();
      expect(rideChannelSound({ kind: 'custom', uri: 'content://x/1' })).toBe('content://x/1');
    });

    it('says which sound is in force, on the profile row', () => {
      expect(offerSoundLabel({ kind: 'default' })).toBe(
        'Sonnerie par défaut du téléphone',
      );
      expect(offerSoundLabel({ kind: 'silent' })).toBe('Aucun son');
      expect(offerSoundLabel({ kind: 'custom', uri: 'content://x/1' })).toBe(
        'Sonnerie choisie',
      );
    });
  });

  describe('a ROM without a picker is reported, not crashed into', () => {
    it('separates a cancel from an unavailable picker', () => {
      expect(classifyOfferSoundPick({ picked: true, uri: 'content://x/1' })).toEqual({
        outcome: 'picked',
      });
      expect(classifyOfferSoundPick({ picked: false })).toEqual({ outcome: 'cancelled' });
      expect(classifyOfferSoundPick({ picked: false, reason: 'unavailable' })).toEqual({
        outcome: 'unavailable',
      });
      // Nothing back at all — the timeout — is a cancel, never a silent preference change.
      expect(classifyOfferSoundPick(null)).toEqual({ outcome: 'unavailable' });
    });

    it('catches the missing picker instead of letting it throw', () => {
      expect(moduleKt).toContain('ActivityNotFoundException');
      expect(functionBody(kotlin, 'fun offerSoundPreference(')).toBeTruthy();
    });
  });

  describe('the picker itself', () => {
    it('is the system ringtone picker, on the notification sound', () => {
      expect(moduleKt).toContain('RingtoneManager.ACTION_RINGTONE_PICKER');
      expect(moduleKt).toContain('RingtoneManager.TYPE_NOTIFICATION');
      // Silent and default are both offered: "None" is a real answer, and the default is the
      // state a reset restores.
      expect(moduleKt).toContain('EXTRA_RINGTONE_SHOW_SILENT');
      expect(moduleKt).toContain('EXTRA_RINGTONE_SHOW_DEFAULT');
    });

    it('matches its result by request code, and only then answers JS', () => {
      expect(moduleKt).toContain('RINGTONE_PICK_REQUEST');
      expect(moduleKt).toContain('OnActivityResult');
      expect(moduleKt).toMatch(
        /payload\.requestCode\s*!=\s*RINGTONE_PICK_REQUEST/,
      );
    });

    it('is exposed at every layer, with a bounded wait on the JS side', () => {
      expect(moduleTs).toContain('pickOfferSound(): Promise<Record<string, unknown>>');
      expect(moduleTs).toContain('getOfferSound(): Record<string, unknown>');
      expect(moduleTs).toContain('resetOfferSound(): void');
      expect(overlayService).toContain('export async function pickOfferSound(');
      expect(overlayService).toContain('export function getOfferSound(');
      expect(overlayService).toContain('export function resetOfferSound(');
      // A result that never arrives must not leave the caller waiting for the life of the
      // runtime.
      expect(overlayService).toContain('OFFER_SOUND_PICK_TIMEOUT_MS');
      expect(overlayService).toContain('Promise.race');
    });

    it('is offered in the profile, and only where the picker exists', () => {
      expect(profile).toContain('offerSoundSupported');
      expect(profile).toContain('handlePickOfferSound');
      expect(profile).toContain("label: \"Sonnerie d'offre\"");
      expect(profile).toContain('offerSoundLabel(offerSound)');
    });
  });

  describe('the ring plays what was chosen', () => {
    it('rings silence when the driver asked for silence', () => {
      const ring = functionBody(kotlin, 'fun startOfferRing(');
      expect(ring).toContain('reason=silent_setting');
      expect(ring).toContain('.isEmpty()');
    });

    it('falls back to the system sound when the chosen URI cannot be played', () => {
      // A picked `content://` URI may stop being readable after a reboot; losing the sound
      // entirely would be losing the offer.
      const ring = functionBody(kotlin, 'fun startOfferRing(');
      expect(ring).toContain('offerSoundPreference()');
      expect(ring).toContain('ring_default_fallback');
      expect(ring).toContain('RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)');
    });

    it('records the choice where the timeline can see it', () => {
      expect(functionBody(kotlin, 'fun setOfferSoundPreference(')).toContain('sound_picked');
      expect(functionBody(kotlin, 'fun clearOfferSoundPreference(')).toContain('sound_picked');
    });

    it('uses the notification usage, so silent mode and do-not-disturb are honoured', () => {
      const play = functionBody(kotlin, 'private fun playOfferRing(');
      expect(play).toContain('USAGE_NOTIFICATION_EVENT');
      // `USAGE_MEDIA` would ignore the notification volume, and a bare player would ring at
      // 3 a.m. for a driver who had silenced their phone.
      expect(play).not.toContain('USAGE_MEDIA');
    });

    it('releases a player it could not start, so the next offer can still ring', () => {
      const play = functionBody(kotlin, 'private fun playOfferRing(');
      expect(play).toContain('release()');
      expect(play).toMatch(/offerRingPlayer = null/);
    });
  });
});

describe('the ring cannot outlive the offer', () => {
  it('bounds it to the front card countdown, read from the card itself', () => {
    const windowMs = Number(
      /OFFER_RING_WINDOW_MS\s*=\s*([\d_]+)L/.exec(kotlin)?.[1].replace(/_/g, ''),
    );
    const countdownSeconds = Number(/const COUNTDOWN_SECONDS\s*=\s*(\d+)/.exec(offerCard)?.[1]);
    expect(countdownSeconds).toBeGreaterThan(0);
    expect(windowMs).toBe(countdownSeconds * 1000);
  });

  it('arms the stop at the same moment, so no path can ring forever', () => {
    expect(functionBody(kotlin, 'private fun playOfferRing(')).toMatch(
      /postDelayed\(stopOfferRingRunnable,\s*OFFER_RING_WINDOW_MS\)/,
    );
  });

  it('stops on every way an offer can be answered or abandoned', () => {
    expect(functionBody(kotlin, 'private fun onAppBackgrounded(')).toContain('stopOfferRing(');
    expect(functionBody(kotlin, 'fun setDriverOnline(')).toContain('stopOfferRing(');
  });

  it('stops on a dead offer from JS too, which is the case Kotlin cannot see', () => {
    expect(dashboard).toContain('stopOfferRing(action.reason)');
  });

  it('releases the player whichever way it stopped', () => {
    const stop = functionBody(kotlin, 'fun stopOfferRing(');
    expect(stop).toContain('release()');
    expect(stop).toContain('player.stop()');
  });
});

describe('the two paths carry the same sound', () => {
  it('gives the rides channel the chosen sound, not a hardcoded default', () => {
    expect(pushRegistration).toContain('rideChannelSound(getOfferSound())');
    expect(pushRegistration).not.toContain("sound: 'default',");
  });

  it('rebuilds the channel only when the choice changed', () => {
    // Android can only change a channel's sound by deleting and recreating it, which resets the
    // driver's own customisations. Doing that on every launch would be worse than the problem.
    expect(pushRegistration).toContain('RIDES_CHANNEL_SOUND_KEY');
    expect(pushRegistration).toMatch(
      /if \(applied === marker\)[\s\S]*?return 'unchanged';/,
    );
    expect(pushRegistration).toContain('deleteNotificationChannelAsync');
    expect(pushRegistration).toContain("return 'recreated'");
  });

  it('is applied when the driver picks, and the reset is announced', () => {
    expect(profile).toContain('applyRideChannelSound(rideChannelSound(next))');
    expect(profile).toContain('recreated');
  });
});

describe('the driver can stop it', () => {
  it('exposes the stop to JS, at every layer', () => {
    expect(moduleKt).toMatch(/Function\("stopOfferRing"\)/);
    expect(moduleTs).toContain('stopOfferRing(reason: string): void');
    expect(overlayService).toContain('export function stopOfferRing(');
  });

  it('marshals onto the main looper, because the module Function runs on the JS thread', () => {
    const stop = functionBody(kotlin, 'fun stopOfferRing(');
    expect(stop).toContain('Looper.getMainLooper()');
    expect(stop).toMatch(/mainHandler\.post\s*\{/);
    // The same reasoning applies to the start now that JS can call it directly.
    const start = functionBody(kotlin, 'fun startOfferRing(');
    expect(start).toContain('Looper.getMainLooper()');
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

  it('never arms the ring for a ride the driver is already accepting', () => {
    // The other half of the answer, and the half that was missing: stopping before the accept is
    // sent gives the driver immediate feedback, but that stop runs against a ring whose start may
    // not have happened yet — so it cancels nothing. For the ~1 s of the accept round-trip the
    // ride is still in the deck and the offer still reads as `live`, which is exactly when the
    // effect arms. The accepting set is the only signal that says the driver has answered.
    expect(dashboard).toContain('acceptingRideIdsRef.current.has(arrivalRideId)');
    // And the landed answer, which is also the only signal for an accept taken from the shade —
    // that path never goes through the card, so nothing else would stop the ring.
    expect(dashboard).toContain('activeRide?.id === arrivalRideId');
    // Asked inside the gate call rather than acted on beside it: the rule is the gate's, and a
    // fix living next to it is one the next reader of the rule will not find.
    const call = dashboard.slice(dashboard.indexOf('resolveOfferRingAction({'));
    expect(call.slice(0, call.indexOf('})'))).toContain('answered:');
  });
});
