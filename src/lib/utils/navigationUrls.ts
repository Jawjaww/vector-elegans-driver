export type NavApp = 'google_maps' | 'waze' | 'apple_maps';

export type NavDestination = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string;
};

export function buildNavigationUrl(app: NavApp, dest: NavDestination): string {
  const hasCoords =
    dest.lat != null &&
    dest.lng != null &&
    Number.isFinite(dest.lat) &&
    Number.isFinite(dest.lng);

  const coordTarget = hasCoords ? `${dest.lat},${dest.lng}` : null;
  const addressTarget = dest.address?.trim() || null;
  const query = encodeURIComponent(coordTarget ?? addressTarget ?? '');

  if (!coordTarget && !addressTarget) {
    throw new Error('Navigation requires coordinates or an address');
  }

  switch (app) {
    case 'google_maps':
      if (coordTarget) {
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordTarget)}`;
      }
      return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    case 'waze':
      if (coordTarget) {
        return `https://waze.com/ul?ll=${coordTarget}&navigate=yes`;
      }
      return `https://waze.com/ul?q=${query}&navigate=yes`;
    case 'apple_maps':
      if (coordTarget) {
        return `http://maps.apple.com/?daddr=${encodeURIComponent(coordTarget)}`;
      }
      return `http://maps.apple.com/?daddr=${query}`;
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  }
}
