import { supabase } from '../supabase';
import type { Database } from '../types/database.types';

export type VehicleType = Database['public']['Enums']['vehicle_type_enum'];

export const VEHICLE_TYPES: VehicleType[] = [
  'STANDARD',
  'PREMIUM',
  'VAN',
  'ELECTRIC',
];

export interface DriverVehicleForm {
  make: string;
  model: string;
  license_plate: string;
  vehicle_type: VehicleType;
  color: string;
}

export const EMPTY_VEHICLE_FORM: DriverVehicleForm = {
  make: '',
  model: '',
  license_plate: '',
  vehicle_type: 'STANDARD',
  color: '',
};

const DRAFT_PLACEHOLDER = 'À compléter';

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function fromDbText(value: unknown): string {
  const text = asText(value).trim();
  if (!text || text === DRAFT_PLACEHOLDER) return '';
  return text;
}

function isVehicleType(value: unknown): value is VehicleType {
  return (
    value === 'STANDARD' ||
    value === 'PREMIUM' ||
    value === 'VAN' ||
    value === 'ELECTRIC'
  );
}

function firstRpcRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === 'object'
      ? (row as Record<string, unknown>)
      : null;
  }
  if (data && typeof data === 'object') {
    return data as Record<string, unknown>;
  }
  return null;
}

export function mapPrimaryVehicleRow(
  row: Record<string, unknown> | null,
): DriverVehicleForm | null {
  if (!row) return null;
  return {
    make: fromDbText(row.make),
    model: fromDbText(row.model),
    license_plate: fromDbText(row.license_plate),
    vehicle_type: isVehicleType(row.vehicle_type) ? row.vehicle_type : 'STANDARD',
    color: fromDbText(row.color),
  };
}

export async function getOwnPrimaryVehicle(): Promise<DriverVehicleForm | null> {
  const { data, error } = await supabase.rpc('get_own_primary_vehicle');
  if (error) {
    console.error('[vehicleService] get_own_primary_vehicle:', error);
    return null;
  }
  return mapPrimaryVehicleRow(firstRpcRow(data));
}

export async function upsertOwnPrimaryVehicle(
  form: DriverVehicleForm,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('upsert_own_primary_vehicle', {
    p_make: form.make.trim(),
    p_model: form.model.trim(),
    p_license_plate: form.license_plate.trim(),
    p_vehicle_type: form.vehicle_type,
    p_color: form.color.trim() || undefined,
  });

  if (error) {
    console.error('[vehicleService] upsert_own_primary_vehicle:', error);
    return { success: false, error: error.message };
  }

  const row = firstRpcRow(data);
  if (row?.success === false) {
    const code = asText(row.error);
    return {
      success: false,
      error: code === 'license_plate_taken' ? 'license_plate_taken' : code || 'upsert_failed',
    };
  }

  return { success: true };
}
