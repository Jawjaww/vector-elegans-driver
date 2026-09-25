import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  maneuverBannerLine,
  maneuverToFeatherIcon,
  type NavProgress,
} from '../lib/utils/navProgress';
import { GlassPanel } from './GlassPanel';
import { RoundaboutExitGlyph } from './RoundaboutExitGlyph';
import { GLASS_MATERIAL } from '../lib/theme';
import { OVERLAY_CARD_RADIUS } from '../lib/utils/overlayLane';

type TripManeuverHudProps = Readonly<{
  progress: NavProgress;
}>;

function isRoundabout(type: string | undefined): boolean {
  const t = (type || '').toLowerCase();
  return t === 'roundabout' || t === 'rotary';
}

/**
 * Top-of-screen next-turn HUD during navigation.
 *
 * Line one is the action and the distance ("Tourner à droite dans 60 m").
 * The street sits underneath, so it is not crushed onto the same line.
 * A roundabout with a known exit shows which arm is taken instead of a generic arrow.
 */
export function TripManeuverHud({ progress }: TripManeuverHudProps) {
  const insets = useSafeAreaInsets();
  const material = GLASS_MATERIAL;
  const man = progress.nextManeuver;
  const roundaboutExit =
    man && isRoundabout(man.type) && typeof man.exit === 'number' && man.exit >= 1
      ? man.exit
      : null;
  const icon = man
    ? maneuverToFeatherIcon(man.type, man.modifier)
    : 'navigation';
  const instruction = man
    ? maneuverBannerLine(man.type, man.modifier, man.distanceMeters, man.exit)
    : 'Suivre le trajet';
  const street = man?.name?.trim() ? man.name.trim() : null;

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
      <GlassPanel radius={OVERLAY_CARD_RADIUS}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          {roundaboutExit !== null ? (
            <RoundaboutExitGlyph
              exit={roundaboutExit}
              color={material.accentStrong}
              trackColor={material.textDim}
            />
          ) : (
            <Feather name={icon} size={22} color={material.accentStrong} />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: material.text,
                fontSize: 16,
                lineHeight: 22,
                fontWeight: '600',
              }}
              numberOfLines={2}
            >
              {instruction}
            </Text>
            {street ? (
              <Text
                style={{
                  color: material.textDim,
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: '500',
                }}
                numberOfLines={2}
              >
                {street}
              </Text>
            ) : null}
          </View>
        </View>
      </GlassPanel>
    </View>
  );
}
