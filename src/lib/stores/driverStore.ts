import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Ride {
  id: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  estimatedPrice: number | null;
  finalPrice: number | null;
  estimatedDistance: number | null;
  estimatedDuration: number | null;
  status: string;
  clientId?: string;
  pickupTime: string | null;
  createdAt: string;
  vehicleType: string;
  options?: string[];
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
  activeRide: Ride | null;
  availableRide: Ride | null;
  stats: DriverStats;
  currentLocation: Location | null;
  setIsOnline: (online: boolean) => void;
  setActiveRide: (ride: Ride | null) => void;
  setAvailableRide: (ride: Ride | null) => void;
  clearAvailableRide: () => void;
  updateStats: (stats: Partial<DriverStats>) => void;
  setCurrentLocation: (location: Location | null) => void;
}

export const useDriverStore = create<DriverState>()(
  persist(
    (set) => ({
      isOnline: false,
      setIsOnline: (online) => set({ isOnline: online }),
      activeRide: null,
      setActiveRide: (ride) => set({ activeRide: ride }),
      availableRide: null,
      setAvailableRide: (ride) => set({ availableRide: ride }),
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
