/**
 * Instrumented stages of the offer display pipeline, and of the guidance that follows it.
 *
 * Navigation shares this sink deliberately: an accepted ride and the guidance it starts are one
 * sequence in the driver's experience, and splitting them across two tables would cost a second
 * retention policy and a second reader to answer a single question.
 *
 * The failure this exists for is a latency, not an error: an FCM offer notification opens the
 * app, but the offer card only appears tens of seconds later. Every plausible cause — the
 * dashboard boot serialising six round-trips, the Realtime channel not yet subscribed, the 5 s
 * catch-up poll, or a late offer read declaring the offer dead — produces the same symptom and
 * cannot be told apart from the UI. These markers make the gap auditable.
 *
 * The vocabulary is deliberately a plain union rather than an enum: it is an observability
 * channel, not a domain model, and it will keep changing while the bug is chased.
 */
export const OFFER_PIPELINE_STAGES = [
  /** The FCM response handler ran, before any store write. */
  'tap_received',
  /**
   * The native side brought the app forward on its own, without a tap and without showing a
   * notification. Distinguished from `tap_received` because the two have different causes when
   * they are slow: a tap is already inside JS, whereas a silent wake also crossed the process
   * start and the Activity launch.
   */
  'silent_wake',
  /**
   * One decision taken in Kotlin, replayed from the bounded native log. Carries `native_at`
   * (the device clock when it happened) so the delay before JS ever ran stays measurable, and
   * the live native state (`hasPermission`, `driverOnline`, `appForeground`, `pillVisible`).
   */
  'native_diag',
  /**
   * Which JS bundle this runtime is actually executing. The native `process_start` entry
   * carries the APK's `versionName`/`versionCode`; this is the other half of the identity —
   * the OTA update the device downloaded. An APK can be current while a stale bundle runs
   * underneath it, and nothing else in the pipeline can see that.
   */
  'app_build',
  /** The ride id was written to the driver store's pendingOfferOpen. */
  'pending_queued',
  /**
   * The device reported receiving the offer push, so the server's fallback sweep can leave it
   * alone. `outcome` is `ok` | `no_id` | `error` | `threw`. This is the only evidence that
   * separates "the app was woken" from "the app never started", and the two are otherwise
   * indistinguishable on the server — hence a row here rather than a swallowed promise.
   */
  'push_acked',
  /**
   * One awaited step of the dashboard boot, with its wall-clock duration.
   * `step` is `auth` | `drivers` | `dossier_status` | `locations` | `assigned_ride`.
   * Exists because `boot_ready` alone cannot say which of the boot round-trips cost the
   * time, and that is the very latency being investigated.
   */
  'boot_step',
  /** The dashboard boot exposed the identity (driver id + status) the pipeline needs. */
  'boot_ready',
  /** The notification-open effect started reading the offer. */
  'fetch_started',
  /** The offer read returned. `kind` is the resolved outcome, plus offer status/alive. */
  'fetch_result',
  /** The ride was pushed to the front of the offer stack. */
  'promoted',
  /**
   * The offer ring was asked for. Only ever reached on the silent-wake path, with a live offer
   * painted: the wake draws no notification, so nothing else has made a sound. See
   * `src/lib/notifications/offerRing.ts` for the gate that decides this.
   */
  'ring_armed',
  /**
   * The ring was deliberately refused, or stopped because the offer died or was answered.
   * `reason` is `tap_origin` | `driver_offline` | `no_offer` | `not_confirmed` |
   * `already_handled` | `offer_dead` | `answered` — the only way to tell "the ring is silent by
   * design" from "the ring is broken", which the driver experiences identically.
   */
  'ring_skipped',
  /**
   * The driver chose a ringtone, or went back to the system default. Recorded natively and
   * replayed here, so a change of sound is visible in the same timeline as the offers it
   * applies to.
   */
  'sound_picked',
  /**
   * The offer card laid out with a non-zero size, i.e. the driver can actually see it.
   * The gap between `promoted` and this stage is the part the boot gate and the entry
   * animations used to hide: the ride was in the store but not on screen.
   */
  'offer_painted',
  /** No overlay was shown; `reason` carries the OfferNoticeReason. */
  'notice',
  /** Realtime channel status change (SUBSCRIBED, TIMED_OUT, CHANNEL_ERROR, CLOSED). */
  'channel_status',
  /** The catch-up poll returned rides, i.e. the poll is what surfaced the offer. */
  'poll_tick',
  /** The driver pressed Accept (carousel button or tray action). */
  'accept_tapped',
  /** The accept RPC returned, with its wall-clock duration. */
  'accept_rpc_end',
  /**
   * The ride became the active ride. Recorded in the same timeline as the offer stages on
   * purpose: the guidance work starts here, and a `nav_*` marker with no `accept_ok` before it
   * names a different bug than one with it.
   */
  'accept_ok',
  /** The accept path failed; `error` carries the message. */
  'accept_error',
  /**
   * The dashboard boot adopted the driver's assigned ride, or confirmed the one already open.
   * Navigation stages share this sink with the offer pipeline on purpose: the two are the same
   * investigation (what the driver actually saw, in order), and a separate channel would need
   * its own retention and its own reader for no gain.
   */
  'nav_assigned_ride_adopted',
  /** The assigned-ride read confirmed the ride already open, with fresher columns. */
  'nav_assigned_ride_refreshed',
  /**
   * A null assigned-ride read was discarded because it was issued before the local Accept.
   * Present here so the race is visible instead of silently ending a trip.
   */
  'nav_assigned_ride_kept',
  /** A successful read that started after the accept found no ride, or the status went terminal. */
  'nav_assigned_ride_released',
  /** The assigned-ride read failed; the device state was deliberately left untouched. */
  'nav_assigned_ride_read_failed',
  /**
   * The app asked a router for the trip line. Logged once per requested leg, before the first
   * attempt, so a leg with no `nav_route_ok` and no `nav_route_error` after it names a hung
   * request rather than a failure.
   */
  'nav_route_requested',
  /**
   * One endpoint answered with a usable line. Timed by the router service, which is the only
   * place that knows which endpoint was tried and for how long.
   */
  'nav_route_ok',
  /**
   * One endpoint refused or stalled. Rows accumulate per attempted endpoint, so the final
   * failure is the last row of the pair and the reason survives the fallback.
   */
  'nav_route_error',
  /**
   * A leg the router failed to answer is being asked again, after a backoff.
   *
   * A failed leg leaves a dashed chord, and the off-route guard refuses to latch on a chord — so
   * the driver was left with a degraded line and no reroute until the leg changed. A mobile link
   * fails transiently, so the leg is retried a bounded number of times.
   */
  'nav_route_retry',
  /**
   * The driver stayed more than 30 m off the line for 2.5 s. `action` is
   * `reroute` when a new line was asked for, `cooldown` when the anti-flap window swallowed the
   * signal — the two look identical from the map, and only one of them explains a stale line.
   */
  'nav_off_route',
  /**
   * One guidance camera tick, as the map document decided it.
   *
   * The camera lives in the WebView, so it was the one part of guidance with no observer: a
   * `course_up: false`, a stuck zoom, or a trace that was never cut could only be seen with a
   * debugger attached. Detail carries the decision (`course_up`, `bearing`, `zoom`, `puck_y_ratio`,
   * `on_line`, `trimmed`) and never the driver's coordinates.
   */
  'nav_tick',
  /** A guidance tick that threw, with `error` and `source`. */
  'nav_tick_error',
  /**
   * The WebView message bridge threw while handling a native message: `error`, `message_type`
   * (null when the payload never parsed) and `source`. Distinct from `nav_tick_error` because a
   * malformed payload and a broken camera tick look identical from the map and want different
   * fixes.
   */
  'nav_message_error',
  /**
   * The guidance helpers embedded in the map document were not callable.
   *
   * A release build used to inject them with `.toString()`, which Hermes answers with a bytecode
   * placeholder: the definition is valid and every call throws, so guidance silently fell back to
   * its non-planning path — 1514 `nav_tick_error` and zero `nav_off_route`, with no way to tell a
   * hollow helper from a broken tick. The boot probe reports this once, with its own name.
   */
  'nav_inject_hollow',
  /**
   * `update_ride_nav_progress` accepted the last progress write. Throttled to one row per RPC
   * window (12 s); present so a NULL `rides.nav_updated_at` names its own cause.
   */
  'nav_progress_ok',
  /**
   * The RPC refused or failed. `error` carries either the transport message or the `jsonb`
   * `error` the function returned — a RPC that answers with a body is a success as far as the
   * client is concerned, which is how a rejected write stayed invisible.
   */
  'nav_progress_error',
] as const;

export type OfferPipelineStage = (typeof OFFER_PIPELINE_STAGES)[number];

/**
 * Diagnostic sink, on unless explicitly switched off.
 *
 * Default-on is a deliberate choice: the symptom only reproduces on a real device with a real
 * push, so a probe that requires a special build is a probe that never gets used. The cost is
 * bounded by the 7-day retention policy and by the fact that a driver only emits a handful of
 * rows per offer. `EXPO_PUBLIC_OFFER_DIAG=0` silences it (it is inlined at build time, so
 * turning it off does require a rebuild).
 */
export function offerPipelineDiagEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_OFFER_DIAG;
  if (raw == null || raw === '') return true;
  return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
}

/** Bounded so a long session without an identity cannot grow the buffer without limit. */
const MAX_BUFFERED_EVENTS = 50;

/**
 * Milliseconds since module load. Sent inside `detail` rather than relying on `created_at`:
 * early events are buffered until the driver id is known and therefore land in the table late,
 * so the server timestamp would misrepresent the order and the gaps. A monotonic-ish offset
 * keeps the real deltas exact even if the device clock is wrong.
 */
const epochMs = Date.now();

type PipelineEvent = {
  stage: OfferPipelineStage;
  rideId: string | null;
  detail: Record<string, unknown>;
};

let cachedDriverId: string | null = null;
let buffered: PipelineEvent[] = [];

/**
 * Record one pipeline step. Fire-and-forget and never throws: a diagnostic must not be able to
 * break the offer it is measuring.
 */
export function logOfferStage(
  stage: OfferPipelineStage,
  detail: Record<string, unknown> = {},
  rideId: string | null = null,
): void {
  if (!offerPipelineDiagEnabled()) return;

  const event: PipelineEvent = {
    stage,
    rideId,
    detail: { ...detail, t_ms: Date.now() - epochMs },
  };

  const driverId = cachedDriverId;
  if (driverId === null) {
    // No identity yet (typically a cold start from the tap): keep the event, with its time,
    // and flush it once the dashboard boot resolves the driver row.
    buffered.push(event);
    if (buffered.length > MAX_BUFFERED_EVENTS) buffered.shift();
    return;
  }

  void writeEvent(driverId, event);
}

/**
 * Publish the driver row id the events belong to, and flush anything buffered before it was
 * known. Called by the dashboard boot as soon as the driver is resolved.
 */
export function setOfferPipelineDriverId(driverId: string | null): void {
  cachedDriverId = driverId;
  if (driverId === null || buffered.length === 0) return;

  const pending = buffered;
  buffered = [];
  for (const event of pending) {
    void writeEvent(driverId, event);
  }
}

/** Dev-only breadcrumb. NODE_ENV rather than the RN `__DEV__` global: this module is also
 * exercised by the node test runner, where the global is absent. */
function isDebugBuild(): boolean {
  return process.env.NODE_ENV !== 'production';
}

async function writeEvent(
  driverId: string,
  event: PipelineEvent,
): Promise<void> {
  try {
    // Resolved lazily on purpose. This module is imported by the store and the push
    // plumbing, which are on the critical path of a cold start and have no business
    // pulling the Supabase client (and, with it, SecureStore, the AES polyfill and
    // `react-native-get-random-values`) into their module graph just to record a
    // breadcrumb. A static import is measurably not neutral: it broke the Node test
    // runner of `pushOpen` with "Identifier 'module' has already been declared".
    const { supabase } = await import('../supabase');
    const { error } = await supabase.from('offer_pipeline_events').insert({
      driver_id: driverId,
      ride_id: event.rideId,
      stage: event.stage,
      detail: event.detail,
    });
    if (error && isDebugBuild()) {
      console.warn('[offer-diag] insert failed:', error.message);
    }
  } catch (error) {
    if (isDebugBuild()) {
      console.warn('[offer-diag] insert threw:', error);
    }
  }
}
