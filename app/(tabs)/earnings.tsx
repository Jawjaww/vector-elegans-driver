import { View, Text, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useDriverStore } from '../../src/lib/stores/driverStore';

export default function EarningsScreen() {
  const { stats } = useDriverStore();
  
  // Calculate simulated weekly/monthly based on today (just for display since we don't have historical data)
  const weeklyEarnings = stats.todayEarnings * 3.5; // Simulated multiplier
  const monthlyEarnings = stats.todayEarnings * 12; // Simulated multiplier

  return (
    <View className="flex-1 bg-transparent">
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}>
        <View className="pt-16 pb-6">
          <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">Earnings</Text>
          <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">Performance</Text>
        </View>
        
        {/* Today Card */}
        <View 
          className="overflow-hidden rounded-2xl mb-6"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.05)',
          }}
        >
          <View className="p-6">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">Today</Text>
              <Feather name="trending-up" size={16} color="#34d399" />
            </View>
            <Text className="text-4xl font-black text-white tracking-tighter">€{stats.todayEarnings.toFixed(2)}</Text>
            <View className="mt-4 flex-row items-center">
              <View className="bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 mr-2">
                 <Text className="text-emerald-400 text-xs font-bold">+{stats.todayRides} RIDES</Text>
              </View>
              <Text className="text-slate-500 text-xs">completed today</Text>
            </View>
          </View>
        </View>

        {/* This Week Card */}
        <View 
          className="overflow-hidden rounded-2xl mb-6"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.05)',
          }}
        >
          <View className="p-6">
             <View className="flex-row justify-between items-center mb-2">
              <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">This Week (Est.)</Text>
              <Feather name="calendar" size={16} color="#94a3b8" />
            </View>
            <Text className="text-4xl font-black text-white tracking-tighter">€{weeklyEarnings.toFixed(2)}</Text>
          </View>
        </View>

        {/* This Month Card */}
        <View 
          className="overflow-hidden rounded-2xl"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.05)',
          }}
        >
          <View className="p-6">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">This Month (Est.)</Text>
              <Feather name="credit-card" size={16} color="#94a3b8" />
            </View>
            <Text className="text-4xl font-black text-white tracking-tighter">€{monthlyEarnings.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
