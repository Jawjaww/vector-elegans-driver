import { Linking, Alert, Platform } from 'react-native';
import {
  getPreferredNavApp,
  setPreferredNavApp,
  NAV_APP_LABELS,
  type NavApp,
} from './navAppPreference';
import {
  buildNavigationUrl,
  type NavDestination,
} from './navigationUrls';

export type { NavApp, NavDestination };
export { buildNavigationUrl };

export function pickNavApp(): Promise<NavApp | null> {
  const options: NavApp[] =
    Platform.OS === 'ios'
      ? ['google_maps', 'waze', 'apple_maps']
      : ['google_maps', 'waze'];

  return new Promise((resolve) => {
    Alert.alert(
      'Application GPS',
      'Choisissez votre application de navigation préférée.',
      [
        ...options.map((app) => ({
          text: NAV_APP_LABELS[app],
          onPress: () => resolve(app),
        })),
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

export async function openExternalNavigation(
  dest: NavDestination,
  options?: { forcePicker?: boolean; app?: NavApp },
): Promise<boolean> {
  let app =
    options?.app ??
    (options?.forcePicker ? null : await getPreferredNavApp());

  if (!app) {
    app = await pickNavApp();
    if (!app) return false;
    await setPreferredNavApp(app);
  }

  const url = buildNavigationUrl(app, dest);
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert('Erreur', "Impossible d'ouvrir l'application de navigation.");
    return false;
  }

  await Linking.openURL(url);
  return true;
}

export async function changePreferredNavApp(): Promise<NavApp | null> {
  const app = await pickNavApp();
  if (app) await setPreferredNavApp(app);
  return app;
}
