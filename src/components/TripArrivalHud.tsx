import { View, Text, Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';
import {
  formatArrivalClock,
  formatRemainingDistance,
  optimisticEtaMinutes,
  type NavProgress,
} from '../lib/utils/navProgress';
import { NAV_SHEET_VISIBLE_H, TRIP_SHEET_VISIBLE_H } from './BottomSheet';
import { TRIP_GUIDANCE_BAR_HEIGHT } from './TripGuidanceBar';
import { GlassPanel } from './GlassPanel';
import { MAP_PALETTE } from '../lib/mapPalette';
import {
  GUIDANCE_EMERGE_MS,
  GUIDANCE_RETRACT_MS,
} from '../lib/utils/tripGuidancePeek';

/** Gap between two stacked overlays, and between the lower one and the sheet. */
const STACK_GAP = 6;

type TripArrivalHudProps = Readonly<{
  progress: NavProgress;
  /** Place above the taller trip sheet (waiting at pickup). */
  aboveTripSheet?: boolean;
  /**
   * Ride above the guidance bar while the bar is on screen.
   *
   * A prop rather than a measurement, and it animates rather than jumps: the bar retracts on its
   * own once the driver is moving, and a chip that stayed put would be left floating over an
   * empty slot. The two move on the same clock — see `GUIDANCE_EMERGE_MS`. Passed in rather than
   * derived: this chip knows nothing about the trip's stage, and giving it that knowledge to save
   * one prop is how two components end up disagreeing about which one is on top.
   */
  aboveGuidanceBar?: boolean;
}>;

/**
 * Compact arrival chip (clock · distance), just above the bottom sheet.
 *
 * The clock is the number the driver actually reads, so it keeps the heaviest weight on the
 * panel and the distance is tinted with the arrival green — the same green as the destination
 * marker, which is what the remaining distance is a distance *to*.
 *
 * Unlike the guidance bar, this one never leaves: it is the answer to "when do I get there",
 * worth reading for the whole leg, where the instruction is only news at the moment it changes.
 * The bar therefore keeps the slot against the sheet — the one the sheet is meant to be speaking
 * through — and this chip is lifted above it. That is why the lift animates instead of jumping:
 * the bar leaves on its own once the driver is moving, and a chip left behind would be floating
 * over an empty slot.
 */
export function TripArrivalHud({
  progress,
  aboveTripSheet = false,
  aboveGuidanceBar = false,
}: TripArrivalHudProps) {
  const eta = optimisticEtaMinutes(
    progress.durationSeconds,
    progress.distanceMeters,
  );
  const clock = formatArrivalClock(eta);
  const sheetH = aboveTripSheet ? TRIP_SHEET_VISIBLE_H : NAV_SHEET_VISIBLE_H;

  const lift = useRef(new Animated.Value(aboveGuidanceBar ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(lift, {
      toValue: aboveGuidanceBar ? 1 : 0,
      duration: aboveGuidanceBar ? GUIDANCE_EMERGE_MS : GUIDANCE_RETRACT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [lift, aboveGuidanceBar]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        bottom: sheetH + 10,
        zIndex: 15,
        transform: [
          {
            translateY: lift.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -(TRIP_GUIDANCE_BAR_HEIGHT + STACK_GAP)],
            }),
          },
        ],
      }}
    >
      {/* Self-sizing rather than stretched: this chip is the short one, and a full-width pill
          would claim the same visual weight as the instruction bar under it. */}
      <GlassPanel radius={999}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 8,
            paddingVertical: 8,
            paddingHorizontal: 14,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 17,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
              letterSpacing: 0.3,
            }}
          >
            {clock}
          </Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.32)',
              fontSize: 13,
              fontWeight: '600',
            }}
          >
            ·
          </Text>
          <Text
            style={{
              color: MAP_PALETTE.arrival,
              fontSize: 13,
              fontWeight: '700',
            }}
          >
            {formatRemainingDistance(progress.distanceMeters)}
          </Text>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}
