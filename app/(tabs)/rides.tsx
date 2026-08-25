import { View, Text } from 'react-native';
import { useDriverStore } from '../../src/lib/stores/driverStore';
import { ActiveTripSheet } from '../../src/components/ActiveTripSheet';
import { useActiveTripActions } from '../../src/hooks/useActiveTripActions';

export default function RidesScreen() {
  const { stats } = useDriverStore();
  const {
    activeRide,
    pickupDest,
    dropoffDest,
    markArrived,
    startTrip,
    completeTrip,
    cancelTrip,
  } = useActiveTripActions();

  const pickup = pickupDest();
  const dropoff = dropoffDest();

  return (
    <View className="flex-1 bg-transparent px-6 pt-16">
      <View className="mb-6">
        <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">
          Rides
        </Text>
        <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">
          Current & History
        </Text>
      </View>

      {activeRide && pickup && dropoff ? (
        <View className="overflow-hidden rounded-2xl mb-6 bg-emerald-500/10 border border-emerald-500/30 p-5">
          <ActiveTripSheet
            ride={activeRide}
            pickupDest={pickup}
            dropoffDest={dropoff}
            onMarkArrived={() => {
              void markArrived();
            }}
            onStartTrip={() => {
              void startTrip();
            }}
            onCompleteTrip={() => {
              void completeTrip();
            }}
            onCancel={cancelTrip}
          />
        </View>
      ) : (
        <View className="flex-1 justify-center items-center opacity-80">
          <View className="w-full overflow-hidden rounded-2xl">
            <View className="p-8 items-center">
              <View className="w-24 h-24 rounded-full items-center justify-center border border-white/10 mb-6 bg-white/5">
                <Text className="text-5xl">🚗</Text>
              </View>
              <Text className="text-2xl font-black text-white tracking-tighter uppercase mb-2 text-center">
                No Active Rides
              </Text>
              <Text className="text-center text-slate-400 font-medium leading-6 mb-8">
                Go online to start receiving ride requests. Trip controls live
                on the Home map.
              </Text>

              {stats.todayRides > 0 && (
                <View className="w-full bg-white/5 rounded-xl p-4 border border-white/10">
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 text-center">
                    Today&apos;s Summary
                  </Text>
                  <View className="flex-row justify-between">
                    <View className="items-center flex-1">
                      <Text className="text-white font-black text-xl">
                        {stats.todayRides}
                      </Text>
                      <Text className="text-slate-500 text-xs">Rides</Text>
                    </View>
                    <View className="items-center flex-1 border-l border-white/10">
                      <Text className="text-white font-black text-xl">
                        €{stats.todayEarnings.toFixed(2)}
                      </Text>
                      <Text className="text-slate-500 text-xs">Earned</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
