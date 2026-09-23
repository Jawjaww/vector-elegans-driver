/**
 * Instrumented stages of the offer display pipeline.
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
  /** The ride became the active ride. */
  'accept_ok',
  /** The accept path failed; `error` carries the message. */
  'accept_error',
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
