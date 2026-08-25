import { View, Text } from 'react-native';
import {
  formatArrivalClock,
  formatRemainingDistance,
  optimisticEtaMinutes,
  type NavProgress,
} from '../lib/utils/navProgress';
import { NAV_SHEET_VISIBLE_H, TRIP_SHEET_VISIBLE_H } from './BottomSheet';

type TripArrivalHudProps = Readonly<{
  progress: NavProgress;
  /** Place above the taller trip sheet (waiting at pickup). */
  aboveTripSheet?: boolean;
}>;

/** Compact arrival chip (clock · distance), just above the bottom sheet. */
export function TripArrivalHud({
  progress,
  aboveTripSheet = false,
}: TripArrivalHudProps) {
  const eta = optimisticEtaMinutes(
    progress.durationSeconds,
    progress.distanceMeters,
  );
  const clock = formatArrivalClock(eta);
  const sheetH = aboveTripSheet ? TRIP_SHEET_VISIBLE_H : NAV_SHEET_VISIBLE_H;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        bottom: sheetH + 10,
        zIndex: 15,
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: 'rgba(8, 8, 8, 0.78)',
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
          color: 'rgba(255,255,255,0.35)',
          fontSize: 13,
          fontWeight: '600',
        }}
      >
        ·
      </Text>
      <Text
        style={{
          color: '#6ee7b7',
          fontSize: 13,
          fontWeight: '700',
        }}
      >
        {formatRemainingDistance(progress.distanceMeters)}
      </Text>
    </View>
  );
}
