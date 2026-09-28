import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDriverStore } from '../../src/lib/stores/driverStore';
import { ActiveTripSheet } from '../../src/components/ActiveTripSheet';
import { useActiveTripActions } from '../../src/hooks/useActiveTripActions';
import { FeatherGlyph } from '../../src/components/FeatherGlyph';

export default function RidesScreen() {
  const { stats } = useDriverStore();
  const { t } = useTranslation();
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
          {t('ridesScreen.title')}
        </Text>
        <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">
          {t('ridesScreen.subtitle')}
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
                <FeatherGlyph name="navigation" size={40} />
              </View>
              <Text className="text-2xl font-black text-white tracking-tighter uppercase mb-2 text-center">
                {t('ridesScreen.noActiveTitle')}
              </Text>
              <Text className="text-center text-slate-400 font-medium leading-6 mb-8">
                {t('ridesScreen.noActiveBody')}
              </Text>

              {stats.todayRides > 0 && (
                <View className="w-full bg-white/5 rounded-xl p-4 border border-white/10">
                  <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3 text-center">
                    {t('ridesScreen.todaySummary')}
                  </Text>
                  <View className="flex-row justify-between">
                    <View className="items-center flex-1">
                      <Text className="text-white font-black text-xl">
                        {stats.todayRides}
                      </Text>
                      <Text className="text-slate-500 text-xs">{t('ridesScreen.rides')}</Text>
                    </View>
                    <View className="items-center flex-1 border-l border-white/10">
                      <Text className="text-white font-black text-xl">
                        €{stats.todayEarnings.toFixed(2)}
                      </Text>
                      <Text className="text-slate-500 text-xs">{t('ridesScreen.earned')}</Text>
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
