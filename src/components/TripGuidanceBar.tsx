import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NAV_SHEET_VISIBLE_H, TRIP_SHEET_VISIBLE_H } from './BottomSheet';
import {
  tripGuidanceAddress,
  tripGuidanceHintKey,
  tripGuidanceTitleKey,
  type TripStage,
} from '../lib/utils/tripGuidance';

/**
 * Fixed height, exported, because the arrival chip has to stack above it.
 *
 * Deterministic rather than measured: the two lines are pinned to one line each, so there is no
 * state in which the bar grows and no reason to pay for an onLayout round-trip that would make
 * the chip jump a frame after the bar appears.
 */
export const TRIP_GUIDANCE_BAR_HEIGHT = 54;

type TripGuidanceBarProps = Readonly<{
  stage: TripStage;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  /** Place above the taller trip sheet (waiting at pickup). */
  aboveTripSheet?: boolean;
}>;

/**
 * The instruction for the current stage of the trip, kept on screen.
 *
 * It sits where the arrival chip sits rather than inside the sheet, and that placement is the
 * fix: the sheet rests at `nav` while a ride is being driven, which leaves 14 px of body, so the
 * same sentence inside the sheet was never on screen. Everything here is `pointerEvents="none"`
 * — it is read, not touched, and a bar that swallowed a pan would cost the driver the map.
 */
export function TripGuidanceBar({
  stage,
  pickupAddress,
  dropoffAddress,
  aboveTripSheet = false,
}: TripGuidanceBarProps) {
  const { t } = useTranslation();
  const address = tripGuidanceAddress(stage, { pickupAddress, dropoffAddress });
  const hintKey = tripGuidanceHintKey(stage);
  const sheetH = aboveTripSheet ? TRIP_SHEET_VISIBLE_H : NAV_SHEET_VISIBLE_H;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: sheetH + 10,
        zIndex: 14,
        height: TRIP_GUIDANCE_BAR_HEIGHT,
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(8, 8, 8, 0.82)',
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: '#fff',
          fontSize: 14,
          fontWeight: '800',
          letterSpacing: 0.2,
        }}
      >
        {t(tripGuidanceTitleKey(stage))}
      </Text>
      {/* The address carries the instruction; without it the title names a place the driver
          cannot find. Rendered whenever there is one, never as an empty line that would read as
          a glyph failure. */}
      {address ? (
        <Text
          numberOfLines={1}
          style={{
            color: 'rgba(255,255,255,0.66)',
            fontSize: 13,
            fontWeight: '600',
          }}
        >
          {address}
        </Text>
      ) : hintKey ? (
        <Text
          numberOfLines={1}
          style={{
            color: 'rgba(255,255,255,0.66)',
            fontSize: 13,
            fontWeight: '600',
          }}
        >
          {t(hintKey)}
        </Text>
      ) : null}
    </View>
  );
}
