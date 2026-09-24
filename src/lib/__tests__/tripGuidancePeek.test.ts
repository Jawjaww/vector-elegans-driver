// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import {
  GUIDANCE_EMERGE_MS,
  GUIDANCE_READ_METERS,
  GUIDANCE_RETRACT_MS,
  guidancePeekReducer,
  guidancePeekVisible,
  INITIAL_GUIDANCE_PEEK,
  type GuidancePeekState,
} from '../utils/tripGuidancePeek';
import type { TripStage } from '../utils/tripGuidance';

/**
 * The life of the guidance bar: announced, read, gone.
 *
 * The bar used to be a fixture, and what is pinned here is the difference. Three of these cases
 * are the ones a plausible rewrite would get wrong without any test turning red on its own:
 *
 * - a *stale* speed signal would retire the announcement of a trip the driver has not begun;
 * - a stage that keeps being reported would be re-announced on every route tick;
 * - a route recomputed mid-leg would forget an advance that genuinely happened.
 */

/** One observation of a trip, with the noise of the other fields left out. */
function observe(
  state: GuidancePeekState,
  stage: TripStage | null,
  remainingMeters: number | null,
) {
  return guidancePeekReducer(state, { stage, remainingMeters });
}

/** Fold a series of remaining distances into the announcement's life. */
function fold(
  start: GuidancePeekState,
  stage: TripStage | null,
  distances: readonly (number | null)[],
) {
  return distances.reduce((state, d) => observe(state, stage, d), start);
}

describe('the announcement the guidance bar is', () => {
  it('is announced by the stage that just began', () => {
    const state = observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    expect(state.stage).toBe('to_pickup');
    expect(state.baselineMeters).toBe(3000);
    expect(state.advanceMeters).toBe(0);
    expect(guidancePeekVisible(state, false)).toBe(true);
  });

  it('is retired once the driver has covered the reading distance, and not before', () => {
    const armed = observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    // One metre short of the threshold: the driver is manoeuvring out of a parking space, and
    // withdrawing the instruction there would be the original bug with extra steps.
    const almost = observe(armed, 'to_pickup', 3000 - (GUIDANCE_READ_METERS - 1));
    expect(almost.read).toBe(false);
    expect(guidancePeekVisible(almost, false)).toBe(true);

    const moved = observe(armed, 'to_pickup', 3000 - GUIDANCE_READ_METERS);
    expect(moved.read).toBe(true);
    expect(guidancePeekVisible(moved, false)).toBe(false);
  });

  it('is not retired by a driver who is parked, however long the announcements repeats', () => {
    // What a distance throttle does to the location's *speed*: the driver parks after driving,
    // no fix moves 8 m, and the last moving speed stays in the store for as long as they sit
    // there. Read as "the vehicle is moving", that number would retire this announcement before
    // the driver had done anything at all.
    const parked = fold(INITIAL_GUIDANCE_PEEK, 'to_pickup', [3000, 3000, 3000, 3002, 3000]);
    expect(parked.read).toBe(false);
    expect(guidancePeekVisible(parked, false)).toBe(true);
  });

  it('remembers an advance across a route recomputed mid-leg', () => {
    // The remaining distance going *up* is the driver being sent a longer way round. A plain
    // subtraction would read that as going backwards and reset an advance already made.
    const state = fold(INITIAL_GUIDANCE_PEEK, 'to_pickup', [
      3000, // armed
      2986, // 14 m covered — one short
      3200, // route recomputed, longer than the baseline
      3185, // driving the new route, still above the baseline
    ]);
    expect(state.advanceMeters).toBe(14);
    expect(guidancePeekVisible(state, false)).toBe(true);

    // And the advance still counts once the new route brings the distance back below the
    // baseline: 3000 - 2984 = 16.
    const read = observe(state, 'to_pickup', 2984);
    expect(read.read).toBe(true);
    expect(guidancePeekVisible(read, false)).toBe(false);
  });

  it('does not re-announce a stage it has already retired', () => {
    // The stage is reported on every route tick, so "the stage is being reported" must not read
    // as "the stage just changed" — the bar would come back for the rest of the leg.
    const read = fold(INITIAL_GUIDANCE_PEEK, 'to_pickup', [3000, 2900]);
    expect(guidancePeekVisible(read, false)).toBe(false);
    const later = fold(read, 'to_pickup', [2800, 2700, 2600, 2500]);
    expect(later.read).toBe(true);
    expect(guidancePeekVisible(later, false)).toBe(false);

    // A route recomputed after the bar has retracted must not bring it back either. This is the
    // same running maximum that keeps an advance honest, seen from the other side.
    const recomputed = observe(later, 'to_pickup', 4000);
    expect(recomputed.read).toBe(true);
    expect(guidancePeekVisible(recomputed, false)).toBe(false);
  });

  it('announces the next stage afresh, from the route that stage is on', () => {
    const read = fold(INITIAL_GUIDANCE_PEEK, 'to_pickup', [3000, 2900]);
    const next = observe(read, 'at_pickup', null);
    expect(next.stage).toBe('at_pickup');
    expect(next.read).toBe(false);
    // Waiting at the pickup has no route to cover, so there is no baseline yet...
    expect(next.baselineMeters).toBeNull();
    // ...and no baseline means no retirement: the bar is up until the sheet takes over.
    expect(guidancePeekVisible(next, false)).toBe(true);
  });

  it('adopts a baseline from the first fix, so a late route still retires it', () => {
    // The stage lands before the route is computed. Without adoption, a stage whose route
    // arrived a second late would never be retired by movement at all.
    const armed = observe(INITIAL_GUIDANCE_PEEK, 'to_dropoff', null);
    const withRoute = observe(armed, 'to_dropoff', 8000);
    expect(withRoute.baselineMeters).toBe(8000);
    expect(withRoute.advanceMeters).toBe(0);
    expect(withRoute.read).toBe(false);

    const read = fold(withRoute, 'to_dropoff', [7970, 8120, 8000]);
    // 8000 - 7970 = 30, and the later 8120 does not undo it.
    expect(read.read).toBe(true);
  });

  it('hands over to the trip sheet rather than doubling it', () => {
    // The sheet settled on its trip body already carries the stage, the two addresses and the
    // action button; the bar above it would be a second copy of the same sentence.
    const armed = observe(INITIAL_GUIDANCE_PEEK, 'at_pickup', null);
    expect(guidancePeekVisible(armed, true)).toBe(false);
    // A filter, not a state: the announcement itself is untouched, so a stage transition is
    // never swallowed by the sheet having been open when it arrived.
    expect(armed.read).toBe(false);
    expect(guidancePeekVisible(armed, false)).toBe(true);
  });

  it('says nothing at all without a ride to say it about', () => {
    const read = fold(INITIAL_GUIDANCE_PEEK, 'to_pickup', [3000, 2900]);
    const ended = observe(read, null, null);
    expect(ended).toEqual(INITIAL_GUIDANCE_PEEK);
    expect(guidancePeekVisible(ended, false)).toBe(false);
  });

  it('keeps its state when nothing changed, so a route tick does not churn', () => {
    // The shape of the reducer the dashboard drives from an effect: an unchanged observation has
    // to come back as the same object, or every route push would re-render the overlays.
    const armed = observe(INITIAL_GUIDANCE_PEEK, 'to_pickup', 3000);
    expect(observe(armed, 'to_pickup', 3000)).toBe(armed);
    expect(observe(armed, 'to_pickup', 3200)).toBe(armed);
    // And when it does change, it is a new object.
    const moved = observe(armed, 'to_pickup', 2970);
    expect(moved).not.toBe(armed);
    expect(moved.advanceMeters).toBeGreaterThan(armed.advanceMeters);
  });

  it('is retired by a distance a driver could actually cover, not by a rounding error', () => {
    // Guards the constant itself: zero would retire the bar the instant the route was computed,
    // and a huge value would leave it on screen for the whole leg — the fixture this replaced.
    expect(GUIDANCE_READ_METERS).toBeGreaterThan(5);
    expect(GUIDANCE_READ_METERS).toBeLessThan(100);
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

describe('the wiring that feeds the announcement', () => {
  it('is driven by the dashboard, from the stage and the route', () => {
    const dashboard = readSource(DASHBOARD);
    expect(dashboard).toContain(
      'observeGuidancePeek({ stage: tripStage, remainingMeters })',
    );
    expect(dashboard).toContain(
      'guidancePeekVisible(guidancePeek, tripVisibleInSheet)',
    );
    // The bar is told whether to show, rather than unmounted: the retraction has to animate.
    expect(dashboard).toContain('visible={guidanceVisible}');
    expect(dashboard).toContain('aboveGuidanceBar={guidanceVisible}');
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
    // Two overlays move on the retraction — the bar sinking, the arrival chip dropping into the
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
