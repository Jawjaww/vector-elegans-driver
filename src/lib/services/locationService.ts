/**
 * GPS sync via update_driver_location RPC (drivers.id resolved server-side).
 */

import { supabase } from '../supabase';

export type DriverLocationPayload = {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
};

export async function pushDriverLocation(
  location: DriverLocationPayload
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('update_driver_location', {
    p_lat: location.lat,
    p_lng: location.lng,
    p_heading: location.heading ?? undefined,
    p_speed: location.speed ?? undefined,
    p_accuracy: location.accuracy ?? undefined,
  });

  return { error: error ? new Error(error.message) : null };
}
