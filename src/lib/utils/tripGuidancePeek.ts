import { isParkedStage, type TripStage } from './tripGuidance';

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
 * ## The two arrival stages are exempt from all of it
 *
 * `at_pickup` and `at_dropoff` are not announcements, they are *states*, and they hold until the
 * stage changes. The driver is already there: there is no ground to cover, so there is no "acted
 * on" this rule could ever detect — while the remaining distance, which would have to stay still
 * to keep the bar up, is recomputed under a parked car and drops for reasons that have nothing to
 * do with driving. The reducer short-circuits both stages before any of the movement logic runs.
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
 * Along-track metres a fresh measurement may sit *behind* the armed origin before the polyline is
 * read as replaced.
 *
 * A reroute restarts the line at the driver, so the new line measures the driver as far *back*
 * along it as the distance already covered on the old one. Ordinary progress only ever moves the
 * measurement forwards, so a fall of more than this slack is a discontinuity — a new line, not a
 * driver who reversed over the last 30 metres. See `realignAlongBaseline`.
 */
export const REROUTE_BASELINE_SLACK_M = 30;

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

  // A stage the announcement is not armed for is a new announcement, whatever the driver did in
  // the meantime: armed and showing, however recently the previous one was read.
  if (state.stage !== stage) {
    return armAnnouncement(stage, remainingMeters, alongTrackMeters, nowMs);
  }

  // An arrival stage is a state, not an announcement, and it leaves when the stage does.
  //
  // There is nothing here for the retire/recall pair to observe. The driver is *at* the place, so
  // there is no ground to cover and therefore no "acted on" to detect — but the distance that
  // would have to stay still is not still: the route is recomputed under a parked car (the
  // destination changes at the pickup, the line is re-drawn, a fix lands 10 m from the last one),
  // and a drop in the remaining distance is indistinguishable from having moved. Left to the
  // generic rule, the sentence the driver is waiting to read would withdraw itself on a route the
  // driver never drove, which is exactly the report: "arriving at the pickup, nothing tells me to
  // wait". So the two arrival stages hold until the stage changes, and their recall budget is
  // untouched because nothing was ever withdrawn.
  if (isParkedStage(stage)) {
    return holdVisible(state);
  }

  const progress = measureAdvance(state, remainingMeters, alongTrackMeters);
  const visibility = resolveVisibility(state, progress, nowMs);
  const next: GuidancePeekState = {
    stage,
    baselineMeters: progress.baselineMeters,
    advanceMeters: progress.advanceMeters,
    baselineAlongMeters: progress.baselineAlongMeters,
    lastProgressAtMs: visibility.lastProgressAtMs,
    visible: visibility.visible,
    recallSpent: visibility.recallSpent,
  };
  // Nothing moved: hand back the *same object*, so a heartbeat that observed nothing re-renders
  // nothing. The dashboard re-runs this every few seconds for the whole ride, and a fresh state
  // would repaint the overlays at that cadence for no reason.
  return sameAnnouncement(state, next) ? state : next;
}

/** A new announcement, armed and showing, with its recall budget intact. */
function armAnnouncement(
  stage: TripStage,
  remainingMeters: number | null,
  alongTrackMeters: number | null,
  nowMs: number,
): GuidancePeekState {
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

type AnnouncementProgress = {
  baselineMeters: number | null;
  baselineAlongMeters: number | null;
  advanceMeters: number;
  /** Whether *this* observation covered ground, which the running maximum cannot answer. */
  advancedNow: boolean;
};

/**
 * How far the announcement has been carried, and whether this observation contributed.
 *
 * The running maximum is kept rather than the latest difference, because a route recomputed
 * mid-leg raises the remaining distance: a plain subtraction would read as the driver having
 * gone backwards and would forget an advance that genuinely happened.
 *
 * `advancedNow` is what the maximum cannot answer. It stays at its peak forever, so it is true on
 * every tick once the driver has moved once — and a stop is only ever visible as the absence of
 * this, never as a negative.
 */
function measureAdvance(
  state: GuidancePeekState,
  remainingMeters: number | null,
  alongTrackMeters: number | null,
): AnnouncementProgress {
  const baselineMeters = state.baselineMeters ?? finiteOrNull(remainingMeters);
  const baselineAlongMeters = realignAlongBaseline(
    state.baselineAlongMeters,
    alongTrackMeters,
    state.advanceMeters,
  );
  const advanceMeters = Math.max(
    state.advanceMeters,
    alongAdvanceSince(baselineAlongMeters, alongTrackMeters),
    advanceSince(baselineMeters, remainingMeters),
  );
  return {
    baselineMeters,
    baselineAlongMeters,
    advanceMeters,
    advancedNow: advanceMeters > state.advanceMeters,
  };
}

/**
 * The along-track origin the current polyline is measured from.
 *
 * A reroute replaces the line with one that starts where the driver currently is. Measured
 * against the old origin the new line would read as a large backwards jump, and the driver would
 * look like they had stopped — which is what the recall timer keys off. Re-basing the origin to
 * the current fix *and subtracting the advance already earned* carries that advance across.
 */
function realignAlongBaseline(
  baselineAlongMeters: number | null,
  alongTrackMeters: number | null,
  advanceMeters: number,
): number | null {
  if (alongTrackMeters === null) return baselineAlongMeters;
  if (baselineAlongMeters === null) return alongTrackMeters;
  if (alongTrackMeters + REROUTE_BASELINE_SLACK_M < baselineAlongMeters) {
    return alongTrackMeters - advanceMeters;
  }
  return baselineAlongMeters;
}

function alongAdvanceSince(
  baselineAlongMeters: number | null,
  alongTrackMeters: number | null,
): number {
  if (baselineAlongMeters === null || alongTrackMeters === null) return 0;
  return Math.max(0, alongTrackMeters - baselineAlongMeters);
}

type AnnouncementVisibility = {
  visible: boolean;
  recallSpent: boolean;
  lastProgressAtMs: number;
};

/**
 * Whether the announcement is on screen after this observation.
 *
 * Ground covered withdraws it, but only once the driver has covered enough of it to have read the
 * sentence (`GUIDANCE_DEPART_METERS`) — and withdrawn is not consumed: the stage is still the
 * driver's instruction, it has simply been acted on. Standing still brings it back once, and only
 * once, at `GUIDANCE_RECALL_MS`: the return covers a single lapse of attention, not a nag.
 */
function resolveVisibility(
  state: GuidancePeekState,
  progress: AnnouncementProgress,
  nowMs: number,
): AnnouncementVisibility {
  if (!progress.advancedNow) {
    const stalledMs = nowMs - state.lastProgressAtMs;
    const shouldRecall =
      !state.visible && !state.recallSpent && stalledMs >= GUIDANCE_RECALL_MS;
    return {
      visible: shouldRecall || state.visible,
      recallSpent: shouldRecall || state.recallSpent,
      lastProgressAtMs: state.lastProgressAtMs,
    };
  }

  return {
    visible: state.visible && progress.advanceMeters < GUIDANCE_DEPART_METERS,
    recallSpent: state.recallSpent,
    lastProgressAtMs: nowMs,
  };
}

/**
 * Whether one observation changed anything at all.
 *
 * The dashboard re-runs the reducer on a heartbeat for the whole ride, so a fold that observed
 * nothing must return the *same object* — a fresh but equal state would re-render every overlay
 * at the tick's cadence for no reason.
 */
function sameAnnouncement(a: GuidancePeekState, b: GuidancePeekState): boolean {
  return (
    a.stage === b.stage &&
    a.baselineMeters === b.baselineMeters &&
    a.advanceMeters === b.advanceMeters &&
    a.baselineAlongMeters === b.baselineAlongMeters &&
    a.lastProgressAtMs === b.lastProgressAtMs &&
    a.visible === b.visible &&
    a.recallSpent === b.recallSpent
  );
}

/**
 * Whether the raised trip sheet already carries the same instruction as the bar.
 *
 * Only the drive to the pickup has a stand-in up there: while the driver is on their way to the
 * customer with the sheet pulled up, it names the pickup, the fare and the customer, and the
 * bar's sentence repeats the destination the sheet is already showing. That is the one case this
 * covers.
 *
 * The two arrival stages are its exact opposite, and suppressing them *was* the bug behind the
 * report "arriving at the pickup, nothing tells me to wait for the customer". They are the only
 * stages where the sheet is forced to its `trip` palier — `resolveDriverHomeSnapLevel` returns
 * `trip` for the whole wait — so `tripVisibleInSheet` is true on every frame, and the bar was
 * withheld for the whole stage, every time, on the assumption that the sheet says the same thing.
 * It does not: the wait shows a status tag (« En attente »), an elapsed timer and a swipe. The
 * sentence is written nowhere else, and the sentence is what was being withheld.
 *
 * `to_dropoff` is exempt for the original layout reason: once the leg starts, the driver may
 * still have the sheet expanded from the pickup swipe, and the next announcement must sit above
 * that sheet rather than vanish or leave a frost ghost with no text.
 */
export function guidanceSuppressedByRaisedTripSheet(
  stage: TripStage | null,
  tripVisibleInSheet: boolean,
): boolean {
  if (!tripVisibleInSheet || stage === null) return false;
  return !isParkedStage(stage) && stage !== 'to_dropoff';
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

/**
 * An arrival stage, held on screen.
 *
 * The same object whenever it is already visible, for the same reason the reducer returns one:
 * the dashboard re-runs this on a heartbeat for the whole stage, and a stage the driver waits out
 * is the longest one there is.
 */
function holdVisible(state: GuidancePeekState): GuidancePeekState {
  return state.visible ? state : { ...state, visible: true };
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}
