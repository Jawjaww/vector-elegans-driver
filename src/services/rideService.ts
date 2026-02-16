import { supabase } from '../supabase';
import type { Ride, DriverLocation } from '../types/database.types';

export interface PendingRide {
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

export interface AcceptRideResult {
  success: boolean;
  error?: string;
  rideId?: string;
  status?: string;
}

class RideService {
  private subscription: ReturnType<typeof supabase.channel> | null = null;

  subscribeToPendingRides(
    onNewRide: (ride: PendingRide) => void,
    onRideUpdated: (ride: PendingRide) => void,
    onRideRemoved: (rideId: string) => void
  ) {
    this.unsubscribe();

    this.subscription = supabase
      .channel('driver-pending-rides')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rides',
          filter: 'status=eq.pending',
        },
        (payload) => {
          const ride = this.mapToPendingRide(payload.new as Ride);
          onNewRide(ride);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rides',
          filter: 'status=eq.pending',
        },
        (payload) => {
          const ride = this.mapToPendingRide(payload.new as Ride);
          onRideUpdated(ride);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rides',
          filter: 'status=neq.pending',
        },
        (payload) => {
          onRideRemoved((payload.new as Ride).id);
        }
      )
      .subscribe();

    return this.subscription;
  }

  unsubscribe() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  async fetchPendingRides(): Promise<PendingRide[]> {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[RideService] Error fetching pending rides:', error);
      throw error;
    }

    return (data || []).map(this.mapToPendingRide);
  }

  async acceptRide(rideId: string): Promise<AcceptRideResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      const { data, error } = await supabase.rpc('accept_ride', {
        p_ride_id: rideId,
        p_driver_id: user.id,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const rpcResult = Array.isArray(data) ? data[0] : data;

      if (!rpcResult) {
        return { success: false, error: 'No response from server' };
      }

      if (rpcResult.success === false) {
        return {
          success: false,
          error: rpcResult.error || 'Ride rejected',
        };
      }

      return {
        success: true,
        rideId: rpcResult.ride_id ?? rideId,
        status: rpcResult.status ?? 'accepted',
      };
    } catch (error) {
      console.error('[RideService] Error accepting ride:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  async updateRideStatus(rideId: string, status: string) {
    const { error } = await supabase
      .from('rides')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', rideId);

    if (error) {
      console.error('[RideService] Error updating ride status:', error);
      throw error;
    }
  }

  private mapToPendingRide(ride: Ride): PendingRide {
    return {
      id: ride.id,
      clientId: ride.user_id || '',
      pickupLocation: ride.pickup_address,
      dropoffLocation: ride.dropoff_address,
      pickupLat: ride.pickup_lat ?? 0,
      pickupLng: ride.pickup_lon ?? 0,
      dropoffLat: ride.dropoff_lat ?? 0,
      dropoffLng: ride.dropoff_lon ?? 0,
      pickupTime: ride.pickup_time,
      vehicleType: ride.vehicle_type,
      estimatedDistance: ride.distance,
      estimatedDuration: ride.duration,
      estimatedPrice: ride.estimated_price,
      finalPrice: ride.final_price,
      status: ride.status,
      options: ride.options || [],
      createdAt: ride.created_at,
    };
  }
}

export const rideService = new RideService();
