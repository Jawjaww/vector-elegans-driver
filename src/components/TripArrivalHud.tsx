import { View, Text, Animated, Easing } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, type RefObject } from 'react';
import {
  formatArrivalClock,
  formatRemainingDistance,
  optimisticEtaMinutes,
  type NavProgress,
} from '../lib/utils/navProgress';
import { NAV_SHEET_VISIBLE_H, TRIP_SHEET_VISIBLE_H } from './BottomSheet';
import {
  LANE_BASE_OFFSET,
  LIFT_OVER_INSTRUCTION,
  OVERLAY_CARD_RADIUS,
} from '../lib/utils/overlayLane';
import { GlassPanel } from './GlassPanel';
import {
  GUIDANCE_EMERGE_MS,
  GUIDANCE_RETRACT_MS,
} from '../lib/utils/tripGuidancePeek';
import { GLASS_MATERIAL } from '../lib/theme';

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
  const material = GLASS_MATERIAL;
  const eta = optimisticEtaMinutes(
    progress.durationSeconds,
    progress.distanceMeters,
  );
  const clock = formatArrivalClock(eta);
  const sheetH = aboveTripSheet ? TRIP_SHEET_VISIBLE_H : NAV_SHEET_VISIBLE_H;

  const lift = useRef(new Animated.Value(aboveGuidanceBar ? 1 : 0)).current;
  const frameRef = useRef<View>(null);

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
      ref={frameRef as RefObject<View>}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        bottom: sheetH + LANE_BASE_OFFSET,
        zIndex: 15,
        transform: [
          {
            translateY: lift.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -LIFT_OVER_INSTRUCTION],
            }),
          },
        ],
      }}
    >
      <GlassPanel
        radius={OVERLAY_CARD_RADIUS}
        frameRef={frameRef}
        transformSync={lift}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Feather name="navigation" size={18} color={material.accentStrong} />
          <Text
            style={{
              color: material.text,
              fontSize: 15,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatRemainingDistance(progress.distanceMeters)}
          </Text>
          <Text style={{ color: material.textDim, fontSize: 15, fontWeight: '500' }}>
            ·
          </Text>
          <Text
            style={{
              color: material.text,
              fontSize: 15,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
            }}
          >
            {clock}
          </Text>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}
