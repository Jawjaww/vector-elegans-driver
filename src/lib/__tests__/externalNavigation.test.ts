import { buildNavigationUrl } from '../utils/navigationUrls';

describe('buildNavigationUrl', () => {
  const dest = { lat: 48.8566, lng: 2.3522, address: 'Paris' };

  it('builds Google Maps URL with coordinates', () => {
    expect(buildNavigationUrl('google_maps', dest)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=48.8566%2C2.3522',
    );
  });

  it('builds Waze URL with coordinates', () => {
    expect(buildNavigationUrl('waze', dest)).toBe(
      'https://waze.com/ul?ll=48.8566,2.3522&navigate=yes',
    );
  });

  it('builds Apple Maps URL with coordinates', () => {
    expect(buildNavigationUrl('apple_maps', dest)).toBe(
      'http://maps.apple.com/?daddr=48.8566%2C2.3522',
    );
  });

  it('falls back to address when coordinates missing', () => {
    expect(
      buildNavigationUrl('google_maps', { address: '10 rue de Rivoli, Paris' }),
    ).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=10%20rue%20de%20Rivoli%2C%20Paris',
    );
  });
});

describe('navAppPreference storage key', () => {
  it('uses stable storage key', () => {
    const { NAV_APP_STORAGE_KEY } = require('../utils/navAppPreference');
    expect(NAV_APP_STORAGE_KEY).toBe('@vector_elegans/preferred_nav_app');
  });
});
