import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  openExternalNavigation,
  changePreferredNavApp,
  type NavDestination,
} from '../lib/utils/externalNavigation';
import {
  getPreferredNavApp,
  NAV_APP_LABELS,
  type NavApp,
} from '../lib/utils/navAppPreference';

const NAV_ICONS: Record<NavApp, keyof typeof Feather.glyphMap> = {
  google_maps: 'map',
  waze: 'navigation',
  apple_maps: 'compass',
};

const SHORT_LABELS: Record<NavApp, string> = {
  google_maps: 'Maps',
  waze: 'Waze',
  apple_maps: 'Plans',
};

type PreferredNavButtonProps = Readonly<{
  destination: NavDestination;
}>;

export function PreferredNavButton({ destination }: PreferredNavButtonProps) {
  const [app, setApp] = useState<NavApp | null>(null);

  useEffect(() => {
    void getPreferredNavApp().then(setApp);
  }, []);

  const refresh = useCallback(async () => {
    const next = await getPreferredNavApp();
    setApp(next);
  }, []);

  const onPress = useCallback(() => {
    void (async () => {
      await openExternalNavigation(destination);
      await refresh();
    })();
  }, [destination, refresh]);

  const onLongPress = useCallback(() => {
    void (async () => {
      await changePreferredNavApp();
      await refresh();
    })();
  }, [refresh]);

  const icon = app ? NAV_ICONS[app] : 'navigation';
  const label = app ? SHORT_LABELS[app] : 'GPS';
  const a11y = app ? NAV_APP_LABELS[app] : 'Navigation GPS';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`Ouvrir ${a11y}`}
      accessibilityHint="Appui long pour changer l'application préférée"
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
    >
      <View style={styles.row}>
        <Feather name={icon} size={16} color="#93c5fd" />
        <Text style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    color: '#bfdbfe',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
