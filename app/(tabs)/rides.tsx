import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { FeatherGlyph } from "../../src/components/FeatherGlyph";
import { formatWeekRange } from "../../src/lib/utils/weekLabel";
import {
  currentWeekEntry,
  toWeekIndex,
  weekEntryFor,
  type WeekIndexEntry,
} from "../../src/lib/utils/weekIndex";
import {
  RideHistoryFilters,
  type HistoryFilterChange,
  type HistoryFilterMode,
} from "../../src/components/RideHistoryFilters";
import { MAP_PALETTE } from "../../src/lib/mapPalette";
import { VE_BLUE } from "../../src/lib/theme";
import type { Ride } from "../../src/lib/stores/driverStore";
import {
  defaultHistoryFilterRange,
  localDayBounds,
  localMonthBounds,
  localWeekBounds,
  formatHistoryFilterSummary,
  isDefaultHistoryFilterRange,
  formatHistoryWhen,
  rideHistoryAmount,
  summarizeHistoryToday,
  type HistoryDateRange,
} from "../../src/lib/utils/rideHistory";
import {
  formatMinutesCompact,
  formatRideDistanceKm,
  resolveRideTripMetrics,
} from "../../src/lib/utils/rideMetrics";
import {
  rideService,
  COMPLETED_RIDES_PAGE_SIZE,
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
 * **Nothing here is cancellable mid-flight**, and that is deliberate: each read is one PostgREST
 * page (10 rows) plus an exact count for the filtered period, and a focus arriving while the
 * previous read is in flight simply issues another.
 */
/**
 * « Cette semaine » pour la semaine en cours, sinon les dates. Un libelle court, parce que le
 * bandeau defile horizontalement : « semaine du 14 septembre » y prendrait toute la largeur.
 */
function weekShortLabel(week: WeekIndexEntry): string {
  if (weekEntryFor([week], new Date())?.startsOn === week.startsOn) {
    return "Cette semaine";
  }

  const [, month, day] = week.startsOn.split("-");
  const [, endMonth, endDay] = (week.endsOn || "").split("-");
  return `${day}/${month} – ${endDay ?? "?"}/${endMonth ?? "?"}`;
}

export default function RidesScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [filterRange, setFilterRange] = useState<HistoryDateRange>(() =>
    defaultHistoryFilterRange(),
  );
  const [filterMode, setFilterMode] = useState<HistoryFilterMode>("week");
  const [page, setPage] = useState(0);
  // Le lien depuis les Gains arrive avec une intention de filtre : on l'applique au lieu d'ouvrir
  // l'historique sur une plage que le chauffeur n'a pas demandee. Le défaut reste la semaine.
  const params = useLocalSearchParams<{ mode?: string }>();

  useEffect(() => {
    const wanted = params.mode;
    if (wanted !== "day" && wanted !== "week" && wanted !== "month") return;

    const now = new Date();
    setFilterMode((current) => (current === wanted ? current : wanted));
    setFilterRange(
      wanted === "day"
        ? localDayBounds(now)
        : wanted === "month"
          ? localMonthBounds(now.getFullYear(), now.getMonth())
          : localWeekBounds(now),
    );
    setPage(0);
  }, [params.mode]);
  /**
   * `null` is "not answered yet", which is not the same as "no rides": the first is a spinner and
   * the second is the empty state, and the service returns a discriminated result for exactly
   * this reason (`CompletedRidesFetch`).
   */
  const [state, setState] = useState<CompletedRidesFetch | null>(null);
  // L'index des semaines : UNE requete agregee, aucune course. Le detail reste la requete paginee,
  // declenchee seulement quand une semaine est choisie.
  const [weekIndex, setWeekIndex] = useState<WeekIndexEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const filterRangeRef = useRef(filterRange);
  filterRangeRef.current = filterRange;
  const pageRef = useRef(page);
  pageRef.current = page;

  const load = useCallback(
    async (range?: HistoryDateRange, nextPage?: number) => {
      const activeRange = range ?? filterRangeRef.current;
      const activePage = nextPage ?? pageRef.current;
      setState(
        await rideService.fetchCompletedRides(activeRange, activePage),
      );
    },
    [],
  );

  // On focus rather than on mount: ending a ride is done on the map, and the tab stays mounted
  // between visits — a mount-only read would show the ride before last.
  const loadWeekIndex = useCallback(async () => {
    try {
      const payload = await rideService.fetchWeekIndex(8);
      setWeekIndex(toWeekIndex(payload));
    } catch {
      // Un index illisible n'empeche pas la liste de s'afficher : on ne montre pas le tableau de
      // bord, plutot que de bloquer l'ecran sur une donnee secondaire.
      setWeekIndex(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWeekIndex();
    }, [loadWeekIndex]),
  );

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

  const onFilterChange = useCallback(
    ({ range, mode }: HistoryFilterChange) => {
      setFilterRange(range);
      setFilterMode(mode);
      setPage(0);
      pageRef.current = 0;
      void load(range, 0);
    },
    [load],
  );

  const resetFilters = useCallback(() => {
    const next = defaultHistoryFilterRange();
    setFilterRange(next);
    setFilterMode("week");
    setPage(0);
    pageRef.current = 0;
    void load(next, 0);
  }, [load]);

  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
      pageRef.current = nextPage;
      void load(undefined, nextPage);
    },
    [load],
  );

  const rides = state?.ok ? state.rides : NO_RIDES;
  const today = useMemo(
    () => summarizeHistoryToday(rides, new Date()),
    [rides],
  );

  const showFilteredEmpty = Boolean(
    state?.ok &&
      rides.length === 0 &&
      !isDefaultHistoryFilterRange(filterRange),
  );

  const filterPeriod = formatHistoryFilterSummary(
    filterRange,
    i18n.language,
    filterMode,
  );

  const totalCount = state?.ok ? state.totalCount : 0;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / COMPLETED_RIDES_PAGE_SIZE),
  );
  const pageFrom =
    totalCount === 0 ? 0 : page * COMPLETED_RIDES_PAGE_SIZE + 1;
  const pageTo =
    totalCount === 0
      ? 0
      : Math.min(totalCount, (page + 1) * COMPLETED_RIDES_PAGE_SIZE);

  const listFooter =
    state?.ok ? (
      <View className="mb-4">
        {totalPages > 1 ? (
          <View
            className="mt-2 flex-row items-center justify-between rounded-xl px-3 py-3"
            style={{
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.08)",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("ridesScreen.paginationPrev")}
              disabled={page <= 0}
              onPress={() => goToPage(page - 1)}
              className="px-3 py-2 rounded-lg"
              style={{ opacity: page <= 0 ? 0.35 : 1 }}
            >
              <Text className="text-white text-xs font-bold uppercase">
                {t("ridesScreen.paginationPrev")}
              </Text>
            </Pressable>
            <Text className="text-slate-300 text-xs font-semibold text-center flex-1 mx-2">
              {t("ridesScreen.paginationPage", {
                from: pageFrom,
                to: pageTo,
                total: totalCount,
                page: page + 1,
                pages: totalPages,
              })}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("ridesScreen.paginationNext")}
              disabled={page >= totalPages - 1}
              onPress={() => goToPage(page + 1)}
              className="px-3 py-2 rounded-lg"
              style={{ opacity: page >= totalPages - 1 ? 0.35 : 1 }}
            >
              <Text className="text-white text-xs font-bold uppercase">
                {t("ridesScreen.paginationNext")}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {totalCount > 0 ? (
          <View
            className="mt-2 flex-row items-center justify-between rounded-xl px-3 py-2"
            style={{
              borderWidth: 1,
              borderColor: "rgba(59, 130, 246, 0.1)",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
            }}
          >
            <Text className="text-slate-300 text-sm flex-1 mr-2">
              {t("ridesScreen.filterSummary", {
                count: totalCount,
                period: filterPeriod,
              })}
            </Text>
            {!isDefaultHistoryFilterRange(filterRange) ? (
              <Pressable
                accessibilityRole="button"
                onPress={resetFilters}
                className="px-2 py-1"
              >
                <Text className="text-blue-300 text-xs font-bold uppercase">
                  {t("ridesScreen.clearFilters")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    ) : null;

  const selectedWeek = weekEntryFor(weekIndex ?? [], filterRange.start);

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
            {/* Le recap de la semaine affichee suit la plage DEJA selectionnee : il ne coute
                aucune requete supplementaire. Le bandeau, lui, vient de l'index (une requete). */}
            {selectedWeek ? (
              <View
                className="rounded-2xl p-4 mb-4"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  borderWidth: 1,
                  borderColor: "rgba(255, 255, 255, 0.05)",
                }}
              >
                <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                  {t("ridesScreen.weekNet")}
                </Text>
                <Text className="text-white text-3xl font-black tracking-tighter mt-1">
                  €{selectedWeek.netEarnings.toFixed(2)}
                </Text>
                <View className="flex-row mt-2">
                  <Text className="text-slate-400 text-xs mr-4">
                    {t("ridesScreen.weekRides", { count: selectedWeek.rides })}
                  </Text>
                  {selectedWeek.cashCollected > 0 ? (
                    <Text className="text-emerald-400/80 text-xs mr-4">
                      {t("ridesScreen.weekCash")} €{selectedWeek.cashCollected.toFixed(2)}
                    </Text>
                  ) : null}
                  {selectedWeek.cardDue > 0 ? (
                    <Text className="text-sky-400/80 text-xs">
                      {t("ridesScreen.weekCard")} €{selectedWeek.cardDue.toFixed(2)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/*
              Une PHRASE, pas des cartes qui glissent. Retour du propriétaire : « c'est de la
              merde [...] j'aurais préféré qu'il y ait marqué plus clairement semaine du 5 au 11
              octobre 2026 [...] mettre le mot *semaine* pour tout de suite comprendre ». Les
              flèches de RideHistoryFilters restent le moyen de changer de semaine : elles sont
              déjà là, et elles ne coûtent aucune carte imbriquée de plus.
            */}
            {selectedWeek ? (
              <Text className="text-white text-base font-black mb-3">
                {t("ridesScreen.weekOf", {
                  ...formatWeekRange(selectedWeek.startsOn, selectedWeek.endsOn, i18n.language),
                })}
              </Text>
            ) : null}

            <RideHistoryFilters
              locale={i18n.language}
              range={filterRange}
              mode={filterMode}
              onRangeChange={onFilterChange}
            />
            {state?.ok && today.rides > 0 ? (
              <TodaySummary rides={today.rides} earnings={today.earnings} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <RideHistoryRow ride={item} locale={i18n.language} />
        )}
        ListEmptyComponent={
          <HistoryPlaceholder
            state={state}
            onRetry={() => void load()}
            showFilteredEmpty={showFilteredEmpty}
            onClearFilters={resetFilters}
          />
        }
        ListFooterComponent={listFooter}
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
  const { t } = useTranslation();
  const router = useRouter();
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

        {/* F-02 : la facture ou le reçu de la course, sur place. */}
        <Pressable
          onPress={() =>
            router.push({ pathname: '/ride-document', params: { rideId: ride.id } })
          }
          accessibilityRole="button"
          className="self-start mb-3"
        >
          <Text className="text-slate-400 text-xs font-bold">
            {t('rideDocuments.open')} ›
          </Text>
        </Pressable>

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
  showFilteredEmpty,
  onClearFilters,
}: Readonly<{
  state: CompletedRidesFetch | null;
  onRetry: () => void;
  showFilteredEmpty: boolean;
  onClearFilters: () => void;
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

  if (showFilteredEmpty) {
    return (
      <View className="flex-1 justify-center items-center py-16 px-4">
        <View className="w-20 h-20 rounded-full items-center justify-center border border-white/10 mb-6 bg-white/5">
          <FeatherGlyph name="calendar" size={32} />
        </View>
        <Text className="text-xl font-black text-white uppercase tracking-tight mb-2 text-center">
          {t("ridesScreen.emptyFilteredTitle")}
        </Text>
        <Text className="text-center text-slate-400 text-sm font-medium leading-5 mb-6">
          {t("ridesScreen.emptyFilteredBody")}
        </Text>
        <Pressable
          onPress={onClearFilters}
          accessibilityRole="button"
          className="px-6 py-3 rounded-xl border border-white/15 bg-white/5"
        >
          <Text className="text-white text-xs font-bold uppercase tracking-widest">
            {t("ridesScreen.clearFilters")}
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
