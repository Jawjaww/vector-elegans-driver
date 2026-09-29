import { Alert, Linking, Platform } from 'react-native';
import {
  getPreferredNavApp,
  setPreferredNavApp,
  NAV_APP_LABELS,
  type NavApp,
} from './navAppPreference';
import {
  buildNavigationUrlCandidates,
  type NavDestination,
} from './navigationUrls';

export type { NavApp, NavDestination };
export { buildNavigationUrl } from './navigationUrls';

/** Alert dismissal on Android must finish before `Linking.openURL` or the intent is dropped. */
function afterPickerDismiss(): Promise<void> {
  const delay = Platform.OS === 'android' ? 80 : 0;
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

async function tryOpenNavigationUrl(url: string): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen && !url.startsWith('http')) {
        return false;
      }
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function openNavigationForApp(
  app: NavApp,
  dest: NavDestination,
): Promise<boolean> {
  let candidates: string[];
  try {
    candidates = buildNavigationUrlCandidates(app, dest, Platform.OS);
  } catch {
    Alert.alert(
      'Erreur',
      'Coordonnées ou adresse de destination manquantes.',
    );
    return false;
  }
  for (const url of candidates) {
    if (await tryOpenNavigationUrl(url)) {
      return true;
    }
  }
  return false;
}

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

  const pickedFromDialog = !app;
  if (!app) {
    app = await pickNavApp();
    if (!app) return false;
    await setPreferredNavApp(app);
  }

  if (pickedFromDialog) {
    await afterPickerDismiss();
  }

  const opened = await openNavigationForApp(app, dest);
  if (!opened) {
    Alert.alert('Erreur', "Impossible d'ouvrir l'application de navigation.");
    return false;
  }

  return true;
}

export async function changePreferredNavApp(
  dest?: NavDestination,
): Promise<NavApp | null> {
  const app = await pickNavApp();
  if (!app) return null;
  await setPreferredNavApp(app);
  await afterPickerDismiss();
  if (dest) {
    const opened = await openNavigationForApp(app, dest);
    if (!opened) {
      Alert.alert('Erreur', "Impossible d'ouvrir l'application de navigation.");
    }
  }
  return app;
}
