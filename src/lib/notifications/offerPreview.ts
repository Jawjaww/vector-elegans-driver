import type { ProvisionalOffer, Ride } from '../stores/driverStore';
import { isRideStillOfferable } from '../utils/ridePickup';
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

export function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const parts = value.filter((item): item is string => typeof item === 'string');
    return parts.length > 0 ? parts : undefined;
  }
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      return readStringArray(JSON.parse(value) as unknown);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Build the provisional card contents from a ride_offer push payload.
 *
 * Used only when the payload lacks coordinates: the real card and the map need a Ride, and
 * without lat/lon the snapshot path cannot run. Addresses and price are still enough to
 * decide, so the placeholder stays for older payloads.
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

/**
 * Rebuild a Ride from a ride_offer push payload (or ride_offers.snapshot).
 *
 * Coordinates and a matching window are required: without them the map cannot draw and
 * `isRideStillOfferable` cannot answer, so the caller must fall back to the placeholder
 * plus `get_driver_offer_ride`. FCM stringifies numbers; both shapes are accepted.
 *
 * The result is marked `offerUnconfirmed` so the dashboard still confirms in the background
 * and can drop a snapshot the server later reports dead.
 */
export function rideFromPushData(
  data: Record<string, unknown>,
  rideId: string,
): Ride | null {
  const pickupLat = readNumber(data.pickup_lat);
  const pickupLon = readNumber(data.pickup_lon);
  const dropoffLat = readNumber(data.dropoff_lat);
  const dropoffLon = readNumber(data.dropoff_lon);
  if (
    pickupLat === null ||
    pickupLon === null ||
    dropoffLat === null ||
    dropoffLon === null
  ) {
    return null;
  }

  const pickupTime = readString(data.pickup_time);
  const matchingDeadlineAt = readString(data.matching_deadline_at);
  const matchingPausedAt = readString(data.matching_paused_at);
  const status = readString(data.status) ?? 'pending';
  if (
    !isRideStillOfferable({
      pickup_time: pickupTime,
      matching_deadline_at: matchingDeadlineAt,
      matching_paused_at: matchingPausedAt,
      status,
    })
  ) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const estimatedPrice = readNumber(data.estimated_price);
  const distance = readNumber(data.distance);
  const duration = readNumber(data.duration);
  const clientIncentive = readNumber(data.client_incentive);

  return {
    id: rideId,
    user_id: readString(data.user_id) ?? '',
    status,
    pickup_address: readString(data.pickup_address) ?? '',
    pickup_lat: pickupLat,
    pickup_lon: pickupLon,
    dropoff_address: readString(data.dropoff_address) ?? '',
    dropoff_lat: dropoffLat,
    dropoff_lon: dropoffLon,
    pickup_time: pickupTime ?? nowIso,
    distance,
    duration,
    vehicle_type: readString(data.vehicle_type) ?? '',
    options: readStringArray(data.options),
    estimated_price: estimatedPrice,
    final_price: null,
    created_at: readString(data.created_at) ?? nowIso,
    updated_at: nowIso,
    pickup_notes: readString(data.pickup_notes) ?? undefined,
    client_incentive: clientIncentive,
    matching_deadline_at: matchingDeadlineAt,
    matching_paused_at: matchingPausedAt,
    offerUnconfirmed: true,
  };
}
