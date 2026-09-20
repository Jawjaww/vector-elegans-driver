import { supabase } from '../lib/supabase';
import type { RideStatus } from '../lib/types/database.types';
import type { Ride } from '../lib/stores/driverStore';
import { isRideStillOfferable } from '../lib/utils/ridePickup';
import { toAppRide, type RideRow } from '../lib/utils/toAppRide';
import {
  toOfferOpenFetch,
  type OfferOpenFetch,
} from '../lib/utils/offerOpenOutcome';

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
  clientIncentive: number;
  estimatedDistance: number | null;
  estimatedDuration: number | null;
  status: string;
  clientId?: string;
  pickupTime: string | null;
  matchingDeadlineAt: string | null;
  matchingPausedAt: string | null;
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

function applyMatchingFilters<T extends { in: Function; is: Function; or: Function }>(
  query: T,
): T {
  const iso = new Date().toISOString();
  return query
    .in('status', ['pending', 'delayed'])
    .is('matching_paused_at', null)
    .or(`matching_deadline_at.gt."${iso}",matching_deadline_at.is.null`) as T;
}

function isTransientNetworkError(error: { message?: string } | null): boolean {
  return /network request failed|failed to fetch/i.test(error?.message ?? '');
}

class RideService {
  private subscription: ReturnType<typeof supabase.channel> | null = null;

  subscribeToPendingRides(
    onNewRide: (ride: PendingRide) => void,
    onRideUpdated: (ride: PendingRide) => void,
    onRideRemoved: (rideId: string) => void,
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
        },
        (payload) => {
          const ride = toAppRide(payload.new as RideRow);
          if (!isRideStillOfferable(ride)) return;
          onNewRide(this.mapToPendingRide(ride));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rides',
        },
        (payload) => {
          const ride = toAppRide(payload.new as RideRow);
          if (!isRideStillOfferable(ride)) {
            onRideRemoved(ride.id);
            return;
          }
          onRideUpdated(this.mapToPendingRide(ride));
        },
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
    let query = supabase.from('rides').select('*');
    query = applyMatchingFilters(query);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[RideService] Error fetching pending rides:', error);
      throw error;
    }

    return (data || [])
      .map((ride) => toAppRide(ride))
      .filter((ride) => isRideStillOfferable(ride))
      .map((ride) => this.mapToPendingRide(ride));
  }

  /** Home overlay catch-up: raw rows still offerable (pending + delayed). */
  async fetchOfferableRides(): Promise<Ride[]> {
    const run = async () => {
      let query = supabase.from('rides').select('*');
      query = applyMatchingFilters(query);
      return query.order('created_at', { ascending: true }).limit(20);
    };

    let { data, error } = await run();
    if (error && isTransientNetworkError(error)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      ({ data, error } = await run());
    }

    if (error) {
      console.error('[RideService] Error fetching offerable rides:', error);
      return [];
    }

    return (data ?? [])
      .map((ride) => toAppRide(ride))
      .filter((ride) => isRideStillOfferable(ride));
  }

  /** Catch-up from this driver's open server offers (RLS-safe). */
  async fetchOpenOfferRides(driverId: string): Promise<Ride[]> {
    const { data: offers, error: offerError } = await supabase
      .from('ride_offers')
      .select('ride_id, status, expires_at')
      .eq('driver_id', driverId)
      .eq('status', 'offered');

    if (offerError || !offers?.length) return [];

    const nowMs = Date.now();
    const rideIds = offers
      .filter((row) => {
        if (row.status !== 'offered') return false;
        if (!row.expires_at) return true;
        return new Date(row.expires_at).getTime() > nowMs;
      })
      .map((row) => row.ride_id);

    if (rideIds.length === 0) return [];

    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .in('id', rideIds);

    if (error) return [];
    return (data ?? [])
      .map((ride) => toAppRide(ride))
      .filter((ride) => isRideStillOfferable(ride));
  }

  /**
   * Read the ride behind a tapped offer notification, plus that offer's state.
   *
   * Goes through get_driver_offer_ride instead of a plain SELECT: the rides RLS
   * policy hides the row the moment the offer expires, which made a slightly late
   * tap return null with no way to tell an expired offer from a network error.
   */
  async fetchDriverOfferRide(rideId: string): Promise<OfferOpenFetch> {
    const { data, error } = await supabase.rpc('get_driver_offer_ride', {
      p_ride_id: rideId,
    });
    if (error) {
      return {
        ok: false,
        reason: isTransientNetworkError(error) ? 'network' : 'request_failed',
      };
    }
    return toOfferOpenFetch(data);
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
    response: 'declined' | 'timeout',
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
      // No auth.getUser() round-trip: accept_ride(p_ride_id, p_driver_id DEFAULT NULL)
      // resolves the driver from auth.uid(), and the hint is validated against it rather
      // than trusted (20260913030000_ride_dispatch_engine.sql). Fetching the user here only
      // added a network call between the Accept tap and the RPC.
      const { data, error } = await supabase.rpc('accept_ride', {
        p_ride_id: rideId,
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
    status: Extract<
      RideStatus,
      'in-progress' | 'completed' | 'driver-canceled' | 'no-show'
    >,
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

  async markDriverArrived(
    rideId: string,
  ): Promise<{
    success: boolean;
    error?: string;
    driverArrivedAt?: string | null;
    alreadyMarked?: boolean;
  }> {
    const { data, error } = await supabase.rpc('mark_driver_arrived', {
      p_ride_id: rideId,
    });
    if (error) return { success: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.success !== true) {
      return { success: false, error: row?.error || 'arrival failed' };
    }
    return {
      success: true,
      driverArrivedAt: row.driver_arrived_at ?? null,
      alreadyMarked: row.already_marked === true,
    };
  }

  async previewCancelQuote(rideId: string): Promise<{
    success: boolean;
    amount: number;
    driver_may_release: boolean;
    driver_may_noshow: boolean;
    error?: string;
  }> {
    const { data, error } = await supabase.rpc(
      'preview_ride_cancel_quote' as never,
      { p_ride_id: rideId } as never,
    );
    if (error) {
      return {
        success: false,
        amount: 0,
        driver_may_release: false,
        driver_may_noshow: false,
        error: error.message,
      };
    }
    const row =
      (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) {
      return {
        success: false,
        amount: 0,
        driver_may_release: false,
        driver_may_noshow: false,
        error: 'Réponse invalide',
      };
    }
    return {
      success: row.success !== false,
      amount: Number(row.amount) || 0,
      driver_may_release: row.driver_may_release === true,
      driver_may_noshow: row.driver_may_noshow === true,
      error: typeof row.error === 'string' ? row.error : undefined,
    };
  }

  async fetchAssignedRide(driverId: string): Promise<Ride | null> {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['scheduled', 'in-progress'])
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return toAppRide(data);
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
      matchingDeadlineAt: ride.matching_deadline_at ?? null,
      matchingPausedAt: ride.matching_paused_at ?? null,
      vehicleType: ride.vehicle_type,
      estimatedDistance: ride.distance,
      estimatedDuration: ride.duration,
      estimatedPrice: ride.estimated_price,
      finalPrice: ride.final_price,
      clientIncentive: Number(ride.client_incentive ?? 0),
      status: ride.status,
      options: ride.options || [],
      createdAt: ride.created_at,
    };
  }
}

export const rideService = new RideService();
