import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { FeatherGlyph } from "../../src/components/FeatherGlyph";
import { MAP_PALETTE } from "../../src/lib/mapPalette";
import { VE_BLUE } from "../../src/lib/theme";
import type { Ride } from "../../src/lib/stores/driverStore";
import {
  formatHistoryWhen,
  rideHistoryAmount,
  summarizeHistoryToday,
} from "../../src/lib/utils/rideHistory";
import {
  formatMinutesCompact,
  formatRideDistanceKm,
  resolveRideTripMetrics,
} from "../../src/lib/utils/rideMetrics";
import {
  rideService,
  type CompletedRidesFetch,
} from "../../src/services/rideService";

/** Stable identity for "no rows yet", so the memo below does not re-run on every render. */
const NO_RIDES: readonly Ride[] = [];

/**
 * The driver's completed rides.
 *
 * This tab used to mirror the trip: the active ride's controls, and an empty state pointing at
 * the map when there was none. Both were already on the Home screen — the trip is driven from
 * the map, where the route, the guidance and the swipe live — so the tab restated the one thing
 * the driver was already looking at and answered nothing about what they had done. It now reads
 * the rides they carried, from the server.
 *
 * **Nothing here is cancellable mid-flight**, and that is deliberate: the read is one PostgREST
 * select of fifty rows, and a focus arriving while the previous read is in flight simply issues
 * another. A stale answer would have to lose a race against a newer one to matter, and the rows
 * are ordered server-side, so the worst case is a list one update behind for one frame.
 */
export default function RidesScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  /**
   * `null` is "not answered yet", which is not the same as "no rides": the first is a spinner and
   * the second is the empty state, and the service returns a discriminated result for exactly
   * this reason (`CompletedRidesFetch`).
   */
  const [state, setState] = useState<CompletedRidesFetch | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setState(await rideService.fetchCompletedRides());
  }, []);

  // On focus rather than on mount: ending a ride is done on the map, and the tab stays mounted
  // between visits — a mount-only read would show the ride before last.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const rides = state?.ok ? state.rides : NO_RIDES;
  const today = useMemo(
    () => summarizeHistoryToday(rides, new Date()),
    [rides],
  );

  return (
    <View className="flex-1 bg-transparent">
      <FlatList
        data={rides}
        keyExtractor={(ride) => ride.id}
        contentContainerStyle={{
          // `flexGrow` so the empty and error states fill the screen and stay pullable.
          flexGrow: 1,
          paddingBottom: 40,
          paddingHorizontal: 20,
          paddingTop: insets.top + 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={VE_BLUE.base}
            colors={[VE_BLUE.base]}
          />
        }
        ListHeaderComponent={
          <View className="pb-6">
            <Text className="text-3xl font-black text-white tracking-tighter uppercase mb-1">
              {t("ridesScreen.title")}
            </Text>
            <Text className="text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">
              {t("ridesScreen.subtitle")}
            </Text>
            {state?.ok && today.rides > 0 ? (
              <TodaySummary rides={today.rides} earnings={today.earnings} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <RideHistoryRow ride={item} locale={i18n.language} />
        )}
        ListEmptyComponent={<HistoryPlaceholder state={state} onRetry={load} />}
      />
    </View>
  );
}

/**
 * What today has been worth, from the rows the server returned.
 *
 * The store's own `todayRides` / `todayEarnings` cannot answer this: they persist between
 * launches and are never reset, so a driver who has not closed the app since yesterday reads
 * two days as one. See `summarizeHistoryToday`.
 */
function TodaySummary({
  rides,
  earnings,
}: Readonly<{ rides: number; earnings: number }>) {
  const { t } = useTranslation();
  return (
    <View
      className="mt-5 overflow-hidden rounded-2xl p-4"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.05)",
      }}
    >
      <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
        {t("ridesScreen.todaySummary")}
      </Text>
      <View className="flex-row">
        <View className="items-center flex-1">
          <Text className="text-white font-black text-xl">{rides}</Text>
          <Text className="text-slate-500 text-xs">
            {t("ridesScreen.rides")}
          </Text>
        </View>
        <View className="items-center flex-1 border-l border-white/10">
          <Text className="text-white font-black text-xl">
            €{earnings.toFixed(2)}
          </Text>
          <Text className="text-slate-500 text-xs">
            {t("ridesScreen.earned")}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * One carried ride: when it closed, what it paid, where it went.
 *
 * The timestamp is `updated_at` — the column the list is ordered by, and the one
 * `update_ride_progress` writes when a ride is completed (see `fetchCompletedRides`). Showing
 * `pickup_time` instead would order the list by one date and describe it with another.
 */
function RideHistoryRow({
  ride,
  locale,
}: Readonly<{ ride: Ride; locale: string }>) {
  const { distanceKm, durationMin } = resolveRideTripMetrics(ride);
  const amount = rideHistoryAmount(ride);
  const when = formatHistoryWhen(ride.updated_at, locale);

  return (
    <View
      className="mb-3 overflow-hidden rounded-2xl"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.05)",
      }}
    >
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-400 text-xs font-bold tracking-wide">
            {when ?? "—"}
          </Text>
          <Text className="text-white text-lg font-black">
            {amount != null ? `€${amount.toFixed(2)}` : "—"}
          </Text>
        </View>

        <View className="flex-row items-center mb-2">
          <View
            className="w-2 h-2 rounded-full mr-2.5"
            style={{ backgroundColor: MAP_PALETTE.departure }}
          />
          <Text
            className="text-white text-sm font-semibold flex-1"
            numberOfLines={1}
          >
            {ride.pickup_address}
          </Text>
        </View>
        <View className="flex-row items-center">
          <View
            className="w-2 h-2 rounded-full mr-2.5"
            style={{ backgroundColor: MAP_PALETTE.arrival }}
          />
          <Text
            className="text-white text-sm font-semibold flex-1"
            numberOfLines={1}
          >
            {ride.dropoff_address}
          </Text>
        </View>

        <View className="flex-row items-center gap-3 mt-3">
          <Text className="text-slate-500 text-xs">
            {formatRideDistanceKm(distanceKm)}
          </Text>
          <Text className="text-slate-500 text-xs">
            {formatMinutesCompact(durationMin)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * What the list shows when it has no rows: still loading, failed, or genuinely empty.
 *
 * One component for the three because they are one slot in the layout, and splitting them is how
 * a screen ends up showing the empty state over a read that is still in flight.
 */
function HistoryPlaceholder({
  state,
  onRetry,
}: Readonly<{
  state: CompletedRidesFetch | null;
  onRetry: () => void;
}>) {
  const { t } = useTranslation();

  if (state === null) {
    return (
      <View className="flex-1 justify-center items-center py-16">
        <ActivityIndicator size="large" color={VE_BLUE.base} />
      </View>
    );
  }

  if (!state.ok) {
    return (
      <View className="flex-1 justify-center items-center py-16 px-4">
        <View className="w-16 h-16 rounded-full items-center justify-center border border-white/10 mb-5 bg-white/5">
          <FeatherGlyph name="alert-circle" size={28} />
        </View>
        <Text className="text-lg font-black text-white uppercase tracking-tight mb-2 text-center">
          {t("ridesScreen.errorTitle")}
        </Text>
        <Text className="text-center text-slate-400 text-sm font-medium leading-5 mb-6">
          {t("ridesScreen.errorBody")}
        </Text>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="px-6 py-3 rounded-xl border border-white/15 bg-white/5"
        >
          <Text className="text-white text-xs font-bold uppercase tracking-widest">
            {t("ridesScreen.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center items-center py-16 px-4">
      <View className="w-20 h-20 rounded-full items-center justify-center border border-white/10 mb-6 bg-white/5">
        <FeatherGlyph name="file-text" size={32} />
      </View>
      <Text className="text-xl font-black text-white uppercase tracking-tight mb-2 text-center">
        {t("ridesScreen.emptyTitle")}
      </Text>
      <Text className="text-center text-slate-400 text-sm font-medium leading-5">
        {t("ridesScreen.emptyBody")}
      </Text>
    </View>
  );
}
