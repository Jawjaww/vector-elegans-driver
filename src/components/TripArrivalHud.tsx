import { View, Text, Animated, Easing } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ARRIVAL_CHIP_DISTANCE_CAPTION_KEY,
  ARRIVAL_CHIP_ETA_CAPTION_KEY,
  formatArrivalClock,
  formatRemainingDistance,
  optimisticEtaMinutes,
  type NavProgress,
} from '../lib/utils/navProgress';
import {
  LANE_BASE_OFFSET,
  LIFT_OVER_INSTRUCTION,
  OVERLAY_CARD_RADIUS,
} from '../lib/utils/overlayLane';
import { GlassPanel } from './GlassPanel';
import { NAV_SHEET_VISIBLE_H } from './BottomSheet';
import {
  GUIDANCE_EMERGE_MS,
  GUIDANCE_RETRACT_MS,
} from '../lib/utils/tripGuidancePeek';
import { GLASS_MATERIAL } from '../lib/theme';

type TripArrivalHudProps = Readonly<{
  progress: NavProgress;
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
 * One number and the word that says what it is.
 *
 * The chip used to read `5,8 km · 14h25`: two bare figures and a dot, and neither answered the
 * question the driver has. The caption is the whole fix — it is what turns a number into the
 * sentence "5.8 km left, arriving at 14:25" instead of leaving them to guess which countdown the
 * first one is and what the second one is the time *of*.
 */
function ChipStat({
  caption,
  value,
  strong = false,
}: Readonly<{ caption: string; value: string; strong?: boolean }>) {
  const material = GLASS_MATERIAL;
  return (
    <View style={{ gap: 1 }}>
      <Text
        style={{
          color: material.textDim,
          fontSize: 10,
          lineHeight: 12,
          fontWeight: '600',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {caption}
      </Text>
      <Text
        style={{
          color: material.text,
          fontSize: strong ? 17 : 15,
          lineHeight: 20,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Compact arrival chip (distance left · arrival clock), just above the resting sheet.
 *
 * The clock is the number the driver actually reads, so it carries the heavier type, and the
 * distance is the one they check when the clock moves.
 *
 * Unlike the guidance bar, this one never leaves: it is the answer to "when do I get there",
 * worth reading for the whole leg, where the instruction is only news at the moment it changes.
 * The bar therefore keeps the slot against the sheet — the one the sheet is meant to be speaking
 * through — and this chip is lifted above it. That is why the lift animates instead of jumping:
 * the bar leaves on its own once the driver is moving, and a chip left behind would be floating
 * over an empty slot.
 *
 * The anchor, on the other hand, is fixed, and deliberately so. It used to be `laneBottom` on the
 * *live* sheet height, which meant a drag on the sheet moved the chip — and with it the frost
 * rect and the hairline the panel has to republish to the map, so one gesture re-measured three
 * layers. It also made the sheet unable to cover the chip, which is backwards: a panel the driver
 * pulled up is the one thing on this screen that must win. Anchored to the resting palier, a
 * raised sheet simply covers the chip, and the chip is there again when the sheet goes back down.
 */
export function TripArrivalHud({
  progress,
  aboveGuidanceBar = false,
}: TripArrivalHudProps) {
  const { t } = useTranslation();
  const material = GLASS_MATERIAL;
  const eta = optimisticEtaMinutes(
    progress.durationSeconds,
    progress.distanceMeters,
  );
  const clock = formatArrivalClock(eta);
  const laneBottom = NAV_SHEET_VISIBLE_H + LANE_BASE_OFFSET;

  const lift = useRef(new Animated.Value(aboveGuidanceBar ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(lift, {
      toValue: aboveGuidanceBar ? 1 : 0,
      duration: aboveGuidanceBar ? GUIDANCE_EMERGE_MS : GUIDANCE_RETRACT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [lift, aboveGuidanceBar]);

  const bottom = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [laneBottom, laneBottom + LIFT_OVER_INSTRUCTION],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        bottom,
        zIndex: 15,
      }}
    >
      <GlassPanel radius={OVERLAY_CARD_RADIUS}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Feather name="navigation" size={18} color={material.accentStrong} />
          <ChipStat
            caption={t(ARRIVAL_CHIP_DISTANCE_CAPTION_KEY)}
            value={formatRemainingDistance(progress.distanceMeters)}
          />
          <View
            style={{
              width: 1,
              alignSelf: 'stretch',
              backgroundColor: material.textDim,
              opacity: 0.4,
            }}
          />
          <ChipStat
            caption={t(ARRIVAL_CHIP_ETA_CAPTION_KEY)}
            value={clock}
            strong
          />
        </View>
      </GlassPanel>
    </Animated.View>
  );
}
