jest.mock('../supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

import { supabase } from '../supabase';
import {
  EMPTY_VEHICLE_FORM,
  getOwnPrimaryVehicle,
  mapPrimaryVehicleRow,
  upsertOwnPrimaryVehicle,
  type DriverVehicleForm,
} from '../services/vehicleService';

const mockRpc = supabase.rpc as jest.Mock;

describe('mapPrimaryVehicleRow', () => {
  it('returns null for empty payload', () => {
    expect(mapPrimaryVehicleRow(null)).toBeNull();
  });

  it('strips draft placeholders', () => {
    expect(
      mapPrimaryVehicleRow({
        make: 'À compléter',
        model: 'Megane',
        license_plate: 'À compléter',
        vehicle_type: 'PREMIUM',
        color: '',
      }),
    ).toEqual<DriverVehicleForm>({
      make: '',
      model: 'Megane',
      license_plate: '',
      vehicle_type: 'PREMIUM',
      color: '',
    });
  });

  it('defaults unknown type to STANDARD', () => {
    expect(mapPrimaryVehicleRow({ vehicle_type: 'LIMO' })?.vehicle_type).toBe(
      'STANDARD',
    );
  });

  it('starts from an empty form', () => {
    expect(EMPTY_VEHICLE_FORM.vehicle_type).toBe('STANDARD');
    expect(EMPTY_VEHICLE_FORM.license_plate).toBe('');
  });
});

describe('vehicle RPCs', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('getOwnPrimaryVehicle maps the first RPC row', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          make: 'Renault',
          model: 'Megane',
          license_plate: 'AA-123-BB',
          vehicle_type: 'STANDARD',
          color: 'Noir',
        },
      ],
      error: null,
    });

    const vehicle = await getOwnPrimaryVehicle();
    expect(mockRpc).toHaveBeenCalledWith('get_own_primary_vehicle');
    expect(vehicle?.license_plate).toBe('AA-123-BB');
    expect(vehicle?.make).toBe('Renault');
  });

  it('upsertOwnPrimaryVehicle reports a taken plate', async () => {
    mockRpc.mockResolvedValue({
      data: { success: false, error: 'license_plate_taken' },
      error: null,
    });

    const result = await upsertOwnPrimaryVehicle({
      ...EMPTY_VEHICLE_FORM,
      make: 'Peugeot',
      model: '308',
      license_plate: 'AA-123-BB',
    });

    expect(result).toEqual({ success: false, error: 'license_plate_taken' });
  });
});
