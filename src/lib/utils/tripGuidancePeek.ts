import type { TripStage } from './tripGuidance';

/**
 * Whether the guidance bar is on screen, and when it takes itself away.
 *
 * The bar was a permanent panel over the map, and that was wrong in both directions at once: it
 * stayed for the whole leg, stacked over a sheet that already carries the stage, the addresses
 * and the action button, and it was still there once the driver was driving — which is when the
 * only thing worth reading is the road.
 *
 * It is an announcement now. It emerges when the stage changes, and it leaves on its own once it
 * has nothing left to say. Two things retract it, and they both mean the sentence is no longer
 * news:
 *
 * - the driver has covered `GUIDANCE_READ_METERS` of the route since it was announced;
 * - the sheet is showing the trip body, which holds the same instruction in full — so the bar
 *   would be a second copy of the thing under it.
 *
 * The advance is measured on the *route* (`NavProgress.distanceMeters`) rather than on
 * `currentLocation.speed`, and that choice is the load-bearing one. The store's location is
 * written through a distance throttle (`GPS_STORE_MIN_METERS`): a driver who parks after driving
 * keeps the last *moving* fix in `currentLocation`, speed included, indefinitely — no fix comes
 * in that moves 8 m, so nothing overwrites it. Read as "the vehicle is moving", that stale
 * number would withdraw the announcement of the next trip before the driver had moved at all,
 * which is the very sentence the bar exists to show. Route progress cannot go stale that way: a
 * distance that stops changing is an advance of zero, and an advance of zero keeps the bar up.
 */

/** Route metres the driver must cover before the announcement counts as read. */
export const GUIDANCE_READ_METERS = 15;

/**
 * How long the bar takes to rise out of the sheet, and to sink back into it.
 *
 * Named here rather than in the component because two overlays move on this transition — the
 * bar sinking and the arrival chip it was pushing up — and they have to move together or the
 * pair reads as two elements arguing.
 */
export const GUIDANCE_EMERGE_MS = 220;
export const GUIDANCE_RETRACT_MS = 180;

export type GuidancePeekState = {
  /** Stage the current announcement was armed for. Kept after it retracts, so it stays retired. */
  stage: TripStage | null;
  /** Remaining route distance when that stage was announced, or `null` before the first fix. */
  baselineMeters: number | null;
  /** Greatest advance observed since, in metres. */
  advanceMeters: number;
  /** Set once the driver has covered `GUIDANCE_READ_METERS`. Never cleared within one stage. */
  read: boolean;
};

export const INITIAL_GUIDANCE_PEEK: GuidancePeekState = {
  stage: null,
  baselineMeters: null,
  advanceMeters: 0,
  read: false,
};

export type GuidancePeekObservation = {
  stage: TripStage | null;
  remainingMeters: number | null;
};

/**
 * Folds one observation of the trip into the announcement's life.
 *
 * `stage` is compared against the state's own stage rather than against a `previousStage`
 * argument, and that is not a shortcut: a stage that has been read must NOT be re-announced, and
 * "the stage changed" is the only trigger that may arm one. Keeping the armed stage in the state
 * is what makes a consumed announcement stay consumed while the same stage keeps being reported,
 * which happens on every route tick.
 *
 * A stage with no remaining distance yet — the announcement lands before the route does — arms
 * without a baseline and adopts one from the first fix that arrives. Without that, a stage whose
 * route is computed a second late would never be retired by movement at all.
 */
export function guidancePeekReducer(
  state: GuidancePeekState,
  observation: GuidancePeekObservation,
): GuidancePeekState {
  const { stage, remainingMeters } = observation;

  if (stage === null) {
    return state.stage === null ? state : INITIAL_GUIDANCE_PEEK;
  }

  if (state.stage !== stage) {
    return {
      stage,
      baselineMeters: finiteOrNull(remainingMeters),
      advanceMeters: 0,
      read: false,
    };
  }

  const baselineMeters = state.baselineMeters ?? finiteOrNull(remainingMeters);
  const advanceMeters = Math.max(
    state.advanceMeters,
    advanceSince(baselineMeters, remainingMeters),
  );
  const read = state.read || advanceMeters >= GUIDANCE_READ_METERS;

  if (
    baselineMeters === state.baselineMeters &&
    advanceMeters === state.advanceMeters &&
    read === state.read
  ) {
    return state;
  }

  return { stage, baselineMeters, advanceMeters, read };
}

/**
 * Whether the bar is on screen: announced, not yet read by movement, and not already spelled out
 * by the sheet.
 *
 * `tripVisibleInSheet` is a filter applied at render rather than a flag written into the state,
 * and that is what keeps a stage transition honest. The sheet reaches its `trip` palier in the
 * same commit that the stage becomes `at_pickup`, while the sheet's *settled* palier is only
 * reported a commit later — a latched flag would be set by a stale "the sheet was on `trip`"
 * during the `to_dropoff` transition and swallow that announcement for good. A filter cannot
 * remember the wrong thing.
 */
export function guidancePeekVisible(
  state: GuidancePeekState,
  tripVisibleInSheet: boolean,
): boolean {
  return state.stage !== null && !state.read && !tripVisibleInSheet;
}

/**
 * Metres covered since the announcement, never negative.
 *
 * A running maximum is kept by the caller rather than the latest difference, because a route
 * recomputed mid-leg raises the remaining distance: a plain subtraction would then read as the
 * driver having gone backwards and would forget an advance that genuinely happened.
 */
function advanceSince(
  baselineMeters: number | null,
  remainingMeters: number | null,
): number {
  if (baselineMeters === null || remainingMeters === null) return 0;
  if (!Number.isFinite(remainingMeters)) return 0;
  return Math.max(0, baselineMeters - remainingMeters);
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}
