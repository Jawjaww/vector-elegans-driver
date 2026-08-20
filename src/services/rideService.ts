import { supabase } from '../lib/supabase';
import type { Ride, RideStatus } from '../lib/types/database.types';

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
  overrideVehicleId?: string | null;
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
          onNewRide(this.mapToPendingRide(payload.new as Ride));
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
          onRideUpdated(this.mapToPendingRide(payload.new as Ride));
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

  async recordOffer(rideId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('record_ride_offer', {
      p_ride_id: rideId,
    });
    if (error) return { success: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.success === false) {
      return { success: false, error: row.error || 'record failed' };
    }
    return { success: true };
  }

  async respondOffer(
    rideId: string,
    response: 'declined' | 'timeout'
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('respond_ride_offer', {
      p_ride_id: rideId,
      p_response: response,
    });
    if (error) return { success: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.success === false) {
      return { success: false, error: row.error || 'respond failed' };
    }
    return { success: true };
  }

  async acceptRide(rideId: string): Promise<AcceptRideResult> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        status: rpcResult.status ?? 'scheduled',
        overrideVehicleId: rpcResult.override_vehicle_id ?? null,
      };
    } catch (error) {
      console.error('[RideService] Error accepting ride:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  async updateRideProgress(
    rideId: string,
    status: Extract<RideStatus, 'in-progress' | 'completed' | 'driver-canceled' | 'no-show'>
  ): Promise<{ success: boolean; error?: string; status?: string }> {
    const { data, error } = await supabase.rpc('update_ride_progress', {
      p_ride_id: rideId,
      p_status: status,
    });
    if (error) return { success: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.success !== true) {
      return { success: false, error: row?.error || 'progress failed' };
    }
    return { success: true, status: row.status };
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
