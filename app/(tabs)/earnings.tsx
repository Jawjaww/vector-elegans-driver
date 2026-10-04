import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../src/lib/supabase';
import {
  isWeekSummaryConsistent,
  toWeekSummary,
  type WeekSummary,
} from '../../src/lib/utils/weekSummary';

/**
 * Le relevé de la semaine (F-03 / F-04).
 *
 * Cet écran affichait `todayEarnings × 3.5` et `todayEarnings × 12` — deux montants **inventés**,
 * avec le commentaire « Simulated multiplier » — sur une base `todayEarnings` qui persiste entre
 * deux lancements de l'app. Tout vient maintenant de `driver_week_summary`, et un relevé
 * incohérent est **refusé** plutôt qu'affiché : les quatre compartiments doivent totaliser le net.
 *
 * La séparation espèces / carte est la raison d'être de l'écran : 200 € encaissés et 300 € à
 * recevoir, ce n'est pas « 500 € gagnés ». Un chiffre unique laisserait le chauffeur croire qu'il a
 * tout touché.
 */
export default function EarningsScreen() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);

    try {
      const { data, error } = await supabase.rpc('driver_week_summary');
      if (error) throw error;

      const parsed = toWeekSummary(data);
      // Un relevé qui ne s'additionne pas n'est pas affiché : c'est le seul cas où se taire vaut
      // mieux que montrer un chiffre, parce qu'un chiffre faux ne se voit pas.
      setSummary(parsed && isWeekSummaryConsistent(parsed) ? parsed : null);
      setFailed(parsed === null);
    } catch {
      setSummary(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const card = 'overflow-hidden rounded-2xl mb-4';
  const cardStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  } as const;

  return (
    <View className="flex-1 bg-transparent">
      <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}>
        <View className="pt-16 pb-6">
          <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">
            {t('earningsScreen.title')}
          </Text>
          <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">
            {t('earningsScreen.subtitle')}
          </Text>
        </View>

        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#34d399" />
            <Text className="text-slate-400 mt-3 text-sm">{t('earningsScreen.loading')}</Text>
          </View>
        ) : failed || !summary ? (
          <View className={card} style={cardStyle}>
            <View className="p-6 items-center">
              <Feather name="alert-triangle" size={20} color="#fbbf24" />
              <Text className="text-slate-300 text-center mt-3 text-sm">
                {t('earningsScreen.inconsistent')}
              </Text>
              <Pressable
                onPress={() => void load()}
                accessibilityRole="button"
                className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2"
              >
                <Text className="text-emerald-300 text-sm font-bold">
                  {t('earningsScreen.retry')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* Le net de la semaine */}
            <View className={card} style={cardStyle}>
              <View className="p-6">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">
                    {t('earningsScreen.week')} · {t('earningsScreen.netEarnings')}
                  </Text>
                  <Feather name="calendar" size={16} color="#34d399" />
                </View>
                <Text className="text-4xl font-black text-white tracking-tighter">
                  €{summary.totals.netEarnings.toFixed(2)}
                </Text>
                <View className="mt-4 flex-row items-center">
                  <View className="bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 mr-2">
                    <Text className="text-emerald-400 text-xs font-bold">
                      {t('earningsScreen.ridesChip', { count: summary.totals.rides })}
                    </Text>
                  </View>
                  <Text className="text-slate-500 text-xs">
                    {t('earningsScreen.ridesThisWeek')}
                  </Text>
                </View>
              </View>
            </View>

            {/* La séparation : ce qui est en poche, et ce qui est dû */}
            <View className={card} style={cardStyle}>
              <View className="p-6">
                <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-4">
                  {t('earningsScreen.detail')}
                </Text>

                <Line
                  icon="dollar-sign"
                  tone="#4ade80"
                  label={t('earningsScreen.cashCollected')}
                  value={summary.totals.cashCollected}
                />
                <Line
                  icon="credit-card"
                  tone="#60a5fa"
                  label={t('earningsScreen.cardDue')}
                  value={summary.totals.cardDue}
                />
                {summary.totals.cashToCollect > 0 ? (
                  <Line
                    icon="clock"
                    tone="#fbbf24"
                    label={t('earningsScreen.cashToCollect')}
                    value={summary.totals.cashToCollect}
                  />
                ) : null}
                {summary.totals.cardPending > 0 ? (
                  <Line
                    icon="clock"
                    tone="#94a3b8"
                    label={t('earningsScreen.cardPending')}
                    value={summary.totals.cardPending}
                  />
                ) : null}
              </View>
            </View>

            {/* Ce que la plateforme doit : la créance, jamais les espèces */}
            <View className={card} style={cardStyle}>
              <View className="p-6 flex-row justify-between items-center">
                <View>
                  <Text className="text-slate-400 font-bold text-xs uppercase tracking-wider">
                    {t('earningsScreen.dueByPlatform')}
                  </Text>
                  <Text className="text-2xl font-black text-white tracking-tighter mt-1">
                    €{summary.totals.dueByPlatform.toFixed(2)}
                  </Text>
                </View>
                <Feather name="arrow-down-circle" size={22} color="#60a5fa" />
              </View>
            </View>

            {/* Le détail, course par course */}
            {summary.rides.length === 0 ? (
              <Text className="text-slate-500 text-sm text-center py-6">
                {t('earningsScreen.empty')}
              </Text>
            ) : (
              summary.rides.map((ride) => (
                <View key={ride.rideId} className={card} style={cardStyle}>
                  <View className="p-4">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-slate-400 text-xs">
                        {ride.pickupAt ? new Date(ride.pickupAt).toLocaleString() : '—'}
                      </Text>
                      <View className="flex-row items-center">
                        <Feather
                          name={ride.paymentMethod === 'cash' ? 'dollar-sign' : 'credit-card'}
                          size={13}
                          color={ride.paid ? '#4ade80' : '#fbbf24'}
                        />
                        <Text className="text-slate-400 text-xs ml-1">
                          {ride.paid ? t('earningsScreen.paid') : t('earningsScreen.unpaid')}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-slate-200 text-sm mt-2" numberOfLines={1}>
                      {ride.pickupAddress || '—'}
                    </Text>
                    <Text className="text-slate-500 text-xs" numberOfLines={1}>
                      → {ride.dropoffAddress || '—'}
                    </Text>
                    <View className="flex-row justify-between items-center mt-2">
                      <Text className="text-white font-bold">
                        €{ride.driverEarning.toFixed(2)}
                      </Text>
                      {ride.hasDocument && ride.documentNumber ? (
                        <Text className="text-slate-500 text-xs">{ride.documentNumber}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Line({
  icon,
  tone,
  label,
  value,
}: Readonly<{ icon: string; tone: string; label: string; value: number }>) {
  return (
    <View className="flex-row justify-between items-center mb-3">
      <View className="flex-row items-center">
        <Feather name={icon as never} size={14} color={tone} />
        <Text className="text-slate-300 text-sm ml-2">{label}</Text>
      </View>
      <Text className="text-white font-bold text-sm">€{value.toFixed(2)}</Text>
    </View>
  );
}
