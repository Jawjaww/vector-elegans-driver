import type { Database } from '../types/database.types';
import type { Ride } from '../stores/driverStore';

export type RideRow = Database['public']['Tables']['rides']['Row'];

function num(value: number | null | undefined): number {
  return Number(value ?? 0);
}

/** Map a Supabase rides row to the driver-app Ride shape. */
export function toAppRide(row: Partial<RideRow> & Pick<RideRow, 'id'>): Ride {
  return {
    id: row.id,
    user_id: row.user_id ?? '',
    driver_id: row.driver_id ?? undefined,
    status: row.status ?? '',
    pickup_address: row.pickup_address ?? '',
    pickup_lat: num(row.pickup_lat),
    pickup_lon: num(row.pickup_lon),
    dropoff_address: row.dropoff_address ?? '',
    dropoff_lat: num(row.dropoff_lat),
    dropoff_lon: num(row.dropoff_lon),
    pickup_time: row.pickup_time ?? new Date(0).toISOString(),
    distance: row.distance ?? null,
    duration: row.duration ?? null,
    vehicle_type: row.vehicle_type ?? '',
    options: row.options ?? undefined,
    estimated_price: row.estimated_price ?? null,
    final_price: row.final_price ?? null,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
    price: row.price ?? undefined,
    pickup_notes: row.pickup_notes ?? undefined,
    driver_arrived_at: row.driver_arrived_at ?? null,
    accepted_at: row.accepted_at ?? null,
    client_incentive: row.client_incentive ?? null,
    matching_deadline_at: row.matching_deadline_at ?? null,
    matching_paused_at: row.matching_paused_at ?? null,
  };
}
