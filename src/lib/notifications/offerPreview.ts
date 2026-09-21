import type { ProvisionalOffer } from '../stores/driverStore';
import { formatPriceLabel, readString } from './rideOfferPushContent';

/**
 * How long after a tap an offer still counts as "the arrival".
 *
 * The window exists because the arrival spans a remount: the provisional card paints while
 * the dashboard is still booting, then the real tree mounts. Anything that has to know "do
 * not animate this" therefore cannot rely on a flag cleared by one of those two mounts.
 * Generous enough to cover a slow boot, short enough that a later in-app offer animates
 * normally again.
 */
export const OFFER_ARRIVAL_INSTANT_WINDOW_MS = 20_000;

/**
 * How long a provisional card may stay on screen without being resolved.
 *
 * The normal lifecycle replaces it within one round-trip. This bounds the pathological case
 * (the read never lands) so a card with a live Accept button cannot sit there indefinitely
 * describing an offer nobody confirmed.
 */
export const PROVISIONAL_OFFER_TTL_MS = 15_000;

/** Whether an offer surfaced right now should be presented without entry motion. */
export function isNotificationArrival(
  arrivalAt: number | null,
  nowMs: number = Date.now(),
): boolean {
  if (arrivalAt === null) return false;
  const elapsed = nowMs - arrivalAt;
  // A negative elapsed means the device clock moved backwards; treat it as a fresh arrival
  // rather than as an arrival from the future that never expires.
  return elapsed < OFFER_ARRIVAL_INSTANT_WINDOW_MS;
}

/**
 * Build the provisional card contents from a ride_offer push payload.
 *
 * The payload already carries the pickup, the dropoff and the price, because the notification
 * body is written from them. Keeping them past the tap is what lets the card paint on the tap
 * itself — no round-trip, and therefore a delay the network cannot stretch.
 *
 * Returns null when the payload carries nothing displayable: an empty card would be worse
 * than the ordinary path, which at least ends in an explainable notice.
 */
export function previewFromPushData(
  data: Record<string, unknown>,
  rideId: string,
): ProvisionalOffer | null {
  const pickupAddress = readString(data.pickup_address);
  const dropoffAddress = readString(data.dropoff_address);
  const priceLabel = formatPriceLabel(data);
  if (!pickupAddress && !dropoffAddress && !priceLabel) return null;
  return { rideId, pickupAddress, dropoffAddress, priceLabel };
}
