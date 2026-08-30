import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Ride } from '../lib/stores/driverStore';
import { NeonSwipeButton, type SwipeVariant } from './NeonSwipeButton';
import { PreferredNavButton } from './PreferredNavButton';
import { WaitingElapsedTimer } from './WaitingElapsedTimer';
import { RidePriceBonus } from './RidePriceBonus';
import type { NavDestination } from '../lib/utils/externalNavigation';

type ActiveTripSheetProps = Readonly<{
  ride: Ride;
  pickupDest: NavDestination;
  dropoffDest: NavDestination;
  onMarkArrived: () => void;
  onStartTrip: () => void;
  onCompleteTrip: () => void;
  onCancel: () => void;
}>;

function tripStatusLabel(isInProgress: boolean, hasArrived: boolean): string {
  if (isInProgress) return 'En course';
  if (hasArrived) return 'En attente';
  return 'Vers client';
}

export function ActiveTripSheet({
  ride,
  pickupDest,
  dropoffDest,
  onMarkArrived,
  onStartTrip,
  onCompleteTrip,
  onCancel,
}: ActiveTripSheetProps) {
  const hasArrived = Boolean(ride.driver_arrived_at);
  const isScheduled = ride.status === 'scheduled';
  const isInProgress = ride.status === 'in-progress';

  const navDest =
    isInProgress || (isScheduled && hasArrived) ? dropoffDest : pickupDest;

  let swipeLabel = 'Je suis arrivé';
  let swipeVariant: SwipeVariant = 'amber';
  let onSwipe = onMarkArrived;
  let swipeKey = `arrived-${ride.id}`;

  if (isScheduled && hasArrived) {
    swipeLabel = 'Démarrer';
    swipeVariant = 'indigo';
    onSwipe = onStartTrip;
    swipeKey = `start-${ride.id}`;
  } else if (isInProgress) {
    swipeLabel = 'Terminer';
    swipeVariant = 'emerald';
    onSwipe = onCompleteTrip;
    swipeKey = `complete-${ride.id}`;
  }

  const statusLabel = tripStatusLabel(isInProgress, hasArrived);
  const showWaitTimer = isScheduled && hasArrived && ride.driver_arrived_at;

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <View className="flex-row items-center flex-1 mr-2">
          <View className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
          <Text
            className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest"
            numberOfLines={1}
          >
            {statusLabel}
          </Text>
          {showWaitTimer ? (
            <View className="ml-2">
              <WaitingElapsedTimer
                sinceIso={ride.driver_arrived_at!}
                className="text-amber-300 font-black text-sm tabular-nums"
              />
            </View>
          ) : null}
        </View>
        <RidePriceBonus ride={ride} size="md" tone="dark" />
      </View>

      <View className="mb-3.5">
        <View className="flex-row items-center mb-0.5">
          <Feather
            name="map-pin"
            size={12}
            color="#34d399"
            style={{ marginRight: 6 }}
          />
          <Text className="text-white text-xs font-medium flex-1" numberOfLines={1}>
            {ride.pickup_address}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Feather
            name="flag"
            size={12}
            color="#818cf8"
            style={{ marginRight: 6 }}
          />
          <Text className="text-white/70 text-xs flex-1" numberOfLines={1}>
            {ride.dropoff_address}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2.5 mt-0.5">
        <PreferredNavButton destination={navDest} />
        <View className="flex-1">
          <NeonSwipeButton
            key={swipeKey}
            resetKey={swipeKey}
            label={swipeLabel}
            variant={swipeVariant}
            onConfirm={onSwipe}
          />
        </View>
      </View>

      <Pressable onPress={onCancel} hitSlop={8} className="items-center pt-1">
        <Text className="text-white/20 text-[10px]">Annuler</Text>
      </Pressable>
    </View>
  );
}
