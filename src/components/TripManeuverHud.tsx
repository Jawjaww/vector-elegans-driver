import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatRemainingDistance,
  maneuverInstructionLabel,
  maneuverToFeatherIcon,
  type NavProgress,
} from '../lib/utils/navProgress';
import { GlassPanel } from './GlassPanel';
import { theme } from '../lib/theme';

const HUD_RADIUS = 18;

type TripManeuverHudProps = Readonly<{
  progress: NavProgress;
}>;

/**
 * Top-of-screen next-turn HUD during navigation.
 *
 * The one overlay that keeps its emerald tint rather than adopting a stage accent: it is not
 * about *where the trip is going* but about *what to do in the next few hundred metres*, and
 * sharing the destination's green would blur that distinction on the one panel where a misread
 * costs a turn.
 */
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
      }}
    >
      <GlassPanel radius={HUD_RADIUS}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 10,
            paddingHorizontal: 12,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: `${theme.colors.accent}2e`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={icon} size={28} color={theme.colors.accentLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: '#fff',
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
                  color: 'rgba(255,255,255,0.62)',
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
      </GlassPanel>
    </View>
  );
}
