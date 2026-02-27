import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useDriverStore } from '../../src/lib/stores/driverStore';

export default function RidesScreen() {
  const { activeRide, completeRide, stats } = useDriverStore();

  const handleCompleteRide = () => {
    if (activeRide) {
      Alert.alert(
        "Complete Ride",
        "Are you sure you want to complete this ride?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Complete", 
            style: "default",
            onPress: () => {
              completeRide(activeRide);
              Alert.alert("Success", "Ride completed successfully!");
            }
          }
        ]
      );
    }
  };

  return (
    <View className="flex-1 bg-transparent px-6 pt-16">
      <View className="mb-6">
        <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">Rides</Text>
        <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">Current & History</Text>
      </View>

      {activeRide ? (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View 
            className="overflow-hidden rounded-2xl mb-6 bg-emerald-500/10 border border-emerald-500/30"
          >
            <View className="p-6">
              <View className="flex-row justify-between items-center mb-4">
                <View className="flex-row items-center space-x-2">
                  <View className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <Text className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Active Now</Text>
                </View>
                <Text className="text-white font-black text-xl">€{activeRide.estimated_price?.toFixed(2)}</Text>
              </View>
              
              <View className="mb-6">
                <View className="flex-row items-center mb-4">
                  <View className="w-8 h-8 rounded-full bg-emerald-500/20 items-center justify-center mr-3">
                    <Feather name="map-pin" size={14} color="#34d399" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Pickup</Text>
                    <Text className="text-white font-medium text-lg leading-6">{activeRide.pickup_address}</Text>
                  </View>
                </View>

                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-indigo-500/20 items-center justify-center mr-3">
                    <Feather name="navigation" size={14} color="#818cf8" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Dropoff</Text>
                    <Text className="text-white font-medium text-lg leading-6">{activeRide.dropoff_address}</Text>
                  </View>
                </View>
              </View>

              <View className="flex-row justify-between items-center mb-6 bg-black/20 p-4 rounded-xl">
                <View>
                  <Text className="text-slate-400 text-xs mb-1">Distance</Text>
                  <Text className="text-white font-bold text-lg">{(activeRide.distance || 0) / 1000} km</Text>
                </View>
                <View className="w-[1px] h-8 bg-white/10" />
                <View>
                  <Text className="text-slate-400 text-xs mb-1">Est. Time</Text>
                  <Text className="text-white font-bold text-lg">{Math.round((activeRide.duration || 0) / 60)} min</Text>
                </View>
              </View>

              <TouchableOpacity 
                onPress={handleCompleteRide}
                className="w-full bg-emerald-500 py-4 rounded-xl items-center shadow-lg shadow-emerald-500/20"
              >
                <Text className="text-white font-bold text-base uppercase tracking-wider">Complete Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 justify-center items-center opacity-80">
          <View className="w-full overflow-hidden rounded-2xl">
            <View className="p-8 items-center">
              <View className="w-24 h-24 rounded-full items-center justify-center border border-white/10 mb-6 bg-white/5">
                <Text className="text-5xl">🚗</Text>
              </View>
              <Text className="text-2xl font-black text-white tracking-tighter uppercase mb-2 text-center">No Active Rides</Text>
              <Text className="text-center text-slate-400 font-medium leading-6 mb-8">
                Go online to start receiving ride requests.
              </Text>
              
              {stats.todayRides > 0 && (
                <View className="w-full bg-white/5 rounded-xl p-4 border border-white/10">
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 text-center">Today's Summary</Text>
                  <View className="flex-row justify-between">
                     <View className="items-center flex-1">
                        <Text className="text-white font-black text-xl">{stats.todayRides}</Text>
                        <Text className="text-slate-500 text-xs">Rides</Text>
                     </View>
                     <View className="items-center flex-1 border-l border-white/10">
                        <Text className="text-white font-black text-xl">€{stats.todayEarnings.toFixed(2)}</Text>
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
