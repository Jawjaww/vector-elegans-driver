import { OFFER_STACK_VISIBLE_MAX } from './offerCarousel';

/** Bottomsheet deferred queue — soft-refused + overflow from stack. */
export const DEFERRED_SHEET_MAX = 12;

export type OfferQueueCaps = {
  stackMax?: number;
  sheetMax?: number;
};

/**
 * Split offerable pending rides into overlay stack + bottomsheet sheet.
 * Caller filters offerable / suppressed before calling.
 */
export function partitionOfferQueue<T>(
  pending: T[],
  caps: OfferQueueCaps = {},
): { stack: T[]; sheet: T[] } {
  const stackMax = caps.stackMax ?? OFFER_STACK_VISIBLE_MAX;
  const sheetMax = caps.sheetMax ?? DEFERRED_SHEET_MAX;
  const safeStack = Math.max(0, stackMax);
  const safeSheet = Math.max(0, sheetMax);
  return {
    stack: pending.slice(0, safeStack),
    sheet: pending.slice(safeStack, safeStack + safeSheet),
  };
}

/** Append items (dedupe by id), then FIFO-truncate from the front to `max`. */
export function appendCappedById<T extends { id: string }>(
  list: T[],
  items: T[],
  max: number,
): T[] {
  if (max <= 0) return [];
  const seen = new Set(list.map((r) => r.id));
  const next = [...list];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  if (next.length <= max) return next;
  return next.slice(next.length - max);
}

/**
 * After promote-to-front: if stack exceeds max, push surplus (from the back)
 * onto deferred with sheet cap.
 */
export function trimStackOverflowToDeferred<T extends { id: string }>(args: {
  availableRides: T[];
  deferredRides: T[];
  stackMax?: number;
  sheetMax?: number;
}): { availableRides: T[]; deferredRides: T[] } {
  const stackMax = args.stackMax ?? OFFER_STACK_VISIBLE_MAX;
  const sheetMax = args.sheetMax ?? DEFERRED_SHEET_MAX;
  if (args.availableRides.length <= stackMax) {
    return {
      availableRides: args.availableRides,
      deferredRides: args.deferredRides,
    };
  }
  const availableRides = args.availableRides.slice(0, stackMax);
  const overflow = args.availableRides.slice(stackMax);
  const deferredRides = appendCappedById(
    args.deferredRides,
    overflow,
    sheetMax,
  );
  return { availableRides, deferredRides };
}

/** Move overlay front to the back of the stack. No-op if fewer than 2 rides. */
export function cycleOfferStackFrontToBack<T>(rides: T[]): T[] {
  if (rides.length < 2) return rides;
  const [front, ...rest] = rides;
  return [...rest, front];
}
