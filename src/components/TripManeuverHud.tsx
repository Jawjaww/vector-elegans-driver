import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  maneuverBannerParts,
  maneuverToFeatherIcon,
  tripStageBannerParts,
  type NavProgress,
} from '../lib/utils/navProgress';
import { GlassPanel } from './GlassPanel';
import { RoundaboutExitGlyph } from './RoundaboutExitGlyph';
import { GLASS_MATERIAL } from '../lib/theme';
import { OVERLAY_CARD_RADIUS } from '../lib/utils/overlayLane';
import { isTripStage, tripGuidanceAccent } from '../lib/utils/tripGuidance';

/**
 * The arrow, and the roundabout that replaces it.
 *
 * 22 pt was the size of a glyph inside a list row. This one is read at a glance, from a phone on a
 * mount, by someone who is driving: it is the largest thing in the card on purpose, and it is what
 * makes the instruction readable before the sentence is.
 */
const GLYPH_SIZE = 30;
const ROUNDABOUT_SIZE = 52;

/**
 * Type sizes.
 *
 * 16 pt was sized for a notification, not for a windscreen — the report was exactly that, the
 * instruction being too small to read comfortably. The distance is drawn at the same size as the
 * action and in the stage's ink colour, because it is the one figure that changes while driving
 * and the eye should land on it without reading the sentence again.
 */
const INSTRUCTION_SIZE = 18;
const INSTRUCTION_LINE = 24;
const STREET_SIZE = 15;
const STREET_LINE = 20;

type TripManeuverHudProps = Readonly<{
  progress: NavProgress;
  /** `to_pickup` | `at_pickup` | `to_dropoff`; names the target when there is no turn to announce. */
  stage: string | null;
}>;

function isRoundabout(type: string | undefined): boolean {
  const t = (type || '').toLowerCase();
  return t === 'roundabout' || t === 'rotary';
}

/**
 * Top-of-screen next-turn HUD during navigation.
 *
 * The action and the distance sit on one line — the action in the panel's ink, the distance in the
 * colour of the leg being driven — with the street underneath, so it is not crushed onto the same
 * line. A roundabout with a known exit shows which arm is taken instead of a generic arrow.
 *
 * A strip of colour runs down the leading edge, taken from the stage: blue for the customer, green
 * for the drop-off, amber while waiting. It is the same colour as the marker the instruction points
 * at, so the card and the map agree at a glance without the driver having to read either.
 *
 * With no step — still being computed, or never computed because every endpoint failed — the
 * card stays and names the stage instead of disappearing: no instruction is worse than a rough
 * one, and the stage needs no router to be known.
 */
export function TripManeuverHud({ progress, stage }: TripManeuverHudProps) {
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
  const parts = man
    ? maneuverBannerParts(man.type, man.modifier, man.distanceMeters, man.exit)
    : tripStageBannerParts(stage, progress.distanceMeters);
  const street = man?.name?.trim() ? man.name.trim() : null;

  // The stage's own pair: `color` for the strip, `ink` for anything drawn in it. `ink` is the step
  // that stays legible on the pale face, which is why the glyph and the distance take it and the
  // strip — a solid shape — takes the marker colour itself. A stage we cannot name gets the
  // material's own accent, which is the same role for the same reason.
  const accent = isTripStage(stage) ? tripGuidanceAccent(stage) : null;
  const stripColor = accent?.color ?? material.accent;
  const inkColor = accent?.ink ?? material.accentStrong;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 12,
        right: 12,
        zIndex: 50,
        elevation: 50,
      }}
    >
      <GlassPanel
        radius={OVERLAY_CARD_RADIUS}
        style={{ backgroundColor: material.fillTop }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View
            style={{
              width: 4,
              alignSelf: 'stretch',
              borderRadius: 2,
              backgroundColor: stripColor,
            }}
          />
          {roundaboutExit !== null ? (
            <RoundaboutExitGlyph
              exit={roundaboutExit}
              color={inkColor}
              trackColor={material.textDim}
              size={ROUNDABOUT_SIZE}
            />
          ) : (
            <Feather name={icon} size={GLYPH_SIZE} color={inkColor} />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                columnGap: 8,
              }}
            >
              <Text
                style={{
                  color: material.text,
                  fontSize: INSTRUCTION_SIZE,
                  lineHeight: INSTRUCTION_LINE,
                  fontWeight: '600',
                }}
                numberOfLines={2}
              >
                {parts.action}
              </Text>
              {parts.distance ? (
                <Text
                  style={{
                    color: inkColor,
                    fontSize: INSTRUCTION_SIZE,
                    lineHeight: INSTRUCTION_LINE,
                    fontWeight: '700',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {parts.distance}
                </Text>
              ) : null}
            </View>
            {street ? (
              <Text
                style={{
                  color: material.textDim,
                  fontSize: STREET_SIZE,
                  lineHeight: STREET_LINE,
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
