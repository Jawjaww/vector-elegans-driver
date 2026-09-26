import { View, Text, Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NAV_SHEET_VISIBLE_H, TRIP_SHEET_VISIBLE_H } from './BottomSheet';
import { GlassPanel } from './GlassPanel';
import {
  tripGuidanceAccent,
  tripGuidanceTitleKey,
  type TripStage,
} from '../lib/utils/tripGuidance';
import {
  GUIDANCE_EMERGE_MS,
  GUIDANCE_RETRACT_MS,
} from '../lib/utils/tripGuidancePeek';
import { LANE_BASE_OFFSET, OVERLAY_CARD_RADIUS } from '../lib/utils/overlayLane';
import { GLASS_MATERIAL } from '../lib/theme';

/** How far the bar dips towards the sheet as it retracts: a hint of a destination, not a ride. */
const SINK_PX = 12;

type TripGuidanceBarProps = Readonly<{
  stage: TripStage;
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
 * **It carries the instruction and nothing else.** A second line used to hold the pickup or
 * drop-off address, on the reasoning that the title named a place the driver could not find. That
 * was wrong twice: the map already pins the place the sentence names, and the half of the row the
 * address took was the half the instruction needed — on the longest locale the sentence was cut
 * mid-word. Naming the address is the sheet's job and the pin's job.
 *
 * Drawn on a `GlassPanel` and accented per stage, so the bar is identifiable at a glance without
 * being read: blue for the drive to the customer, amber for the wait, green for the drive to the
 * destination — the same colours as the pins it names. The whole bar is transparent to touch: it
 * is read, never pressed, and a panel that swallowed a pan would cost the driver the map.
 */
export function TripGuidanceBar({
  stage,
  aboveTripSheet = false,
  visible = true,
}: TripGuidanceBarProps) {
  const { t } = useTranslation();
  const material = GLASS_MATERIAL;
  const accent = tripGuidanceAccent(stage);
  const sheetH = aboveTripSheet ? TRIP_SHEET_VISIBLE_H : NAV_SHEET_VISIBLE_H;
  const laneBottom = sheetH + LANE_BASE_OFFSET;

  const shown = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(shown, {
      toValue: visible ? 1 : 0,
      duration: visible ? GUIDANCE_EMERGE_MS : GUIDANCE_RETRACT_MS,
      easing: Easing.out(Easing.cubic),
      // Layout `bottom` so map frost and the hairline share one frame (native `translateY` does not).
      useNativeDriver: false,
    }).start();
  }, [shown, visible]);

  const bottom = shown.interpolate({
    inputRange: [0, 1],
    outputRange: [laneBottom - SINK_PX, laneBottom],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom,
        zIndex: 14,
        opacity: shown,
      }}
    >
      <GlassPanel radius={OVERLAY_CARD_RADIUS}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Feather name={accent.icon} size={20} color={accent.ink} />
          <Text
            numberOfLines={2}
            style={{
              color: material.text,
              fontSize: 16,
              lineHeight: 22,
              fontWeight: '600',
              flexShrink: 1,
            }}
          >
            {t(tripGuidanceTitleKey(stage))}
          </Text>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}
