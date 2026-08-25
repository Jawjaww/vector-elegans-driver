import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatRemainingDistance,
  maneuverInstructionLabel,
  maneuverToFeatherIcon,
  type NavProgress,
} from '../lib/utils/navProgress';

type TripManeuverHudProps = Readonly<{
  progress: NavProgress;
}>;

/** Top-of-screen next-turn HUD during navigation. */
export function TripManeuverHud({ progress }: TripManeuverHudProps) {
  const insets = useSafeAreaInsets();
  const man = progress.nextManeuver;
  const icon = man
    ? maneuverToFeatherIcon(man.type, man.modifier)
    : 'navigation';
  const instruction = man
    ? maneuverInstructionLabel(man.type, man.modifier)
    : 'Suivre le trajet';
  const manDist =
    man && Number.isFinite(man.distanceMeters)
      ? formatRemainingDistance(man.distanceMeters)
      : null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 12,
        right: 12,
        zIndex: 15,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.35)',
        backgroundColor: 'rgba(6, 24, 18, 0.92)',
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          backgroundColor: 'rgba(16,185,129,0.18)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={28} color="#34d399" />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: '#ecfdf5',
            fontSize: 16,
            fontWeight: '800',
            letterSpacing: 0.2,
          }}
          numberOfLines={1}
        >
          {instruction}
          {manDist ? ` · ${manDist}` : ''}
        </Text>
        {man?.name ? (
          <Text
            style={{
              color: 'rgba(167,243,208,0.8)',
              fontSize: 13,
              marginTop: 3,
              fontWeight: '600',
            }}
            numberOfLines={1}
          >
            {man.name}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
