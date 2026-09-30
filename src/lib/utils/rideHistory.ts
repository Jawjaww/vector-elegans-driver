import type { Ride } from "../stores/driverStore";

/**
 * The completed-ride history, as the Courses tab reads it.
 *
 * Pure, and separate from the screen for the reason `rideMetrics` is: which rows count as today
 * and what a ride is worth are decisions worth a unit test, and a `.tsx` screen that pulls in
 * `react-native` is not a place a test can reach cheaply.
 */

/** The price columns a completed ride may carry, newest spelling first. */
export type RidePriced = Pick<
  Ride,
  "final_price" | "estimated_price" | "price"
>;

/**
 * What the ride paid the driver, or `null` when the server never priced it.
 *
 * `final_price` first — the settled amount — then the two spellings of the quote older rows
 * carry. Explicitly not `?? 0`: a ride with no price at all has to read as unknown, and adding
 * it to a day's total as zero would quietly under-report the day.
 */
export function rideHistoryAmount(ride: RidePriced): number | null {
  for (const value of [ride.final_price, ride.estimated_price, ride.price]) {
    if (value == null) continue;
    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }
  return null;
}

/** Whether a timestamp falls on the same calendar day as `now`, in the device's own timezone. */
export function isSameLocalDay(
  iso: string | null | undefined,
  now: Date,
): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Today's ride count and takings, from the history the server returned.
 *
 * Derived from the loaded rows rather than from the store's `stats.todayRides` /
 * `stats.todayEarnings`: those are persisted in AsyncStorage and incremented on completion, with
 * nothing that resets them at midnight, so "today" stays true for as long as the phone is not
 * left overnight. The rows the server sends are the only counters that roll over on their own.
 *
 * A row the server never priced counts as a ride and adds nothing, which is the honest reading:
 * the ride happened, and what it paid is unknown rather than zero.
 */
export function summarizeHistoryToday(
  rides: readonly Ride[],
  now: Date,
): { rides: number; earnings: number } {
  let ridesToday = 0;
  let earnings = 0;
  for (const ride of rides) {
    if (!isSameLocalDay(ride.updated_at, now)) continue;
    ridesToday += 1;
    earnings += rideHistoryAmount(ride) ?? 0;
  }
  return { rides: ridesToday, earnings };
}

/**
 * The day and the clock time a completed ride was closed, in the driver's own locale.
 *
 * `formatPickupDateTime` beside it cannot be reused: it speaks French only and says
 * « Aujourd'hui », which would print in English and Spanish too. This one adds no vocabulary of
 * its own and lets the platform name the day, so it reads correctly in all three locales.
 */
export function formatHistoryWhen(
  iso: string | null | undefined,
  locale: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}
