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

/**
 * Waze's documented "start navigation" URL.
 *
 * Official example: `https://www.waze.com/ul?ll=40.75889500%2C-73.98513100&navigate=yes&zoom=17`.
 * An unencoded comma in `ll`, the `waze.com` host (no www), and `waze://` all open the app
 * on recent Android without pressing Go.
 */
const WAZE_UTM_SOURCE = 'com.vectorelegans.driver';

function wazeUlQuery(target: ResolvedNavTarget): string {
  const params: string[] = [];
  if (target.addressTarget) {
    params.push(`q=${encodeURIComponent(target.addressTarget)}`);
  }
  if (target.coordTarget) {
    params.push(`ll=${encodeURIComponent(target.coordTarget)}`);
  }
  params.push('navigate=yes', 'zoom=17', `utm_source=${WAZE_UTM_SOURCE}`);
  return params.join('&');
}

function buildWazeHttpsUrl(dest: NavDestination): string {
  return `https://www.waze.com/ul?${wazeUlQuery(resolveNavTarget(dest))}`;
}

/** Force `com.waze` to receive the full URI — App Links often launch Waze without the query. */
function buildWazeAndroidIntentUrl(dest: NavDestination): string {
  const query = wazeUlQuery(resolveNavTarget(dest));
  return `intent://www.waze.com/ul?${query}#Intent;scheme=https;package=com.waze;end`;
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
      return buildWazeHttpsUrl(dest);
    case 'apple_maps':
      if (coordTarget) {
        return `http://maps.apple.com/?daddr=${encodeURIComponent(coordTarget)}`;
      }
      return `http://maps.apple.com/?daddr=${encodedQuery}`;
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${encodedQuery}`;
  }
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
      return platform === 'android' ? buildWazeAndroidIntentUrl(dest) : null;
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
 * URLs to try in order. Google Maps uses the native scheme first.
 *
 * Waze on Android is the reverse of Maps: `Linking.openURL(https://waze.com/ul)` is accepted
 * (the app opens) even when the query never reaches Waze, so we never get to a second URL.
 * The `intent://` form names `com.waze` so the full `ul` URI is the data, not a cold start.
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
  return [native, universal];
}
