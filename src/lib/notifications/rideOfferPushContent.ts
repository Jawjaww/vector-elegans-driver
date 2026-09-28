/** Map pickup pin blue — matches web map markers. */
export const RIDE_OFFER_BRAND_COLOR = '#3b82f6';

/** Notification category — must match the `categoryId` sent by dispatch-push. */
export const RIDE_OFFER_CATEGORY_ID = 'ride_offer';
/** Action identifiers registered for RIDE_OFFER_CATEGORY_ID. */
export const RIDE_OFFER_ACCEPT_ACTION = 'accept';
export const RIDE_OFFER_DECLINE_ACTION = 'decline';

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

export function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export function formatPriceLabel(data: Record<string, unknown>): string | null {
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

function formatDistanceLabel(data: Record<string, unknown>): string | null {
  const fromLabel = readString(data.distance_label);
  if (fromLabel) return fromLabel;
  const raw = data.distance;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return `${raw.toFixed(1)} km`;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return `${parsed.toFixed(1)} km`;
    }
  }
  return null;
}

function formatDurationLabel(data: Record<string, unknown>): string | null {
  const fromLabel = readString(data.duration_label);
  if (fromLabel) return fromLabel;
  const raw = data.duration;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return `${Math.round(raw)} min`;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return `${Math.round(parsed)} min`;
    }
  }
  return null;
}

function buildMetricsBody(data: Record<string, unknown>): string | null {
  const parts = [
    formatPriceLabel(data),
    formatDistanceLabel(data),
    formatDurationLabel(data),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function rideOfferNotificationId(
  data: Record<string, unknown>,
): string {
  const rideId = readString(data.ride_id);
  return rideId ? `ride-offer-${rideId}` : 'ride-offer';
}

/**
 * Tray copy for ride_offer: price, trip distance and estimated duration.
 * Falls back to the remote FCM title/body when those fields are missing.
 */
export function buildRideOfferPushContent(
  data: Record<string, unknown>,
  remote: RideOfferRemoteCopy,
  options?: { includeSubtitle?: boolean },
): RideOfferPushContent {
  const price = formatPriceLabel(data);
  const metrics = buildMetricsBody(data);
  const subtitle = readString(data.subtitle) ?? price;
  const hasStructured = metrics !== null;

  const title = hasStructured
    ? 'Nouvelle course'
    : readString(remote.title) ?? 'Nouvelle course';

  const body = hasStructured
    ? metrics
    : readString(remote.body) ?? DEFAULT_CTA;

  return {
    title,
    subtitle: options?.includeSubtitle ? subtitle ?? undefined : undefined,
    body,
    sound: 'default',
  };
}
