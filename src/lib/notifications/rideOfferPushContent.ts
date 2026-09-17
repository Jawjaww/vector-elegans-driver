/** Map pickup pin blue — matches web map markers. */
export const RIDE_OFFER_BRAND_COLOR = '#3b82f6';

/** Notification category — must match the `categoryId` sent by dispatch-push. */
export const RIDE_OFFER_CATEGORY_ID = 'ride_offer';
/** Action identifiers registered for RIDE_OFFER_CATEGORY_ID. */
export const RIDE_OFFER_ACCEPT_ACTION = 'accept';
export const RIDE_OFFER_DECLINE_ACTION = 'decline';

/** Pin + arrival-flag prefixes — mirrors the notification body lines. */
const PICKUP_PREFIX = '📍 ';
const DROPOFF_PREFIX = '🏁 ';
const DEFAULT_CTA = 'Appuyez pour accepter';

export type RideOfferRemoteCopy = {
  title?: string | null;
  body?: string | null;
  subtitle?: string | null;
};

export type RideOfferPushContent = {
  title: string;
  subtitle?: string;
  body: string;
  sound: 'default';
};

export function isRideOfferPush(data: Record<string, unknown>): boolean {
  return data.type === 'ride_offer' || typeof data.ride_id === 'string';
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatPriceLabel(data: Record<string, unknown>): string | null {
  const fromLabel = readString(data.price_label);
  if (fromLabel) return fromLabel;

  const raw = data.estimated_price;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return `${raw.toFixed(2)} €`;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return `${parsed.toFixed(2)} €`;
    }
  }
  return null;
}

function shortenAddress(value: string, maxLen = 56): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function buildBodyLines(data: Record<string, unknown>): string[] {
  const pickup = readString(data.pickup_address);
  const dropoff = readString(data.dropoff_address);
  const price = formatPriceLabel(data);
  const lines: string[] = [];

  if (pickup) lines.push(`${PICKUP_PREFIX}${shortenAddress(pickup)}`);
  if (dropoff) lines.push(`${DROPOFF_PREFIX}${shortenAddress(dropoff)}`);
  if (price) {
    lines.push(`💶 ${price} · ${DEFAULT_CTA}`);
  } else {
    lines.push(DEFAULT_CTA);
  }
  return lines;
}

export function rideOfferNotificationId(
  data: Record<string, unknown>,
): string {
  const rideId = readString(data.ride_id);
  return rideId ? `ride-offer-${rideId}` : 'ride-offer';
}

/**
 * Builds tray copy for ride_offer pushes (A/B pin colors + price).
 * Falls back to the remote FCM title/body when structured data is missing.
 */
export function buildRideOfferPushContent(
  data: Record<string, unknown>,
  remote: RideOfferRemoteCopy,
  options?: { includeSubtitle?: boolean },
): RideOfferPushContent {
  const pickup = readString(data.pickup_address);
  const dropoff = readString(data.dropoff_address);
  const price = formatPriceLabel(data);
  const subtitle = readString(data.subtitle) ?? price;
  const hasStructured = Boolean(pickup || dropoff || price);

  const title = hasStructured
    ? 'Nouvelle course'
    : readString(remote.title) ?? 'Nouvelle course';

  const body = hasStructured
    ? buildBodyLines(data).join('\n')
    : readString(remote.body) ?? DEFAULT_CTA;

  return {
    title,
    subtitle: options?.includeSubtitle ? subtitle ?? undefined : undefined,
    body,
    sound: 'default',
  };
}
