import { logOfferStage } from './offerPipelineDiag';

/**
 * Tell the server this device received the offer push.
 *
 * Why it exists: the offer push is data-only, so Android hands it to the app instead of drawing
 * it — and a data-only message shows *nothing* when the app process cannot be started. The
 * server holds a fallback for that case (`send_offer_push_fallbacks`: it re-sends the offer as a
 * real notification). Telling "the app never started" apart from "the driver is taking a moment
 * to decide" cannot be inferred server-side — `notifications.sent_at` only says FCM accepted the
 * message, and `ride_offers` records no delivery at all. Silence is not evidence, so the device
 * that received the push has to say so. This call is that evidence.
 *
 * Deliberately best-effort: never awaited, never thrown into the offer path. A failed
 * acknowledgement costs one duplicate banner, whereas blocking or throwing here would cost the
 * offer itself. Failures are reported as a pipeline stage rather than swallowed, so a channel
 * that never acknowledges is visible next to the rest of the offer latency.
 */

/** Bounded so a long session cannot grow the set without limit. */
const MAX_REPORTED_IDS = 200;

/**
 * Notification ids this runtime has already reported.
 *
 * The same push reaches the app twice on a cold start — once through the tray response and once
 * through the native silent wake — and both converge on the same handler. The server ignores a
 * repeat (it only fills `acknowledged_at` when it is null), so this is not about correctness:
 * it is what keeps a duplicate tap from costing a second round-trip.
 */
export function createPushAckGate(): (notificationId: string) => boolean {
  const reported = new Set<string>();
  return (notificationId: string): boolean => {
    if (reported.has(notificationId)) return false;
    if (reported.size >= MAX_REPORTED_IDS) reported.clear();
    reported.add(notificationId);
    return true;
  };
}

const isFirstReport = createPushAckGate();

/** Notification id carried by a ride offer push, if any. */
export function notificationIdFromPushData(
  data: Record<string, unknown>,
): string | null {
  const value = data.notification_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function rideIdFromData(data: Record<string, unknown>): string | null {
  const value = data.ride_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Report one acknowledgement. Safe to call on every offer path: the id is deduplicated, the
 * call is fire-and-forget, and it never throws.
 */
export function acknowledgeOfferPush(data: Record<string, unknown>): void {
  const rideId = rideIdFromData(data);
  const notificationId = notificationIdFromPushData(data);

  if (notificationId === null) {
    // An older push, sent before the payload carried the id: nothing the sweep can match, and
    // worth recording so the gap is not mistaken for a working channel.
    logOfferStage('push_acked', { outcome: 'no_id' }, rideId);
    return;
  }
  if (!isFirstReport(notificationId)) return;

  void (async () => {
    try {
      // Resolved lazily, like the diagnostics sink: this module sits on the cold-start path of
      // a push and has no business pulling the Supabase client into its module graph.
      const { supabase } = await import('../supabase');
      const { error } = await supabase.rpc('acknowledge_offer_push', {
        p_notification_id: notificationId,
      });
      logOfferStage(
        'push_acked',
        error ? { outcome: 'error', message: error.message } : { outcome: 'ok' },
        rideId,
      );
    } catch (error) {
      logOfferStage(
        'push_acked',
        {
          outcome: 'threw',
          message: error instanceof Error ? error.message : String(error),
        },
        rideId,
      );
    }
  })();
}
