import {
  buildNavigationUrl,
  buildNavigationUrlCandidates,
} from '../utils/navigationUrls';

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

describe('buildNavigationUrlCandidates', () => {
  const dest = { lat: 48.8566, lng: 2.3522, address: 'Paris' };

  it('opens Waze with a native deep link before the HTTPS fallback', () => {
    const urls = buildNavigationUrlCandidates('waze', dest, 'android');
    expect(urls[0]).toBe('waze://?ll=48.8566,2.3522&navigate=yes');
    expect(urls[1]).toBe(
      'https://waze.com/ul?ll=48.8566,2.3522&navigate=yes',
    );
  });

  it('uses google.navigation on Android', () => {
    const urls = buildNavigationUrlCandidates('google_maps', dest, 'android');
    expect(urls[0]).toBe('google.navigation:q=48.8566,2.3522');
  });
});

describe('navAppPreference storage key', () => {
  it('uses stable storage key', () => {
    const { NAV_APP_STORAGE_KEY } = require('../utils/navAppPreference');
    expect(NAV_APP_STORAGE_KEY).toBe('@vector_elegans/preferred_nav_app');
  });
});
