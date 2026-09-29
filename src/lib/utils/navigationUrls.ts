export type NavApp = 'google_maps' | 'waze' | 'apple_maps';

export type NavPlatform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

export type NavDestination = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string;
};

type ResolvedNavTarget = {
  coordTarget: string | null;
  addressTarget: string | null;
  encodedQuery: string;
};

function resolveNavTarget(dest: NavDestination): ResolvedNavTarget {
  const lat = dest.lat;
  const lng = dest.lng;
  const hasCoords =
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0);

  const coordTarget = hasCoords ? `${lat},${lng}` : null;
  const addressTarget = dest.address?.trim() || null;
  const encodedQuery = encodeURIComponent(coordTarget ?? addressTarget ?? '');

  if (!coordTarget && !addressTarget) {
    throw new Error('Navigation requires coordinates or an address');
  }

  return { coordTarget, addressTarget, encodedQuery };
}

/** Universal HTTPS / Apple Maps web URLs (stable for tests and as fallbacks). */
export function buildNavigationUrl(app: NavApp, dest: NavDestination): string {
  const { coordTarget, encodedQuery } = resolveNavTarget(dest);

  switch (app) {
    case 'google_maps':
      if (coordTarget) {
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordTarget)}`;
      }
      return `https://www.google.com/maps/dir/?api=1&destination=${encodedQuery}`;
    case 'waze':
      if (coordTarget) {
        return `https://waze.com/ul?ll=${coordTarget}&navigate=yes`;
      }
      return `https://waze.com/ul?q=${encodedQuery}&navigate=yes`;
    case 'apple_maps':
      if (coordTarget) {
        return `http://maps.apple.com/?daddr=${encodeURIComponent(coordTarget)}`;
      }
      return `http://maps.apple.com/?daddr=${encodedQuery}`;
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${encodedQuery}`;
  }
}

function wazeNativeUrl(coordTarget: string | null, encodedQuery: string): string {
  if (coordTarget) {
    return `waze://?ll=${coordTarget}&navigate=yes`;
  }
  return `waze://?q=${encodedQuery}&navigate=yes`;
}

function googleMapsNativeUrl(
  platform: NavPlatform,
  coordTarget: string | null,
  addressTarget: string | null,
  encodedQuery: string,
): string | null {
  if (platform !== 'android' && platform !== 'ios') {
    return null;
  }
  const destination =
    coordTarget ??
    (addressTarget ? encodeURIComponent(addressTarget) : null);
  if (!destination) {
    return null;
  }
  if (platform === 'android') {
    return `google.navigation:q=${destination}`;
  }
  const daddr = coordTarget
    ? encodeURIComponent(coordTarget)
    : encodedQuery;
  return `comgooglemaps://?daddr=${daddr}&directionsmode=driving`;
}

function buildNativeNavigationUrl(
  app: NavApp,
  dest: NavDestination,
  platform: NavPlatform,
): string | null {
  const { coordTarget, addressTarget, encodedQuery } = resolveNavTarget(dest);

  switch (app) {
    case 'waze':
      return wazeNativeUrl(coordTarget, encodedQuery);
    case 'google_maps':
      return googleMapsNativeUrl(
        platform,
        coordTarget,
        addressTarget,
        encodedQuery,
      );
    case 'apple_maps':
      return null;
    default:
      return null;
  }
}

/**
 * URLs to try in order. Google Maps / Apple use native schemes first.
 *
 * Waze is the exception: `waze://` often opens the preview without starting navigation
 * (navigate=yes ignored on recent Android). The documented handoff is `https://waze.com/ul`.
 */
export function buildNavigationUrlCandidates(
  app: NavApp,
  dest: NavDestination,
  platform: NavPlatform,
): string[] {
  const universal = buildNavigationUrl(app, dest);
  const native = buildNativeNavigationUrl(app, dest, platform);
  if (!native || native === universal) {
    return [universal];
  }
  if (app === 'waze') {
    return [universal, native];
  }
  return [native, universal];
}
