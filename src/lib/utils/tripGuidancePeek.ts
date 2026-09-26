import type { TripStage } from './tripGuidance';

/**
 * Whether the guidance bar is on screen, and when it takes itself away — and brings itself back.
 *
 * The bar was a permanent panel over the map, and that was wrong in both directions at once: it
 * stayed for the whole leg, stacked over a sheet that already carries the stage, the addresses
 * and the action button, and it was still there once the driver was driving — which is when the
 * only thing worth reading is the road.
 *
 * It is an announcement now, and it follows the driver rather than a clock:
 *
 * - **it emerges** when the stage changes;
 * - **it withdraws** as soon as the driver actually pulls away;
 * - **it comes back** after the driver has been sitting still long enough that the instruction is
 *   worth repeating — the case where they stopped to buy water and then forgot which way the
 *   customer was.
 *
 * The retire/recall pair is a hysteresis, not a timer, and the difference is the whole design. A
 * bar that withdrew on a clock would vanish while the driver was still reading it, and a bar that
 * returned on a clock would come back mid-manoeuvre. Both are decided by movement.
 *
 * The return is deliberately capped at **one per stage**. It exists to cover a single lapse of
 * attention, not to nag: a bar that reappeared every two minutes for a twenty-minute leg would
 * be the permanent panel again, arriving in instalments.
 *
 * ## Why the movement signal is route progress, and never `currentLocation.speed`
 *
 * The store's location is written through a distance throttle (`GPS_STORE_MIN_METERS`, 8 m): a
 * driver who parks after driving keeps the last *moving* fix — speed included — indefinitely,
 * because no further fix arrives to overwrite it. Read as "the vehicle is moving", that stale
 * number would withdraw the announcement of a trip the driver had not begun. Route progress
 * cannot go stale that way: a distance that stops changing is an advance of zero, and an advance
 * of zero keeps the bar where it is.
 *
 * The consequence is that "the driver has stopped" can only be observed as *the absence of new
 * progress*, which no message announces. Hence `GUIDANCE_TICK_MS`: the observation is re-run on
 * a heartbeat so a silence can eventually be read as a stop. See the dashboard for how narrowly
 * that interval is scoped.
 */

/**
 * Route metres the driver must cover before the announcement is considered read.
 *
 * The smallest displacement a fix can *prove*, and therefore the only honest threshold: the
 * map's navigation watch filters on `distanceInterval: 8`, so a smaller number would be measuring
 * the drift of a parked car rather than the movement of a driving one.
 */
export const GUIDANCE_DEPART_METERS = 8;

/**
 * How long the driver must go without covering any ground before the announcement returns.
 *
 * Two minutes is long enough that it cannot fire during a red light, a traffic jam or a pause at
 * a junction, and short enough to be useful for the stop it is meant for — the shop, the petrol
 * station, the phone call pulled over to take.
 */
export const GUIDANCE_RECALL_MS = 120_000;

/**
 * How often the announcement's observation is re-run while a ride is in progress.
 *
 * It exists for one reason, and it is not measurement: a parked driver receives no new route
 * progress at all once `distanceInterval: 8` stops the fixes, so without a heartbeat the stop
 * would never be observed and the announcement would never return. Five seconds is well inside
 * the two minutes it is watching, so the recall lands within a tick of when it is due.
 */
export const GUIDANCE_TICK_MS = 5_000;

/**
 * How long the bar takes to rise out of the sheet, and to sink back into it.
 *
 * Named here rather than in the component because two overlays move on this transition — the bar
 * sinking and the arrival chip it was pushing up — and they have to move together or the pair
 * reads as two elements arguing.
 */
export const GUIDANCE_EMERGE_MS = 220;
export const GUIDANCE_RETRACT_MS = 180;

export type GuidancePeekState = {
  /** Stage the current announcement was armed for. */
  stage: TripStage | null;
  /** Remaining route distance when that stage was announced, or `null` before the first fix. */
  baselineMeters: number | null;
  /** Greatest advance observed since, in metres. */
  advanceMeters: number;
  /**
   * Along-track metres when the stage was armed.
   * `null` until a snapped fix arrives. Remaining distance is the fallback.
   */
  baselineAlongMeters: number | null;
  /** When ground was last covered. Also the arming time, before the driver has moved at all. */
  lastProgressAtMs: number;
  /** Whether the announcement is currently on screen. */
  visible: boolean;
  /** Set once the one recall for this stage has been spent. */
  recallSpent: boolean;
};

export const INITIAL_GUIDANCE_PEEK: GuidancePeekState = {
  stage: null,
  baselineMeters: null,
  advanceMeters: 0,
  baselineAlongMeters: null,
  lastProgressAtMs: 0,
  visible: false,
  recallSpent: false,
};

export type GuidancePeekObservation = {
  stage: TripStage | null;
  /** Remaining route distance, or `null` when no route has been computed yet. */
  remainingMeters: number | null;
  /**
   * Metres from the start of the current polyline to the snapped GPS.
   *
   * Posted on every navigation fix. Remaining distance is scaled and used to be
   * throttled, so it could stay flat while the car was already moving.
   */
  alongTrackMeters?: number | null;
  /**
   * Wall clock for this observation, passed in rather than read here.
   *
   * Both because the module stays pure and testable, and because the heartbeat needs a *new*
   * time on every tick while the route pushes need the current one — a value read inside would
   * make those two indistinguishable.
   */
  nowMs: number;
};

/**
 * Folds one observation of the trip into the announcement's life.
 *
 * `stage` is compared against the state's own stage rather than against a `previousStage`
 * argument, and that is not a shortcut: an announcement that has withdrawn must not be re-armed
 * by the same stage being reported again, which happens on every route tick. Keeping the armed
 * stage in the state is what makes a spent announcement stay spent.
 *
 * A stage with no remaining distance yet — the announcement lands before the route does — arms
 * without a baseline and adopts one from the first fix that arrives. Without that, a stage whose
 * route is computed a second late would keep a `null` baseline and never be withdrawn by
 * movement at all.
 */
export function guidancePeekReducer(
  state: GuidancePeekState,
  observation: GuidancePeekObservation,
): GuidancePeekState {
  const { stage, remainingMeters, nowMs } = observation;
  const alongTrackMeters = finiteOrNull(observation.alongTrackMeters ?? null);

  if (stage === null) {
    return state.stage === null ? state : INITIAL_GUIDANCE_PEEK;
  }

  if (state.stage !== stage) {
    return {
      stage,
      baselineMeters: finiteOrNull(remainingMeters),
      advanceMeters: 0,
      baselineAlongMeters: alongTrackMeters,
      lastProgressAtMs: nowMs,
      visible: true,
      recallSpent: false,
    };
  }

  const baselineMeters = state.baselineMeters ?? finiteOrNull(remainingMeters);
  let baselineAlong = state.baselineAlongMeters;
  if (alongTrackMeters !== null) {
    if (baselineAlong === null) {
      baselineAlong = alongTrackMeters;
    } else if (alongTrackMeters + 30 < baselineAlong) {
      // The polyline was replaced. Keep the advance already earned and measure the new line
      // from here, so a reroute does not look like the driver has stopped.
      baselineAlong = alongTrackMeters - state.advanceMeters;
    }
  }
  const alongAdvance =
    baselineAlong !== null && alongTrackMeters !== null
      ? Math.max(0, alongTrackMeters - baselineAlong)
      : 0;
  const advanceMeters = Math.max(
    state.advanceMeters,
    alongAdvance,
    advanceSince(baselineMeters, remainingMeters),
  );
  // Whether *this* observation covered ground, which the running maximum cannot answer: it stays
  // at its peak forever, so it is true on every tick once the driver has moved once. A stop is
  // only visible as the absence of this.
  const advancedNow = advanceMeters > state.advanceMeters;

  let { visible, recallSpent, lastProgressAtMs } = state;

  if (advancedNow) {
    lastProgressAtMs = nowMs;
    if (advanceMeters >= GUIDANCE_DEPART_METERS) {
      // Withdrawn, not consumed: the stage is still the driver's instruction, it has simply been
      // acted on. A recall is what brings it back, and only one of those is spent per stage.
      visible = false;
    }
  } else if (
    !visible &&
    !recallSpent &&
    nowMs - lastProgressAtMs >= GUIDANCE_RECALL_MS
  ) {
    visible = true;
    recallSpent = true;
  }

  if (
    baselineMeters === state.baselineMeters &&
    advanceMeters === state.advanceMeters &&
    baselineAlong === state.baselineAlongMeters &&
    lastProgressAtMs === state.lastProgressAtMs &&
    visible === state.visible &&
    recallSpent === state.recallSpent
  ) {
    // The same object, so a heartbeat that observed nothing re-renders nothing. The dashboard
    // re-runs this every few seconds for the whole ride; returning a fresh state each time would
    // repaint the overlays at that cadence for no reason.
    return state;
  }

  return {
    stage,
    baselineMeters,
    advanceMeters,
    baselineAlongMeters: baselineAlong,
    lastProgressAtMs,
    visible,
    recallSpent,
  };
}

/**
 * Whether the bar is on screen: an announcement that is currently showing, and not already
 * spelled out by the sheet.
 *
 * `tripVisibleInSheet` is a filter applied at render rather than a flag written into the state,
 * and that is what keeps a stage transition honest. The sheet reaches its `trip` palier in the
 * same commit that the stage becomes `at_pickup`, while the sheet's *settled* palier is only
 * reported a commit later — a latched flag would be set by a stale "the sheet was on `trip`"
 * during the `to_dropoff` transition and swallow that announcement for good. A filter cannot
 * remember the wrong thing.
 *
 * It also cannot consume a recall: suppressing the bar because the sheet is already showing the
 * same words is not the driver having read it, so the stage keeps whatever budget it had.
 */
/**
 * Whether the raised trip sheet already carries the same instruction as the bar.
 *
 * `to_dropoff` is excluded on purpose: once the leg starts, the driver may still have the sheet
 * expanded from the pickup swipe, and the next announcement must sit above that sheet rather than
 * vanish or leave a frost ghost with no text.
 */
export function guidanceSuppressedByRaisedTripSheet(
  stage: TripStage | null,
  tripVisibleInSheet: boolean,
): boolean {
  if (!tripVisibleInSheet || stage === null) return false;
  return stage !== 'to_dropoff';
}

export function guidancePeekVisible(
  state: GuidancePeekState,
  tripVisibleInSheet: boolean,
  stage: TripStage | null = null,
): boolean {
  return (
    state.visible &&
    !guidanceSuppressedByRaisedTripSheet(stage, tripVisibleInSheet)
  );
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
