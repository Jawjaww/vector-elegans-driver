import { View, Text } from 'react-native';
import {
  formatIncentiveBonusLabel,
  resolveRideOfferPrice,
  type RidePriceFields,
} from '../lib/utils/ridePickup';

type RidePriceBonusProps = Readonly<{
  ride: RidePriceFields;
  /** larger total for fullscreen offer header */
  size?: 'sm' | 'md' | 'lg';
  /** light header on mint gradient vs dark bottomsheet */
  tone?: 'light' | 'dark';
  className?: string;
}>;

/**
 * Total fare with an explicit amber bonus chip when client_incentive > 0.
 */
export function RidePriceBonus({
  ride,
  size = 'md',
  tone = 'dark',
  className,
}: RidePriceBonusProps) {
  const { total, incentive, hasIncentive } = resolveRideOfferPrice(ride);
  const totalLabel =
    total > 0 || hasIncentive ? `€${total.toFixed(2)}` : '—';

  const totalColor = tone === 'light' ? 'text-emerald-900' : 'text-white';
  let totalSize = 'text-base';
  if (size === 'lg') totalSize = 'text-xl';
  else if (size === 'sm') totalSize = 'text-sm';

  return (
    <View className={`items-end ${className ?? ''}`.trim()}>
      <Text className={`${totalColor} ${totalSize} font-black`}>
        {totalLabel}
      </Text>
      {hasIncentive ? (
        <View
          className={`mt-0.5 rounded-full px-1.5 py-0.5 ${
            tone === 'light' ? 'bg-amber-500/25' : 'bg-amber-500/20'
          }`}
        >
          <Text
            className={`font-bold ${
              tone === 'light' ? 'text-amber-800' : 'text-amber-300'
            } ${size === 'sm' ? 'text-[9px]' : 'text-[10px]'}`}
          >
            {formatIncentiveBonusLabel(incentive)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
