import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

type MapRecenterButtonProps = Readonly<{
  visible: boolean;
  bottom: number;
  navigationMode?: boolean;
  onPress: () => void;
}>;

/** Uber-like “my location” control when map follow is paused. */
export function MapRecenterButton({
  visible,
  bottom,
  navigationMode = false,
  onPress,
}: MapRecenterButtonProps) {
  if (!visible) return null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Recentrer sur ma position"
      style={[styles.fab, { bottom }]}
      hitSlop={8}
    >
      <Feather
        name={navigationMode ? 'navigation' : 'crosshair'}
        size={22}
        color="#042f2e"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    zIndex: 45,
    elevation: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
});
