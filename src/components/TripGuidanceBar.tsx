import { View, Text, Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NAV_SHEET_VISIBLE_H, TRIP_SHEET_VISIBLE_H } from './BottomSheet';
import { GlassPanel } from './GlassPanel';
import {
  tripGuidanceAccent,
  tripGuidanceAddress,
  tripGuidanceHintKey,
  tripGuidanceTitleKey,
  type TripStage,
} from '../lib/utils/tripGuidance';
import {
  GUIDANCE_EMERGE_MS,
  GUIDANCE_RETRACT_MS,
} from '../lib/utils/tripGuidancePeek';
import { useGlassMaterial } from '../lib/glass/glassMaterialPreference';

/**
 * Fixed height, exported, because the arrival chip has to stack above it.
 *
 * Deterministic rather than measured: the two lines are pinned to one line each, so there is no
 * state in which the bar grows and no reason to pay for an onLayout round-trip that would make
 * the chip jump a frame after the bar appears.
 */
export const TRIP_GUIDANCE_BAR_HEIGHT = 58;

/** How far the bar dips towards the sheet as it retracts: a hint of a destination, not a ride. */
const SINK_PX = 12;

const BAR_RADIUS = 16;

type TripGuidanceBarProps = Readonly<{
  stage: TripStage;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  /** Place above the taller trip sheet (waiting at pickup). */
  aboveTripSheet?: boolean;
  /**
   * Whether the announcement is currently worth showing.
   *
   * A prop rather than an unmount, so the retraction can be animated: the bar stays mounted for
   * the whole stage and only leaves the screen. Unmounting lives one level up, driven by the
   * stage alone — a stage that has gone has nothing to animate out.
   */
  visible?: boolean;
}>;

/**
 * The instruction for the current stage of the trip, as an announcement rather than a fixture.
 *
 * It sits where the arrival chip sits rather than inside the sheet, and that placement is the
 * fix: the sheet rests at `nav` while a ride is being driven, which leaves 14 px of body, so the
 * same sentence inside the sheet was never on screen.
 *
 * It rises out of the sheet when the stage changes and sinks back once the driver is on their
 * way — see `tripGuidancePeek` for what "on their way" means. The motion is the point: a bar
 * that appeared and vanished at full opacity would read as a glitch, where one that slides out
 * of the sheet and back into it reads as the sheet speaking, which is what it is.
 *
 * Drawn on a `GlassPanel` and accented per stage, so the bar is identifiable at a glance without
 * being read: blue for the drive to the customer, amber for the wait, green for the drive to the
 * destination — the same colours as the pins it names. The whole bar is transparent to touch: it
 * is read, never pressed, and a panel that swallowed a pan would cost the driver the map.
 */
export function TripGuidanceBar({
  stage,
  pickupAddress,
  dropoffAddress,
  aboveTripSheet = false,
  visible = true,
}: TripGuidanceBarProps) {
  const { t } = useTranslation();
  const material = useGlassMaterial();
  const address = tripGuidanceAddress(stage, { pickupAddress, dropoffAddress });
  const hintKey = tripGuidanceHintKey(stage);
  const accent = tripGuidanceAccent(stage);
  const sheetH = aboveTripSheet ? TRIP_SHEET_VISIBLE_H : NAV_SHEET_VISIBLE_H;

  const shown = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(shown, {
      toValue: visible ? 1 : 0,
      duration: visible ? GUIDANCE_EMERGE_MS : GUIDANCE_RETRACT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [shown, visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: sheetH + 10,
        zIndex: 14,
        opacity: shown,
        transform: [
          {
            translateY: shown.interpolate({
              inputRange: [0, 1],
              outputRange: [SINK_PX, 0],
            }),
          },
        ],
      }}
    >
      <GlassPanel radius={BAR_RADIUS}>
        <View
          style={{
            height: TRIP_GUIDANCE_BAR_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              // A tint of the stage's own colour rather than a flat grey chip, so the accent
              // carries into the glyph without a second colour entering the palette. The alpha
              // comes from the material: the same figure that reads as a tint on charcoal
              // washes out on a pale body.
              backgroundColor: `${accent.color}${material.chipTintAlpha}`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={accent.icon} size={16} color={accent.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                color: material.text,
                fontSize: 14,
                fontWeight: '800',
                letterSpacing: 0.2,
              }}
            >
              {t(tripGuidanceTitleKey(stage))}
            </Text>
            {/* The address carries the instruction; without it the title names a place the driver
                cannot find. Falls back to the stage's hint rather than rendering an empty line,
                which would read as a glyph failure. */}
            <Text
              numberOfLines={1}
              style={{
                color: material.textDim,
                fontSize: 12.5,
                fontWeight: '600',
                marginTop: 2,
              }}
            >
              {address ?? (hintKey ? t(hintKey) : '')}
            </Text>
          </View>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}
