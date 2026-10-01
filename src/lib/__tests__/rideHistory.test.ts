// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require("fs") as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require("path") as { join: (...parts: string[]) => string };

const mockFrom = jest.fn();

jest.mock("../supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: jest.fn(),
    channel: jest.fn(),
    auth: { getUser: jest.fn() },
  },
}));

import {
  defaultHistoryFilterRange,
  formatHistoryFilterSummary,
  formatHistoryWhen,
  historyRangesEqual,
  isDefaultHistoryFilterRange,
  isSameLocalDay,
  isSingleLocalDayRange,
  localDayBounds,
  localMonthBounds,
  rideHistoryAmount,
  summarizeHistoryToday,
} from "../utils/rideHistory";
import type { Ride } from "../stores/driverStore";
import { rideService } from "../../services/rideService";
import fr from "../../i18n/locales/fr.json";
import en from "../../i18n/locales/en.json";
import es from "../../i18n/locales/es.json";

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const RIDES_SCREEN = "app/(tabs)/rides.tsx";

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

/**
 * A `t("key")` call as the screen spells it. Prettier owns the quote style in the source, so the
 * assertion has to tolerate either one or it breaks on the next format pass.
 */
function translationOf(key: string): RegExp {
  return new RegExp(`t\\(["']${key.replace(/\./g, "\\.")}["']\\)`);
}

/** Source with its comments removed: the prose names things the code no longer does. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:'"])\/\/.*$/gm, "$1");
}

function completedRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: "ride-1",
    user_id: "client-1",
    status: "completed",
    pickup_address: "1 Rue de Rivoli, Paris",
    pickup_lat: 0,
    pickup_lon: 0,
    dropoff_address: "CDG Terminal 2",
    dropoff_lat: 0,
    dropoff_lon: 0,
    pickup_time: "2026-09-30T08:00:00Z",
    distance: 12,
    duration: 25,
    vehicle_type: "STANDARD",
    estimated_price: 42.5,
    final_price: 45,
    created_at: "2026-09-30T07:40:00Z",
    updated_at: "2026-09-30T08:30:00Z",
    ...overrides,
  };
}

describe("what a completed ride paid", () => {
  it("prefers the settled amount to either spelling of the quote", () => {
    expect(
      rideHistoryAmount({ final_price: 45, estimated_price: 42.5, price: 40 }),
    ).toBe(45);
    expect(
      rideHistoryAmount({
        final_price: null,
        estimated_price: 42.5,
        price: 40,
      }),
    ).toBe(42.5);
    expect(
      rideHistoryAmount({
        final_price: null,
        estimated_price: null,
        price: 40,
      }),
    ).toBe(40);
  });

  it("says unknown rather than zero when the server never priced the ride", () => {
    // Adding it to a day's takings as zero would under-report the day in silence, which is the
    // one failure nobody would think to check.
    expect(
      rideHistoryAmount({
        final_price: null,
        estimated_price: null,
        price: undefined,
      }),
    ).toBeNull();
  });

  it("reads a settled amount of zero as a number, not as a missing price", () => {
    expect(
      rideHistoryAmount({
        final_price: 0,
        estimated_price: 12,
        price: undefined,
      }),
    ).toBe(0);
  });
});

/**
 * A wall-clock moment in the *device's* timezone.
 *
 * The day is decided on local calendar fields, so a test written in UTC would pass in London and
 * fail in Paris — the two are one hour apart, and one hour is enough to move an evening ride
 * across midnight.
 */
function at(month: number, day: number, hour: number, minute = 0): Date {
  return new Date(2026, month - 1, day, hour, minute, 0, 0);
}

describe("today's totals, from the rows the server sent", () => {
  const now = at(9, 30, 20, 0);

  it("keeps only the rides closed on the device\u2019s own day", () => {
    expect(isSameLocalDay(at(9, 30, 8, 30).toISOString(), now)).toBe(true);
    expect(isSameLocalDay(at(9, 29, 23, 0).toISOString(), now)).toBe(false);
    expect(isSameLocalDay(at(10, 1, 0, 30).toISOString(), now)).toBe(false);
    expect(isSameLocalDay(null, now)).toBe(false);
    expect(isSameLocalDay("not a date", now)).toBe(false);
  });

  it("sums the day and ignores the rest of the history", () => {
    const rides = [
      completedRide({
        id: "a",
        final_price: 45,
        updated_at: at(9, 30, 8, 30).toISOString(),
      }),
      completedRide({
        id: "b",
        final_price: 30,
        updated_at: at(9, 30, 12, 0).toISOString(),
      }),
      completedRide({
        id: "c",
        final_price: 99,
        updated_at: at(9, 28, 12, 0).toISOString(),
      }),
    ];
    expect(summarizeHistoryToday(rides, now)).toEqual({
      rides: 2,
      earnings: 75,
    });
  });

  it("counts an unpriced ride as a ride, and adds nothing to the day", () => {
    const rides = [
      completedRide({
        final_price: null,
        estimated_price: null,
        price: undefined,
      }),
    ];
    expect(summarizeHistoryToday(rides, now)).toEqual({
      rides: 1,
      earnings: 0,
    });
  });

  it("is the counter that rolls over, unlike the store\u2019s", () => {
    // `stats.todayRides` / `stats.todayEarnings` persist in AsyncStorage and are never reset, so
    // a driver who leaves the app open overnight reads two days as one. Rows cannot do that.
    const yesterdayOnly = [
      completedRide({
        updated_at: at(9, 29, 9, 0).toISOString(),
        final_price: 45,
      }),
    ];
    expect(summarizeHistoryToday(yesterdayOnly, now)).toEqual({
      rides: 0,
      earnings: 0,
    });
  });
});

describe("server date filter bounds", () => {
  it("covers a full local day", () => {
    const day = at(3, 15, 12, 0);
    const { start, end } = localDayBounds(day);
    expect(start).toEqual(new Date(2026, 2, 15, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 2, 15, 23, 59, 59, 999));
  });

  it("covers a full local month including leap-year February", () => {
    const feb = localMonthBounds(2024, 1);
    expect(feb.start).toEqual(new Date(2024, 1, 1));
    expect(feb.end).toEqual(new Date(2024, 1, 29, 23, 59, 59, 999));

    const dec = localMonthBounds(2026, 11);
    expect(dec.start).toEqual(new Date(2026, 11, 1));
    expect(dec.end).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });

  it("defaults to the current calendar month", () => {
    const now = at(10, 1, 14, 30);
    const range = defaultHistoryFilterRange(now);
    expect(range).toEqual(localMonthBounds(2026, 9));
    expect(isDefaultHistoryFilterRange(range, now)).toBe(true);
    expect(isDefaultHistoryFilterRange(localMonthBounds(2026, 8), now)).toBe(
      false,
    );
  });

  it("detects a single-day range", () => {
    expect(isSingleLocalDayRange(localDayBounds(at(6, 1, 0)))).toBe(true);
    expect(isSingleLocalDayRange(localMonthBounds(2026, 5))).toBe(false);
  });

  it("compares ranges by instant", () => {
    const a = localDayBounds(at(1, 1, 0));
    const b = localDayBounds(at(1, 1, 12));
    expect(historyRangesEqual(a, b)).toBe(true);
    expect(historyRangesEqual(a, localDayBounds(at(1, 2, 0)))).toBe(false);
  });

  it("formats the period for filter summary copy", () => {
    const day = localDayBounds(at(9, 30, 8, 0));
    expect(formatHistoryFilterSummary(day, "fr", "day")).toMatch(/30/);
    const month = localMonthBounds(2026, 8);
    expect(formatHistoryFilterSummary(month, "fr", "month")).toMatch(/2026/);
  });
});

describe("the timestamp a history row shows", () => {
  it("names the day and the clock time in the driver\u2019s locale", () => {
    // `formatPickupDateTime` beside it is French-only and says « Aujourd'hui »; reusing it would
    // print French in the English and Spanish builds.
    const fr = formatHistoryWhen("2026-09-30T08:30:00Z", "fr");
    const en = formatHistoryWhen("2026-09-30T08:30:00Z", "en");
    expect(fr).toMatch(/30/);
    expect(fr).toContain("·");
    expect(en).not.toBe(fr);
  });

  it("has nothing to show without a usable timestamp", () => {
    expect(formatHistoryWhen(null, "fr")).toBeNull();
    expect(formatHistoryWhen("", "fr")).toBeNull();
    expect(formatHistoryWhen("not a date", "fr")).toBeNull();
  });
});

describe("rideService.fetchCompletedRides", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  /** The PostgREST chain the read is expected to build, as one set of spies. */
  function mockQuery(result: { data: unknown; error: unknown }) {
    const limit = jest.fn().mockResolvedValue(result);
    const order = jest.fn(() => ({ limit }));
    const lte = jest.fn(() => ({ order }));
    const gte = jest.fn(() => ({ lte, order }));
    const eq = jest.fn(() => ({ gte, lte, order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });
    return { select, eq, gte, lte, order, limit };
  }

  it("asks for the driver\u2019s completed rides, newest first", async () => {
    const { select, eq, order, limit, gte, lte } = mockQuery({
      data: [],
      error: null,
    });

    await rideService.fetchCompletedRides();

    expect(mockFrom).toHaveBeenCalledWith("rides");
    expect(eq).toHaveBeenCalledWith("status", "completed");
    expect(gte).not.toHaveBeenCalled();
    expect(lte).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(50);
    // Tenancy is the RLS policy, not a filter: a `driver_id` term here would be a second place
    // where "whose rides are these" gets answered.
    expect(eq).not.toHaveBeenCalledWith("driver_id", expect.anything());
    expect(select).toHaveBeenCalledWith(expect.stringContaining("final_price"));
    // And no coordinates: `resolveRideTripMetrics` re-derives the distance from the geometry when
    // the stored figure looks wrong, and a half-geocoded row would hand it a line across the globe.
    expect(select).toHaveBeenCalledWith(
      expect.not.stringContaining("pickup_lat"),
    );
  });

  it("bounds the read on updated_at when a range is passed", async () => {
    const { gte, lte } = mockQuery({ data: [], error: null });
    const start = new Date(2026, 8, 1, 0, 0, 0, 0);
    const end = new Date(2026, 8, 30, 23, 59, 59, 999);

    await rideService.fetchCompletedRides({ start, end });

    expect(gte).toHaveBeenCalledWith("updated_at", start.toISOString());
    expect(lte).toHaveBeenCalledWith("updated_at", end.toISOString());
  });

  it("maps rows to the app shape", async () => {
    mockQuery({ data: [completedRide()], error: null });

    const result = await rideService.fetchCompletedRides();

    expect(result).toMatchObject({
      ok: true,
      rides: [{ id: "ride-1", final_price: 45, offerUnconfirmed: false }],
    });
  });

  it("an empty history is a success, not a failure", async () => {
    mockQuery({ data: null, error: null });
    expect(await rideService.fetchCompletedRides()).toEqual({
      ok: true,
      rides: [],
    });
  });

  it("separates a failed read from an empty one", async () => {
    // The screen shows the empty state for one and a retry for the other; collapsing them renders
    // "no completed rides" over a read that never happened.
    mockQuery({ data: null, error: { message: "Network request failed" } });
    expect(await rideService.fetchCompletedRides()).toEqual({
      ok: false,
      reason: "network",
    });

    mockQuery({ data: null, error: { message: "permission denied" } });
    expect(await rideService.fetchCompletedRides()).toEqual({
      ok: false,
      reason: "server",
    });
  });
});

describe("the Courses tab", () => {
  const screen = stripComments(readSource(RIDES_SCREEN));

  it("reads from the server instead of mirroring the trip", () => {
    // The tab used to render the active ride's controls and an empty state pointing at the map,
    // both of which already exist on the Home screen.
    expect(screen).toContain("rideService.fetchCompletedRides(");
    expect(screen).toContain("RideHistoryFilters");
    expect(screen).not.toContain("ActiveTripSheet");
    expect(screen).not.toContain("useActiveTripActions");
    expect(screen).not.toContain("useDriverStore");
  });

  it("reloads when the tab is focused, so a ride just ended is on the list", () => {
    expect(screen).toContain("useFocusEffect");
  });

  it("can be pulled to refresh", () => {
    expect(screen).toContain("RefreshControl");
    expect(screen).toContain("onRefresh={onRefresh}");
  });

  it("shows a spinner, a retry, or the empty state — never two of them", () => {
    expect(screen).toContain("ListEmptyComponent");
    expect(screen).toMatch(translationOf("ridesScreen.errorTitle"));
    expect(screen).toMatch(translationOf("ridesScreen.retry"));
    expect(screen).toMatch(translationOf("ridesScreen.emptyTitle"));
    expect(screen).toContain("state === null");
  });

  it("derives the day\u2019s totals instead of reading the store\u2019s counters", () => {
    expect(screen).toContain("summarizeHistoryToday(");
    expect(screen).not.toContain("stats.todayRides");
    expect(screen).not.toContain("stats.todayEarnings");
  });

  it("keeps the gradient glyph and the ring it must not grow back", () => {
    // `featherGlyph.test.ts` owns the vendored-glyph set; this only pins that the history screen
    // stayed in the family it was in.
    expect(screen).toContain("<FeatherGlyph");
    expect(screen).not.toContain("AccentRing");
    expect(screen).not.toContain("ACCENT_RING");
  });

  it("draws the route with the map\u2019s own two colours", () => {
    // The dots beside the addresses are the departure and arrival markers, so a driver reads the
    // row the same way they read the map.
    expect(screen).toContain("MAP_PALETTE.departure");
    expect(screen).toContain("MAP_PALETTE.arrival");
  });
});

const LOCALES: Array<[string, Record<string, unknown>]> = [
  ["fr", fr as Record<string, unknown>],
  ["en", en as Record<string, unknown>],
  ["es", es as Record<string, unknown>],
];

function resolveKey(locale: Record<string, unknown>, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      locale,
    );
}

/** The keys the screen reads. Every one has to exist, and none of them may be blank. */
const RIDES_SCREEN_KEYS = [
  "title",
  "subtitle",
  "emptyTitle",
  "emptyBody",
  "emptyFilteredTitle",
  "emptyFilteredBody",
  "errorTitle",
  "errorBody",
  "retry",
  "todaySummary",
  "rides",
  "earned",
  "filterDay",
  "filterMonth",
  "filterPrev",
  "filterNext",
  "filterPrevYear",
  "filterNextYear",
  "clearFilters",
  "filterSummary",
  "limitReached",
];

describe("the history tab copy, in the three languages", () => {
  it("translates every key the screen asks for", () => {
    for (const [name, locale] of LOCALES) {
      for (const key of RIDES_SCREEN_KEYS) {
        expect({
          key: `${name}:ridesScreen.${key}`,
          value: resolveKey(locale, `ridesScreen.${key}`),
        }).toEqual({
          key: `${name}:ridesScreen.${key}`,
          value: expect.stringMatching(/\S/),
        });
      }
    }
  });

  it("has no leftover copy for the active trip the tab no longer shows", () => {
    // Retired with the screen: a stale "no active rides" telling the driver to go online is a
    // sentence about a screen that no longer exists.
    for (const [name, locale] of LOCALES) {
      const ridesScreen = resolveKey(locale, "ridesScreen") as Record<
        string,
        unknown
      >;
      expect({ locale: name, keys: Object.keys(ridesScreen).sort() }).toEqual({
        locale: name,
        keys: [...RIDES_SCREEN_KEYS].sort(),
      });
    }
  });
});
