// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import {
  GUIDANCE_DEPART_METERS,
  GUIDANCE_EMERGE_MS,
  GUIDANCE_RECALL_MS,
  GUIDANCE_RETRACT_MS,
  GUIDANCE_TICK_MS,
  guidancePeekReducer,
  guidancePeekVisible,
  INITIAL_GUIDANCE_PEEK,
  type GuidancePeekState,
} from '../utils/tripGuidancePeek';
import type { TripStage } from '../utils/tripGuidance';

/**
 * The life of the guidance bar: announced, acted on, and — once — repeated.
 *
 * The bar used to be a fixture, and the hysteresis that replaced it is the kind of rule a
 * plausible rewrite gets wrong without any test turning red on its own. The cases pinned here
 * are the ones that would:
 *
 * - a *stale* speed signal must not retire an announcement the driver has not begun;
 * - a stage that keeps being reported must not be re-announced on every route tick;
 * - a route recomputed mid-leg must neither count as movement nor reset the stop clock;
 * - the recall exists once, and a second long stop must not bring the bar back;
 * - the heartbeat that makes a stop observable must not be rebuilt by the very messages whose
 *   absence it is watching, or it can never fire at all.
 */

const T0 = 1_700_000_000_000;

/**
 * A clock the test moves by hand.
 *
 * Absolute times rather than accumulated offsets: the assertions below are about *when* a recall
 * falls due, and computing those instants by adding deltas is how a test ends up asserting its
 * own arithmetic instead of the rule.
 */
function makeClock(startMs: number = T0) {
  let now = startMs;
  return {
    now: () => now,
    set: (ms: number) => {
      now = ms;
    },
    observe: (
      state: GuidancePeekState,
      stage: TripStage | null,
      remainingMeters: number | null,
    ) => guidancePeekReducer(state, { stage, remainingMeters, nowMs: now }),
  };
}

const shown = (state: GuidancePeekState): boolean =>
  guidancePeekVisible(state, false);

describe('the announcement the guidance bar is', () => {
  it('is announced by the stage that just began', () => {
    const clock = makeClock();
    const state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    expect(state.stage).toBe('to_pickup');
    expect(state.baselineMeters).toBe(3000);
    expect(state.advanceMeters).toBe(0);
    expect(shown(state)).toBe(true);
  });

  it('withdraws on the first movement a fix can prove, and not before', () => {
    const clock = makeClock();
    const armed = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + 10_000);

    // One metre short of the threshold: a driver manoeuvring out of a parking space, where
    // withdrawing the instruction would be the original bug with extra steps.
    const almost = clock.observe(
      armed,
      'to_pickup',
      3000 - (GUIDANCE_DEPART_METERS - 1),
    );
    expect(shown(almost)).toBe(true);

    const moved = clock.observe(
      armed,
      'to_pickup',
      3000 - GUIDANCE_DEPART_METERS,
    );
    expect(shown(moved)).toBe(false);
    // Withdrawn, not consumed: the stage is still the instruction, and the recall is what brings
    // it back.
    expect(moved.stage).toBe('to_pickup');
    expect(moved.recallSpent).toBe(false);
  });

  it('comes back after the driver has been stopped long enough, and not a moment before', () => {
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + 10_000);
    state = clock.observe(state, 'to_pickup', 2990);
    expect(shown(state)).toBe(false);

    clock.set(T0 + 10_000 + GUIDANCE_RECALL_MS - 1);
    state = clock.observe(state, 'to_pickup', 2990);
    expect(shown(state)).toBe(false);

    clock.set(T0 + 10_000 + GUIDANCE_RECALL_MS);
    state = clock.observe(state, 'to_pickup', 2990);
    expect(shown(state)).toBe(true);
    expect(state.recallSpent).toBe(true);
  });

  it('comes back once, and only once', () => {
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + 10_000);
    state = clock.observe(state, 'to_pickup', 2990);

    clock.set(T0 + 10_000 + GUIDANCE_RECALL_MS);
    state = clock.observe(state, 'to_pickup', 2990);
    expect(shown(state)).toBe(true);

    // The driver sets off again, so the announcement withdraws a second time...
    clock.set(T0 + 200_000);
    state = clock.observe(state, 'to_pickup', 2800);
    expect(shown(state)).toBe(false);

    // ...and a second long stop brings nothing back: it is a lapse of attention being covered,
    // not a reminder on a schedule.
    clock.set(T0 + 200_000 + 5 * GUIDANCE_RECALL_MS);
    state = clock.observe(state, 'to_pickup', 2800);
    expect(shown(state)).toBe(false);
  });

  it('treats a new stage as a fresh announcement, recall included', () => {
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + 10_000);
    state = clock.observe(state, 'to_pickup', 2990);
    clock.set(T0 + 10_000 + GUIDANCE_RECALL_MS);
    state = clock.observe(state, 'to_pickup', 2990);
    expect(state.recallSpent).toBe(true);

    // Arrived at the pickup. A different job, and the same right to one lapse of attention on it.
    clock.set(T0 + 400_000);
    state = clock.observe(state, 'at_pickup', null);
    expect(shown(state)).toBe(true);
    expect(state.recallSpent).toBe(false);
    expect(state.advanceMeters).toBe(0);
    expect(state.baselineMeters).toBeNull();
  });

  it('is not retired by a driver who is parked, however long the announcement repeats', () => {
    // What a distance throttle does to the location's *speed*: the driver parks after driving, no
    // fix moves 8 m, and the last moving speed stays in the store for as long as they sit there.
    // Read as "the vehicle is moving", that number would retire an announcement the driver had
    // not yet acted on.
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    for (let i = 1; i <= 5; i++) {
      clock.set(T0 + i * GUIDANCE_RECALL_MS);
      state = clock.observe(state, 'to_pickup', 3000);
      expect(shown(state)).toBe(true);
    }
    // And no budget was spent, because nothing withdrew it in the first place.
    expect(state.recallSpent).toBe(false);
  });

  it('remembers an advance across a route recomputed mid-leg', () => {
    // The remaining distance going *up* is the driver being sent a longer way round. A plain
    // subtraction would read that as going backwards and reset an advance already made.
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + 10_000);
    state = clock.observe(state, 'to_pickup', 2986);
    expect(state.advanceMeters).toBe(14);
    expect(shown(state)).toBe(false);

    clock.set(T0 + 20_000);
    state = clock.observe(state, 'to_pickup', 3200);
    expect(state.advanceMeters).toBe(14);

    clock.set(T0 + 30_000);
    state = clock.observe(state, 'to_pickup', 2984);
    expect(state.advanceMeters).toBe(16);
  });

  it('does not read a lengthened route as movement, so the stop clock keeps running', () => {
    // The other half of the running maximum, and the one a careless implementation loses: a
    // longer route is not ground covered, so it must not push the recall further away.
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + 10_000);
    state = clock.observe(state, 'to_pickup', 2990);
    expect(shown(state)).toBe(false);

    // Recomputed, now longer, well before the recall falls due.
    clock.set(T0 + 40_000);
    state = clock.observe(state, 'to_pickup', 3400);

    clock.set(T0 + 10_000 + GUIDANCE_RECALL_MS);
    state = clock.observe(state, 'to_pickup', 3400);
    expect(shown(state)).toBe(true);
  });

  it('does not re-announce a stage it has already withdrawn', () => {
    // The stage is reported on every route tick, so "the stage is being reported" must not read
    // as "the stage just changed" — the bar would come back for the rest of the leg.
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + 10_000);
    state = clock.observe(state, 'to_pickup', 2990);

    for (const remaining of [2980, 2970, 2960, 2900]) {
      clock.set(clock.now() + GUIDANCE_TICK_MS);
      state = clock.observe(state, 'to_pickup', remaining);
      expect(shown(state)).toBe(false);
    }

    // And a route recomputed after the withdrawal must not bring it back either.
    clock.set(clock.now() + GUIDANCE_TICK_MS);
    state = clock.observe(state, 'to_pickup', 4000);
    expect(shown(state)).toBe(false);
  });

  it('adopts a baseline from the first fix, so a late route still withdraws it', () => {
    // The stage lands before the route is computed. Without adoption, a stage whose route arrived
    // a second late would keep a null baseline and never be withdrawn by movement at all.
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_dropoff', null);
    expect(state.baselineMeters).toBeNull();
    expect(shown(state)).toBe(true);

    clock.set(T0 + 1_000);
    state = clock.observe(state, 'to_dropoff', 8000);
    expect(state.baselineMeters).toBe(8000);
    expect(state.advanceMeters).toBe(0);
    expect(shown(state)).toBe(true);

    clock.set(T0 + 20_000);
    state = clock.observe(state, 'to_dropoff', 7970);
    expect(shown(state)).toBe(false);
  });

  it('hands over to the trip sheet rather than doubling it, and charges nothing for it', () => {
    // The sheet settled on its trip body already carries the stage, the two addresses and the
    // action button. Suppressing the bar there is not the driver having read it, so the budget
    // must survive: a stage suppressed for a whole leg would otherwise have no recall left.
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'at_pickup', null);
    expect(guidancePeekVisible(state, true)).toBe(false);

    clock.set(T0 + 10 * GUIDANCE_RECALL_MS);
    state = clock.observe(state, 'at_pickup', null);
    expect(state.recallSpent).toBe(false);
    expect(state.visible).toBe(true);

    // And the moment the driver lowers the sheet, the instruction is there again.
    expect(guidancePeekVisible(state, false)).toBe(true);
  });

  it('says nothing at all without a ride to say it about', () => {
    const clock = makeClock();
    let state = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + 10_000);
    state = clock.observe(state, 'to_pickup', 2990);

    const ended = clock.observe(state, null, null);
    expect(ended).toEqual(INITIAL_GUIDANCE_PEEK);
    expect(guidancePeekVisible(ended, false)).toBe(false);
  });

  it('keeps its state when nothing changed, so a heartbeat does not churn', () => {
    // The shape of the reducer the dashboard drives: an unchanged observation has to come back as
    // the same object, or a tick every five seconds would repaint the overlays for no reason.
    const clock = makeClock();
    const armed = clock.observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    clock.set(T0 + GUIDANCE_TICK_MS);
    expect(clock.observe(armed, 'to_pickup', 3000)).toBe(armed);
    // A longer route is also a non-event.
    expect(clock.observe(armed, 'to_pickup', 3200)).toBe(armed);

    clock.set(T0 + 2 * GUIDANCE_TICK_MS);
    const moved = clock.observe(armed, 'to_pickup', 2970);
    expect(moved).not.toBe(armed);
    expect(moved.advanceMeters).toBeGreaterThan(armed.advanceMeters);
  });

  it('is driven by thresholds a driver could actually produce', () => {
    // Guards the constants themselves: zero would withdraw the bar the instant the route was
    // computed, and a huge departure would leave it on screen for the whole leg — the fixture
    // this replaced.
    expect(GUIDANCE_DEPART_METERS).toBeGreaterThan(0);
    expect(GUIDANCE_DEPART_METERS).toBeLessThanOrEqual(20);
    // Long enough not to fire at a red light, short enough for the stop it is meant for.
    expect(GUIDANCE_RECALL_MS).toBeGreaterThan(30_000);
    // The heartbeat has to be well inside the stop it is watching, or the recall would land late
    // enough to look like a separate bug.
    expect(GUIDANCE_TICK_MS).toBeLessThan(GUIDANCE_RECALL_MS / 10);
  });
});

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const DASHBOARD = 'app/(tabs)/index.tsx';
const BOTTOM_SHEET = 'src/components/BottomSheet.tsx';
const GUIDANCE_BAR = 'src/components/TripGuidanceBar.tsx';
const ARRIVAL_HUD = 'src/components/TripArrivalHud.tsx';

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * The heartbeat effect, from its own guard to the end of the file.
 *
 * Anchored on the guard rather than on `setInterval(` because the dashboard runs other polls —
 * a first-occurrence search would silently describe one of those instead, and the test would pass
 * while asserting nothing about the heartbeat.
 */
function heartbeatSource(dashboard: string): string {
  return dashboard.slice(dashboard.indexOf('if (tripStage === null) return;'));
}

describe('the wiring that feeds the announcement', () => {
  it('is driven by the dashboard, from the stage, the route and a clock', () => {
    const dashboard = readSource(DASHBOARD);
    expect(dashboard).toContain(
      'observeGuidancePeek({ stage: tripStage, remainingMeters, nowMs: Date.now() });',
    );
    expect(dashboard).toContain(
      'guidancePeekVisible(guidancePeek, tripVisibleInSheet)',
    );
    // The bar is told whether to show, rather than unmounted: the retraction has to animate.
    expect(dashboard).toContain('visible={guidanceVisible}');
    expect(dashboard).toContain('aboveGuidanceBar={guidanceVisible}');
  });

  it('beats only while a ride is in progress', () => {
    const dashboard = readSource(DASHBOARD);
    const heartbeat = heartbeatSource(dashboard);
    expect(heartbeat).toContain('if (tripStage === null) return;');
    expect(heartbeat).toContain('guidanceFactsRef.current');
    expect(heartbeat).toContain('}, GUIDANCE_TICK_MS);');
    expect(heartbeat).toContain('clearInterval(id)');
  });

  it('never lets a route push rebuild the heartbeat', () => {
    // The subtle one, and the reason the heartbeat reads a ref: it exists to observe the
    // *absence* of route progress, so making the distance a dependency would have every push tear
    // the interval down and rebuild it. A timer rebuilt more often than its own period never
    // fires, and the recall would simply never happen — with nothing in a log to say why.
    const deps = /\n  \}, \[([^\]]*)\]\);/.exec(
      heartbeatSource(readSource(DASHBOARD)),
    );
    expect(deps?.[1]).toBe('tripStage');
  });

  it('knows when the sheet is showing the trip, from the sheet itself', () => {
    // `snapLevel` is only the palier the sheet is asked for; a drag settles wherever the driver
    // let go, so the dashboard cannot derive this and must be told.
    expect(readSource(DASHBOARD)).toContain('onSettle={setSheetSettledAt}');
    // Both sources are needed: the palier the sheet heads for lands in the same commit as the
    // stage, the settled one a commit later.
    expect(readSource(DASHBOARD)).toContain('bottomSheetSnapLevel === "trip"');
    expect(readSource(DASHBOARD)).toContain('sheetSettledAt === "trip"');
  });

  it('reports every palier the sheet settles on, a drag included', () => {
    const sheet = readSource(BOTTOM_SHEET);
    // The drag path is the only one that knows where the sheet ended up, so it reports...
    expect(sheet).toMatch(/scheduleOnRN\(applySnapLevel, level, true\)/);
    // ...and the programmatic re-settle reports, while the redundant runs of that effect do not:
    // they are handed the target, and reporting from them would erase a drag's palier.
    expect(sheet).toContain('onSettleRef.current?.(next.snap)');
    // Held in a ref: rebuilding the pan gestures on every render would restart a drag in flight.
    expect(sheet).toContain('onSettleRef.current = onSettle');
  });

  it('moves the bar and the chip it lifts on the same clock', () => {
    // Two overlays move on the withdrawal — the bar sinking, the arrival chip dropping into the
    // slot under it — and they share the durations or they read as two elements arguing.
    for (const file of [GUIDANCE_BAR, ARRIVAL_HUD]) {
      const source = readSource(file);
      expect(source).toContain('GUIDANCE_EMERGE_MS');
      expect(source).toContain('GUIDANCE_RETRACT_MS');
    }
    expect(GUIDANCE_EMERGE_MS).toBeGreaterThan(0);
    expect(GUIDANCE_RETRACT_MS).toBeGreaterThan(0);
  });

  it('keeps the arrival chip on screen, which the bar does not', () => {
    // The instruction is news; the ETA is not. A chip that faded with the bar would take the one
    // number worth reading for the whole leg, so only the bar binds an opacity to its state.
    expect(readSource(GUIDANCE_BAR)).toContain('opacity: shown');
    expect(readSource(ARRIVAL_HUD)).not.toMatch(/opacity:\s*(lift|shown)/);
  });
});
