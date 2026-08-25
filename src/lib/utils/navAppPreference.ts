import AsyncStorage from '@react-native-async-storage/async-storage';

export type NavApp = 'google_maps' | 'waze' | 'apple_maps';

export const NAV_APP_STORAGE_KEY = '@vector_elegans/preferred_nav_app';

export const NAV_APP_LABELS: Record<NavApp, string> = {
  google_maps: 'Google Maps',
  waze: 'Waze',
  apple_maps: 'Apple Plans',
};

export async function getPreferredNavApp(): Promise<NavApp | null> {
  const raw = await AsyncStorage.getItem(NAV_APP_STORAGE_KEY);
  if (raw === 'google_maps' || raw === 'waze' || raw === 'apple_maps') {
    return raw;
  }
  return null;
}

export async function setPreferredNavApp(app: NavApp): Promise<void> {
  await AsyncStorage.setItem(NAV_APP_STORAGE_KEY, app);
}

export async function clearPreferredNavApp(): Promise<void> {
  await AsyncStorage.removeItem(NAV_APP_STORAGE_KEY);
}
