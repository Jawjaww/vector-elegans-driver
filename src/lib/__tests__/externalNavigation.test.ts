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

  it('builds Waze URL with encoded coordinates, zoom, and the official host', () => {
    expect(buildNavigationUrl('waze', dest)).toBe(
      'https://www.waze.com/ul?q=Paris&ll=48.8566%2C2.3522&navigate=yes&zoom=17&utm_source=com.vectorelegans.driver',
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

  it('hands Android Waze the ul URI via an explicit package intent', () => {
    const urls = buildNavigationUrlCandidates('waze', dest, 'android');
    expect(urls[0]).toBe(
      'intent://www.waze.com/ul?q=Paris&ll=48.8566%2C2.3522&navigate=yes&zoom=17&utm_source=com.vectorelegans.driver#Intent;scheme=https;package=com.waze;end',
    );
    expect(urls[1]).toBe(
      'https://www.waze.com/ul?q=Paris&ll=48.8566%2C2.3522&navigate=yes&zoom=17&utm_source=com.vectorelegans.driver',
    );
  });

  it('keeps iOS on the documented HTTPS ul link', () => {
    expect(buildNavigationUrlCandidates('waze', dest, 'ios')).toEqual([
      'https://www.waze.com/ul?q=Paris&ll=48.8566%2C2.3522&navigate=yes&zoom=17&utm_source=com.vectorelegans.driver',
    ]);
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
