import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRideStillOfferable } from '../utils/ridePickup';

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

/** Pure helper — used by presentOffer + Jest */
export function canPresentRideOffer(
  rideId: string,
  state: {
    suppressedRideIds: string[];
    deferredRides: Ride[];
    availableRides: Ride[];
  },
): boolean {
  if (state.suppressedRideIds.includes(rideId)) return false;
  if (state.deferredRides.some((r) => r.id === rideId)) return false;
  if (state.availableRides.some((r) => r.id === rideId)) return false;
  return true;
}

export function pickNextPendingRide(
  pending: Ride[],
  state: {
    suppressedRideIds: string[];
    deferredRides: Ride[];
    availableRides: Ride[];
  },
): Ride | null {
  return (
    pending.find(
      (ride) =>
        isRideStillOfferable(ride) &&
        canPresentRideOffer(ride.id, state),
    ) ?? null
  );
}

/** Merge live DB fields (incentive, matching window, price) into a tracked ride. */
export function mergeRideSnapshot(existing: Ride, incoming: Ride): Ride {
  return {
    ...existing,
    status: incoming.status ?? existing.status,
    estimated_price:
      incoming.estimated_price !== undefined
        ? incoming.estimated_price
        : existing.estimated_price,
    final_price:
      incoming.final_price !== undefined
        ? incoming.final_price
        : existing.final_price,
    client_incentive:
      incoming.client_incentive !== undefined
        ? incoming.client_incentive
        : existing.client_incentive,
    matching_deadline_at:
      incoming.matching_deadline_at !== undefined
        ? incoming.matching_deadline_at
        : existing.matching_deadline_at,
    matching_paused_at:
      incoming.matching_paused_at !== undefined
        ? incoming.matching_paused_at
        : existing.matching_paused_at,
    updated_at: incoming.updated_at ?? existing.updated_at,
  };
}

interface DriverState {
  isOnline: boolean;
  hasSeenRide: boolean;
  activeRide: Ride | null;
  availableRide: Ride | null;
  availableRides: Ride[];
  /** Timed-out offers shown in bottomsheet until promoted or suppressed */
  deferredRides: Ride[];
  /** Declined this session — never re-present */
  suppressedRideIds: string[];
  stats: DriverStats;
  currentLocation: Location | null;
  setIsOnline: (online: boolean) => void;
  setActiveRide: (ride: Ride | null) => void;
  setAvailableRide: (ride: Ride | null) => void;
  setAvailableRides: (rides: Ride[]) => void;
  addAvailableRide: (ride: Ride) => void;
  removeAvailableRide: (rideId: string) => void;
  clearAvailableRide: () => void;
  deferAvailableRide: (rideId: string) => void;
  /** Seed bottomsheet carousel with pending rides not currently offered */
  seedDeferredRides: (rides: Ride[]) => void;
  suppressRide: (rideId: string) => void;
  promoteDeferredRide: (rideId: string) => void;
  /** Refresh incentive / matching fields on any tracked ride copy */
  patchTrackedRide: (ride: Ride) => void;
  updateStats: (stats: Partial<DriverStats>) => void;
  completeRide: (ride: Ride) => void;
  setCurrentLocation: (location: Location | null) => void;
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
                suppressedRideIds: [],
              },
        ),
      activeRide: null,
      setActiveRide: (ride) => set({ activeRide: ride }),
      availableRide: null,
      availableRides: [],
      deferredRides: [],
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
      deferAvailableRide: (rideId) =>
        set((state) => {
          const ride =
            state.availableRides.find((r) => r.id === rideId) ??
            (state.availableRide?.id === rideId ? state.availableRide : null);
          if (!ride) return state;
          const availableRides = state.availableRides.filter(
            (r) => r.id !== rideId,
          );
          const deferredRides = state.deferredRides.some((r) => r.id === rideId)
            ? state.deferredRides
            : [...state.deferredRides, ride];
          return {
            availableRides,
            availableRide:
              state.availableRide?.id === rideId
                ? availableRides[0] ?? null
                : state.availableRide,
            deferredRides,
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
            deferredRides: [...state.deferredRides, ...toAdd],
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
          const deferredRides = state.deferredRides.filter(
            (r) => r.id !== rideId,
          );
          if (state.availableRides.some((r) => r.id === rideId)) {
            // Already queued — move to front as the active fullscreen offer
            const availableRides = [
              ride,
              ...state.availableRides.filter((r) => r.id !== rideId),
            ];
            return {
              deferredRides,
              availableRides,
              availableRide: ride,
            };
          }
          // Clicked ride becomes the current offer (front of queue)
          const availableRides = [ride, ...state.availableRides];
          return {
            deferredRides,
            availableRides,
            availableRide: ride,
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
          };
        }),
      currentLocation: null,
      setCurrentLocation: (location) => set({ currentLocation: location }),
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
