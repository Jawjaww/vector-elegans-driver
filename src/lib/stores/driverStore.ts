import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

interface DriverState {
  isOnline: boolean;
  hasSeenRide: boolean; // Track if a ride has been shown in this session
  activeRide: Ride | null;
  availableRide: Ride | null;
  availableRides: Ride[]; // Liste des rides disponibles pour l'empilement
  stats: DriverStats;
  currentLocation: Location | null;
  setIsOnline: (online: boolean) => void;
  setActiveRide: (ride: Ride | null) => void;
  setAvailableRide: (ride: Ride | null) => void;
  setAvailableRides: (rides: Ride[]) => void;
  addAvailableRide: (ride: Ride) => void;
  removeAvailableRide: (rideId: string) => void;
  clearAvailableRide: () => void;
  updateStats: (stats: Partial<DriverStats>) => void;
  completeRide: (ride: Ride) => void;
  setCurrentLocation: (location: Location | null) => void;
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      isOnline: false,
      hasSeenRide: false,
      setIsOnline: (online) => set({ isOnline: online, hasSeenRide: false }), // Reset on toggle
      activeRide: null,
      setActiveRide: (ride) => set({ activeRide: ride }),
      availableRide: null,
      availableRides: [],
      setAvailableRide: (ride) => set((state) => ({ 
        availableRide: ride, 
        hasSeenRide: ride ? true : state.hasSeenRide 
      })),
      setAvailableRides: (rides) => set({ availableRides: rides }),
      addAvailableRide: (ride) => set((state) => ({ 
        availableRides: [...state.availableRides, ride] 
      })),
      removeAvailableRide: (rideId) => set((state) => ({ 
        availableRides: state.availableRides.filter(ride => ride.id !== rideId) 
      })),
      clearAvailableRide: () => set({ availableRide: null }),
      stats: {
        todayEarnings: 0,
        todayRides: 0,
        onlineTimeMinutes: 0,
        rating: 0
      },
      updateStats: (newStats) => 
        set((state) => ({ 
          stats: { ...state.stats, ...newStats } 
        })),
      completeRide: (ride) => 
        set((state) => {
          const earnings = ride.final_price || ride.estimated_price || 0;
          return {
            activeRide: null,
            stats: {
              ...state.stats,
              todayEarnings: state.stats.todayEarnings + earnings,
              todayRides: state.stats.todayRides + 1
            }
          };
        }),
      currentLocation: null,
      setCurrentLocation: (location) => set({ currentLocation: location })
    }),
    {
      name: 'driver-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        stats: state.stats,
        activeRide: state.activeRide 
      })
    }
  )
);
