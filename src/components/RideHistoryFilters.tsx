import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import { FeatherGlyph } from "./FeatherGlyph";
import { VE_BLUE } from "../lib/theme";
import {
  localDayBounds,
  localMonthBounds,
  localWeekBounds,
  type HistoryDateRange,
} from "../lib/utils/rideHistory";

export type HistoryFilterMode = "day" | "week" | "month";

export type HistoryFilterChange = Readonly<{
  range: HistoryDateRange;
  mode: HistoryFilterMode;
}>;

type RideHistoryFiltersProps = Readonly<{
  locale: string;
  range: HistoryDateRange;
  mode: HistoryFilterMode;
  onRangeChange: (next: HistoryFilterChange) => void;
}>;

const FILTER_SURFACE = {
  backgroundColor: "rgba(12, 12, 14, 0.35)",
  borderWidth: 1.5,
  borderColor: "rgba(255,255,255,0.10)",
} as const;

const MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

function stopPressPropagation(event: GestureResponderEvent) {
  event.stopPropagation();
}

function formatTriggerLabel(
  locale: string,
  mode: HistoryFilterMode,
  range: HistoryDateRange,
): string {
  if (mode === "month") {
    return range.start.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  }
  if (mode === "week") {
    const start = range.start.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    });
    const end = range.end.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${start} – ${end}`;
  }
  return range.start.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function monthName(locale: string, monthIndex: number): string {
  return new Date(2020, monthIndex, 1).toLocaleDateString(locale, {
    month: "long",
  });
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isDayInWeek(day: Date, week: HistoryDateRange): boolean {
  const t = day.getTime();
  return t >= week.start.getTime() && t <= week.end.getTime();
}

/**
 * Day / week / month filter for the Courses tab — weekly default like driver apps,
 * with server reads bounded on `updated_at`.
 */
export function RideHistoryFilters({
  locale,
  range,
  mode,
  onRangeChange,
}: RideHistoryFiltersProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const anchor = range.start;
  const [year, setYear] = useState(anchor.getFullYear());
  const [month, setMonth] = useState(anchor.getMonth());
  const [selectedDate, setSelectedDate] = useState(anchor);
  const [viewMode, setViewMode] = useState<HistoryFilterMode>(mode);

  const syncCalendar = (date: Date) => {
    setSelectedDate(date);
    setMonth(date.getMonth());
    setYear(date.getFullYear());
  };

  useEffect(() => {
    syncCalendar(range.start);
    setViewMode(mode);
  }, [range.start.getTime(), range.end.getTime(), mode]);

  const emit = useCallback(
    (nextMode: HistoryFilterMode, date: Date) => {
      let nextRange: HistoryDateRange;
      if (nextMode === "day") {
        nextRange = localDayBounds(date);
      } else if (nextMode === "week") {
        nextRange = localWeekBounds(date);
      } else {
        nextRange = localMonthBounds(date.getFullYear(), date.getMonth());
      }
      onRangeChange({ range: nextRange, mode: nextMode });
    },
    [onRangeChange],
  );

  const applyDay = (date: Date) => {
    syncCalendar(date);
    setViewMode("day");
    emit("day", date);
  };

  const applyWeek = (date: Date) => {
    const bounds = localWeekBounds(date);
    syncCalendar(bounds.start);
    setViewMode("week");
    onRangeChange({ range: bounds, mode: "week" });
  };

  const applyMonth = (monthIndex: number, yearValue: number) => {
    const date = new Date(yearValue, monthIndex, 1);
    syncCalendar(date);
    setViewMode("month");
    emit("month", date);
  };

  const handlePrev = () => {
    if (viewMode === "day") {
      const prev = new Date(selectedDate);
      prev.setDate(prev.getDate() - 1);
      applyDay(prev);
      return;
    }
    if (viewMode === "week") {
      const prev = new Date(range.start);
      prev.setDate(prev.getDate() - 7);
      applyWeek(prev);
      return;
    }
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    setYear(prevYear);
    setMonth(prevMonth);
    applyMonth(prevMonth, prevYear);
  };

  const handleNext = () => {
    if (viewMode === "day") {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + 1);
      applyDay(next);
      return;
    }
    if (viewMode === "week") {
      const next = new Date(range.start);
      next.setDate(next.getDate() + 7);
      applyWeek(next);
      return;
    }
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    setYear(nextYear);
    setMonth(nextMonth);
    applyMonth(nextMonth, nextYear);
  };

  const weekdayLabels = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 0].map((dow) =>
        new Date(2024, 0, dow === 0 ? 7 : dow).toLocaleDateString(locale, {
          weekday: "short",
        }),
      ),
    [locale],
  );

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const firstDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);
    return cells;
  }, [year, month]);

  const triggerLabel = formatTriggerLabel(locale, mode, range);
  const highlightWeek =
    viewMode === "week" ? localWeekBounds(selectedDate) : range;

  const showDayGrid = viewMode === "day" || viewMode === "week";

  return (
    <View
      className="rounded-xl px-2 py-2 mt-4"
      style={{
        ...FILTER_SURFACE,
        backgroundColor: "rgba(12, 12, 14, 0.25)",
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className="flex-row items-center rounded-lg px-3 py-3"
        style={FILTER_SURFACE}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ridesScreen.filterPrev")}
          onPress={(e) => {
            stopPressPropagation(e);
            handlePrev();
          }}
          hitSlop={8}
          className="pr-2 min-w-[24px] items-center"
        >
          <Text className="text-slate-400 text-lg font-bold">‹</Text>
        </Pressable>
        <FeatherGlyph name="calendar" size={16} color="#94a3b8" />
        <Text
          className="flex-1 text-white text-sm font-semibold mx-2"
          numberOfLines={2}
        >
          {triggerLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ridesScreen.filterNext")}
          onPress={(e) => {
            stopPressPropagation(e);
            handleNext();
          }}
          hitSlop={8}
          className="pl-2 min-w-[24px] items-center"
        >
          <Text className="text-slate-400 text-lg font-bold">›</Text>
        </Pressable>
      </Pressable>

      <Modal visible={open} transparent animationType="fade">
        <Pressable
          className="flex-1 justify-end bg-black/60"
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={stopPressPropagation}
            className="mx-4 mb-8 rounded-xl overflow-hidden p-3"
            style={{
              ...FILTER_SURFACE,
              backgroundColor: "rgba(12, 12, 14, 0.92)",
            }}
          >
            <View className="flex-row items-center justify-center mb-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ridesScreen.filterPrevYear")}
                onPress={() => {
                  const nextYear = year - 1;
                  setYear(nextYear);
                  if (viewMode === "month") {
                    applyMonth(month, nextYear);
                  } else if (viewMode === "week") {
                    const d = new Date(selectedDate);
                    d.setFullYear(nextYear);
                    applyWeek(d);
                  } else {
                    const d = new Date(selectedDate);
                    d.setFullYear(nextYear);
                    applyDay(d);
                  }
                }}
                className="p-2 min-w-[36px] items-center"
              >
                <Text className="text-slate-400 text-xl font-bold">‹</Text>
              </Pressable>
              <Text className="text-white font-semibold text-sm w-16 text-center">
                {year}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ridesScreen.filterNextYear")}
                onPress={() => {
                  const nextYear = year + 1;
                  setYear(nextYear);
                  if (viewMode === "month") {
                    applyMonth(month, nextYear);
                  } else if (viewMode === "week") {
                    const d = new Date(selectedDate);
                    d.setFullYear(nextYear);
                    applyWeek(d);
                  } else {
                    const d = new Date(selectedDate);
                    d.setFullYear(nextYear);
                    applyDay(d);
                  }
                }}
                className="p-2 min-w-[36px] items-center"
              >
                <Text className="text-slate-400 text-xl font-bold">›</Text>
              </Pressable>
            </View>

            <View className="flex-row justify-center gap-3 mb-2">
              {(["day", "week", "month"] as const).map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  onPress={() => {
                    setViewMode(m);
                    if (m === "week") applyWeek(selectedDate);
                    else emit(m, selectedDate);
                  }}
                >
                  <Text
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{
                      color: viewMode === m ? VE_BLUE.base : "#64748b",
                    }}
                  >
                    {t(
                      m === "day"
                        ? "ridesScreen.filterDay"
                        : m === "week"
                          ? "ridesScreen.filterWeek"
                          : "ridesScreen.filterMonth",
                    )}
                  </Text>
                </Pressable>
              ))}
            </View>

            {showDayGrid ? (
              <>
                <View className="flex-row mb-1 px-1">
                  {weekdayLabels.map((label) => (
                    <Text
                      key={label}
                      className="flex-1 text-center text-xs text-slate-500 font-semibold"
                    >
                      {label}
                    </Text>
                  ))}
                </View>
                <View className="flex-row flex-wrap px-1">
                  {calendarDays.map((day, index) => {
                    if (day === null) {
                      return (
                        <View
                          key={`empty-${index}`}
                          className="w-[14.28%] aspect-square"
                        />
                      );
                    }
                    const cellDate = new Date(year, month, day);
                    const isSelected =
                      viewMode === "day"
                        ? isSameLocalDay(cellDate, selectedDate)
                        : isDayInWeek(cellDate, highlightWeek);
                    return (
                      <Pressable
                        key={day}
                        accessibilityRole="button"
                        onPress={() => {
                          if (viewMode === "week") {
                            applyWeek(cellDate);
                          } else {
                            applyDay(cellDate);
                          }
                          setOpen(false);
                        }}
                        className="w-[14.28%] aspect-square items-center justify-center rounded-md"
                        style={
                          isSelected
                            ? { backgroundColor: "rgba(59, 130, 246, 0.25)" }
                            : undefined
                        }
                      >
                        <Text
                          className="text-sm font-semibold"
                          style={{
                            color: isSelected ? "#bfdbfe" : "#ffffff",
                          }}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <View className="flex-row flex-wrap gap-2 px-1 pb-1">
                {MONTH_INDEXES.map((idx) => {
                  const isSelected = month === idx;
                  const label = monthName(locale, idx);
                  return (
                    <Pressable
                      key={idx}
                      accessibilityRole="button"
                      onPress={() => {
                        applyMonth(idx, year);
                        setOpen(false);
                      }}
                      className="w-[30%] py-2 rounded-md items-center"
                      style={
                        isSelected
                          ? { backgroundColor: "rgba(59, 130, 246, 0.25)" }
                          : undefined
                      }
                    >
                      <Text
                        className="text-sm font-semibold capitalize"
                        style={{
                          color: isSelected ? "#bfdbfe" : "#ffffff",
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
