import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { gpsMovedEnough } from '../utils/gpsThrottle';
import { isRideStillOfferable } from '../utils/ridePickup';
import { OFFER_STACK_VISIBLE_MAX } from '../utils/offerCarousel';
import {
  appendCappedById,
  cycleOfferStackFrontToBack,
  DEFERRED_SHEET_MAX,
  trimStackOverflowToDeferred,
} from '../utils/offerQueue';

export interface Ride {
  id: string;
  user_id: string;
  driver_id?: string;
  status: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lon: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lon: number;
  pickup_time: string;
  distance: number | null;
  duration: number | null;
  vehicle_type: string;
  options?: string[];
  estimated_price: number | null;
  final_price: number | null;
  created_at: string;
  updated_at: string;
  price?: number;
  pickup_notes?: string;
  driver_arrived_at?: string | null;
  accepted_at?: string | null;
  client_incentive?: number | null;
  matching_deadline_at?: string | null;
  matching_paused_at?: string | null;
}

export interface DriverStats {
  todayEarnings: number;
  todayRides: number;
  onlineTimeMinutes: number;
  rating: number;
}

export interface Location {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

export type OfferGateState = {
  suppressedRideIds: string[];
  deferredRides: Ride[];
  availableRides: Ride[];
  /** Soft-refused this session — overlay must not re-present. */
  declinedOfferIds?: string[];
};

/** Action chosen from the notification's Accept / Decline buttons. */
export type OfferNotificationAction = 'accept' | 'decline';

/**
 * A ride opened from a ride_offer notification, plus the action the driver
 * picked in the tray (if any). Held as one value so the ride and its action can
 * never be claimed by two different readers.
 */
export type PendingOfferOpen = {
  rideId: string;
  action: OfferNotificationAction | null;
};

/**
 * Contents the driver can act on straight from the notification payload, before the server
 * has been asked anything.
 *
 * Kept deliberately *outside* `availableRides`: a provisional entry has no coordinates and no
 * offer status, so `isRideStillOfferable`, `canPresentRideOffer` and `pruneUnofferableRides`
 * would all reject it. Mixing it in would create a phantom ride to clean up everywhere; as a
 * separate slice it can only ever be read by the card that renders it.
 */
export type ProvisionalOffer = {
  rideId: string;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  priceLabel: string | null;
};

/**
 * When a ride_offer notification was tapped, or null if none was this session.
 *
 * A timestamp rather than a boolean on purpose. "Do not animate this arrival" has to hold
 * across a dashboard remount (the offer paints during the boot, then the real tree mounts),
 * and a flag would have to be cleared by whichever component happened to know the handover
 * was over — coordination that breaks silently. A short window expires on its own.
 */
export type OfferArrivalAt = number | null;

/**
 * Which path produced the arrival: a tap on the tray entry, or the silent wake.
 *
 * Recorded beside `offerArrivalAt` rather than derived later, because nothing downstream can
 * still tell them apart: both end in the same queued open. The distinction decides the ring —
 * the wake deliberately draws no notification, so the system plays nothing and the app is the
 * only thing that can make a sound, whereas a tap already played the `rides` channel and
 * ringing on top of it would be a second sound for one offer.
 */
export type OfferArrivalSource = 'wake' | 'tap';

/** Pure helper — used by presentOffer + Jest */
export function canPresentRideOffer(
  rideId: string,
  state: OfferGateState,
): boolean {
  if (state.suppressedRideIds.includes(rideId)) return false;
  if (state.declinedOfferIds?.includes(rideId)) return false;
  if (state.deferredRides.some((r) => r.id === rideId)) return false;
  if (state.availableRides.some((r) => r.id === rideId)) return false;
  return true;
}

export function pickNextPendingRide(
  pending: Ride[],
  state: OfferGateState,
): Ride | null {
  return (
    pending.find(
      (ride) =>
        isRideStillOfferable(ride) &&
        canPresentRideOffer(ride.id, state),
    ) ?? null
  );
}

/** Merge live DB fields (price, addresses, pickup time, matching window) into a tracked ride. */
export function mergeRideSnapshot(existing: Ride, incoming: Ride): Ride {
  return {
    ...existing,
    status: incoming.status ?? existing.status,
    pickup_address: incoming.pickup_address ?? existing.pickup_address,
    pickup_lat: incoming.pickup_lat ?? existing.pickup_lat,
    pickup_lon: incoming.pickup_lon ?? existing.pickup_lon,
    dropoff_address: incoming.dropoff_address ?? existing.dropoff_address,
    dropoff_lat: incoming.dropoff_lat ?? existing.dropoff_lat,
    dropoff_lon: incoming.dropoff_lon ?? existing.dropoff_lon,
    pickup_time: incoming.pickup_time ?? existing.pickup_time,
    distance: incoming.distance ?? existing.distance,
    duration: incoming.duration ?? existing.duration,
    vehicle_type: incoming.vehicle_type ?? existing.vehicle_type,
    pickup_notes: incoming.pickup_notes ?? existing.pickup_notes,
    estimated_price: incoming.estimated_price ?? existing.estimated_price,
    final_price: incoming.final_price ?? existing.final_price,
    client_incentive: incoming.client_incentive ?? existing.client_incentive,
    matching_deadline_at:
      incoming.matching_deadline_at ?? existing.matching_deadline_at,
    matching_paused_at:
      incoming.matching_paused_at ?? existing.matching_paused_at,
    updated_at: incoming.updated_at ?? existing.updated_at,
  };
}

interface DriverState {
  isOnline: boolean;
  hasSeenRide: boolean;
  activeRide: Ride | null;
  availableRide: Ride | null;
  availableRides: Ride[];
  /** Timed-out / soft-refused offers shown in bottomsheet until promoted */
  deferredRides: Ride[];
  /** Soft-refused this session — not persisted; blocks overlay re-present */
  declinedOfferIds: string[];
  /** Hard-suppressed this session — never re-present */
  suppressedRideIds: string[];
  /**
   * Ride opened from a ride_offer notification, awaiting overlay promotion.
   * Deliberately in the store (not module scope) so a tap re-renders the
   * dashboard even when it is already mounted behind the notification shade.
   */
  pendingOfferOpen: PendingOfferOpen | null;
  /**
   * What the notification payload could tell us about the ride being opened, shown until the
   * server confirms or refutes it. Cleared as soon as the read resolves.
   */
  provisionalOffer: ProvisionalOffer | null;
  /**
   * When the last ride_offer notification was tapped. Read through `isNotificationArrival`:
   * during the window that follows, the arrived offer is presented without entry motion.
   */
  offerArrivalAt: OfferArrivalAt;
  /**
   * Whether that arrival came from a tap or from the silent wake. Read by the ring gate; see
   * `resolveOfferRingAction`.
   */
  offerArrivalSource: OfferArrivalSource | null;
  stats: DriverStats;
  currentLocation: Location | null;
  setIsOnline: (online: boolean) => void;
  setActiveRide: (ride: Ride | null) => void;
  setAvailableRide: (ride: Ride | null) => void;
  setAvailableRides: (rides: Ride[]) => void;
  addAvailableRide: (ride: Ride) => void;
  removeAvailableRide: (rideId: string) => void;
  clearAvailableRide: () => void;
  /**
   * Drop stack entries that can no longer be accepted (past their matching deadline, or the
   * client paused matching). Unlike clearAvailableRide, this keeps live offers: it is the
   * correct reaction when the driver stops *receiving* offers but may still hold one that a
   * notification tap handed them.
   */
  pruneUnofferableRides: () => void;
  deferAvailableRide: (rideId: string) => void;
  /** Swipe front to back of the overlay stack (does not defer). */
  cycleAvailableRideToBack: () => void;
  /** Seed bottomsheet carousel with pending rides not currently offered */
  seedDeferredRides: (rides: Ride[]) => void;
  suppressRide: (rideId: string) => void;
  promoteDeferredRide: (rideId: string) => void;
  /** Client edit / new snapshot: merge, unshift overlay, clear declined. */
  promoteTrackedRideToFront: (ride: Ride) => void;
  /** Refresh incentive / matching fields on any tracked ride copy */
  patchTrackedRide: (ride: Ride) => void;
  updateStats: (stats: Partial<DriverStats>) => void;
  completeRide: (ride: Ride) => void;
  setCurrentLocation: (location: Location | null) => void;
  setPendingOfferOpen: (value: PendingOfferOpen | null) => void;
  setProvisionalOffer: (value: ProvisionalOffer | null) => void;
  /** Drop the provisional card, but only while it still describes `rideId`. */
  clearProvisionalOffer: (rideId: string) => void;
  setOfferArrivalAt: (value: OfferArrivalAt) => void;
  setOfferArrivalSource: (value: OfferArrivalSource | null) => void;
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      isOnline: false,
      hasSeenRide: false,
      setIsOnline: (online) =>
        set(
          online
            ? { isOnline: true, hasSeenRide: false }
            : {
                isOnline: false,
                hasSeenRide: false,
                availableRide: null,
                availableRides: [],
                deferredRides: [],
                declinedOfferIds: [],
                suppressedRideIds: [],
                // Keep activeRide — going offline never abandons the current trip.
              },
        ),
      activeRide: null,
      setActiveRide: (ride) => set({ activeRide: ride }),
      availableRide: null,
      availableRides: [],
      deferredRides: [],
      declinedOfferIds: [],
      suppressedRideIds: [],
      setAvailableRide: (ride) =>
        set(() => ({
          availableRide: ride,
          availableRides: ride ? [ride] : [],
          hasSeenRide: false,
        })),
      setAvailableRides: (rides) =>
        set({
          availableRides: rides,
          availableRide: rides[0] ?? null,
        }),
      addAvailableRide: (ride) =>
        set((state) => {
          if (!canPresentRideOffer(ride.id, state)) return state;
          // Stack full → overflow into bottomsheet (cap 12).
          if (state.availableRides.length >= OFFER_STACK_VISIBLE_MAX) {
            return {
              deferredRides: appendCappedById(
                state.deferredRides,
                [ride],
                DEFERRED_SHEET_MAX,
              ),
            };
          }
          const availableRides = [...state.availableRides, ride];
          return {
            availableRides,
            availableRide: state.availableRide ?? ride,
          };
        }),
      removeAvailableRide: (rideId) =>
        set((state) => {
          const availableRides = state.availableRides.filter(
            (ride) => ride.id !== rideId,
          );
          return {
            availableRides,
            availableRide:
              state.availableRide?.id === rideId
                ? availableRides[0] ?? null
                : state.availableRide,
          };
        }),
      clearAvailableRide: () =>
        set({ availableRide: null, availableRides: [] }),
      pruneUnofferableRides: () =>
        set((state) => {
          const availableRides = state.availableRides.filter((ride) =>
            isRideStillOfferable(ride),
          );
          if (availableRides.length === state.availableRides.length) {
            return state;
          }
          return {
            availableRides,
            availableRide:
              state.availableRide &&
              isRideStillOfferable(state.availableRide)
                ? state.availableRide
                : availableRides[0] ?? null,
          };
        }),
      deferAvailableRide: (rideId) =>
        set((state) => {
          const ride =
            state.availableRides.find((r) => r.id === rideId) ??
            (state.availableRide?.id === rideId ? state.availableRide : null);
          if (!ride) return state;
          const without = state.availableRides.filter((r) => r.id !== rideId);
          const deferredBase = state.deferredRides.some((r) => r.id === rideId)
            ? state.deferredRides
            : appendCappedById(state.deferredRides, [ride], DEFERRED_SHEET_MAX);
          const prevDeclined = state.declinedOfferIds ?? [];
          const declinedOfferIds = prevDeclined.includes(rideId)
            ? prevDeclined
            : [...prevDeclined, rideId];
          return {
            availableRides: without,
            availableRide: without[0] ?? null,
            deferredRides: deferredBase,
            declinedOfferIds,
          };
        }),
      cycleAvailableRideToBack: () =>
        set((state) => {
          const availableRides = cycleOfferStackFrontToBack(
            state.availableRides,
          );
          if (availableRides === state.availableRides) return state;
          return {
            availableRides,
            availableRide: availableRides[0] ?? null,
          };
        }),
      seedDeferredRides: (rides) =>
        set((state) => {
          const toAdd = rides.filter(
            (ride) =>
              isRideStillOfferable(ride) &&
              canPresentRideOffer(ride.id, state) &&
              !state.deferredRides.some((r) => r.id === ride.id),
          );
          if (toAdd.length === 0) return state;
          return {
            deferredRides: appendCappedById(
              state.deferredRides,
              toAdd,
              DEFERRED_SHEET_MAX,
            ),
          };
        }),
      suppressRide: (rideId) =>
        set((state) => {
          const availableRides = state.availableRides.filter(
            (r) => r.id !== rideId,
          );
          return {
            availableRides,
            availableRide:
              state.availableRide?.id === rideId
                ? availableRides[0] ?? null
                : state.availableRide,
            deferredRides: state.deferredRides.filter((r) => r.id !== rideId),
            suppressedRideIds: state.suppressedRideIds.includes(rideId)
              ? state.suppressedRideIds
              : [...state.suppressedRideIds, rideId],
          };
        }),
      promoteDeferredRide: (rideId) =>
        set((state) => {
          const ride = state.deferredRides.find((r) => r.id === rideId);
          if (!ride) return state;
          const deferredWithout = state.deferredRides.filter(
            (r) => r.id !== rideId,
          );
          const stacked = state.availableRides.some((r) => r.id === rideId)
            ? [ride, ...state.availableRides.filter((r) => r.id !== rideId)]
            : [ride, ...state.availableRides];
          const trimmed = trimStackOverflowToDeferred({
            availableRides: stacked,
            deferredRides: deferredWithout,
            stackMax: OFFER_STACK_VISIBLE_MAX,
            sheetMax: DEFERRED_SHEET_MAX,
          });
          return {
            deferredRides: trimmed.deferredRides,
            availableRides: trimmed.availableRides,
            availableRide: trimmed.availableRides[0] ?? null,
          };
        }),
      promoteTrackedRideToFront: (incoming) =>
        set((state) => {
          if (state.suppressedRideIds.includes(incoming.id)) return state;
          const id = incoming.id;
          const fromOverlay = state.availableRides.find((r) => r.id === id);
          const fromDeferred = state.deferredRides.find((r) => r.id === id);
          const existing = fromOverlay ?? fromDeferred;
          const merged = existing
            ? mergeRideSnapshot(existing, incoming)
            : incoming;
          const deferredWithout = state.deferredRides.filter((r) => r.id !== id);
          const overlayWithout = state.availableRides.filter((r) => r.id !== id);
          const trimmed = trimStackOverflowToDeferred({
            availableRides: [merged, ...overlayWithout],
            deferredRides: deferredWithout,
            stackMax: OFFER_STACK_VISIBLE_MAX,
            sheetMax: DEFERRED_SHEET_MAX,
          });
          return {
            deferredRides: trimmed.deferredRides,
            availableRides: trimmed.availableRides,
            availableRide: trimmed.availableRides[0] ?? null,
            declinedOfferIds: (state.declinedOfferIds ?? []).filter(
              (x) => x !== id,
            ),
          };
        }),
      patchTrackedRide: (incoming) =>
        set((state) => {
          const id = incoming.id;
          const touches =
            state.availableRide?.id === id ||
            state.availableRides.some((r) => r.id === id) ||
            state.deferredRides.some((r) => r.id === id) ||
            state.activeRide?.id === id;
          if (!touches) return state;
          return {
            availableRide:
              state.availableRide?.id === id
                ? mergeRideSnapshot(state.availableRide, incoming)
                : state.availableRide,
            availableRides: state.availableRides.map((r) =>
              r.id === id ? mergeRideSnapshot(r, incoming) : r,
            ),
            deferredRides: state.deferredRides.map((r) =>
              r.id === id ? mergeRideSnapshot(r, incoming) : r,
            ),
            activeRide:
              state.activeRide?.id === id
                ? mergeRideSnapshot(state.activeRide, incoming)
                : state.activeRide,
          };
        }),
      stats: {
        todayEarnings: 0,
        todayRides: 0,
        onlineTimeMinutes: 0,
        rating: 0,
      },
      updateStats: (newStats) =>
        set((state) => ({
          stats: { ...state.stats, ...newStats },
        })),
      completeRide: (ride) =>
        set((state) => {
          const earnings = ride.final_price || ride.estimated_price || 0;
          return {
            activeRide: null,
            stats: {
              ...state.stats,
              todayEarnings: state.stats.todayEarnings + earnings,
              todayRides: state.stats.todayRides + 1,
            },
            // isOnline unchanged — offline-after-trip stays offline.
          };
        }),
      currentLocation: null,
      setCurrentLocation: (location) =>
        set((state) => {
          if (location == null) {
            return state.currentLocation == null
              ? state
              : { currentLocation: null };
          }
          if (
            state.currentLocation &&
            !gpsMovedEnough(state.currentLocation, location)
          ) {
            return state;
          }
          return { currentLocation: location };
        }),
      pendingOfferOpen: null,
      setPendingOfferOpen: (value) => set({ pendingOfferOpen: value }),
      provisionalOffer: null,
      setProvisionalOffer: (value) => set({ provisionalOffer: value }),
      clearProvisionalOffer: (rideId) =>
        set((state) =>
          state.provisionalOffer?.rideId === rideId
            ? { provisionalOffer: null }
            : state,
        ),
      offerArrivalAt: null,
      setOfferArrivalAt: (value) => set({ offerArrivalAt: value }),
      offerArrivalSource: null,
      setOfferArrivalSource: (value) => set({ offerArrivalSource: value }),
    }),
    {
      name: 'driver-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        stats: state.stats,
        activeRide: state.activeRide,
      }),
    },
  ),
);
