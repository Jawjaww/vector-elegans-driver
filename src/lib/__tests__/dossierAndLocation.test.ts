const mockRpc = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

import { submitDossier, getDossierStatus, canEditDossier, cancelDossierReview } from '../services/dossierService';
import { pushDriverLocation } from '../services/locationService';

describe('dossierService', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('submitDossier calls submit_driver_dossier RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ success: true, new_status: 'pending_review', message: 'ok' }],
      error: null,
    });

    const result = await submitDossier('driver-1', 'user-1');

    expect(mockRpc).toHaveBeenCalledWith('submit_driver_dossier', {
      p_driver_id: 'driver-1',
      p_user_id: 'user-1',
    });
    expect(result.success).toBe(true);
    expect(result.new_status).toBe('pending_review');
  });

  it('cancelDossierReview calls cancel_driver_dossier_review RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ success: true, new_status: 'draft', message: 'cancelled' }],
      error: null,
    });

    const result = await cancelDossierReview('driver-1', 'user-1', 'fix photo');

    expect(mockRpc).toHaveBeenCalledWith('cancel_driver_dossier_review', {
      p_driver_id: 'driver-1',
      p_actor_user_id: 'user-1',
      p_reason: 'fix photo',
    });
    expect(result.success).toBe(true);
    expect(result.new_status).toBe('draft');
  });

  it('getDossierStatus normalizes pending_validation', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          status: 'pending_validation',
          submitted_at: null,
          validated_at: null,
          rejected_at: null,
          rejection_reason: null,
          is_editable: false,
          can_submit: false,
          can_edit_documents: false,
          completion_percentage: 90,
        },
      ],
      error: null,
    });

    const status = await getDossierStatus('driver-1');
    expect(status?.status).toBe('pending_review');
  });

  it('canEditDossier returns RPC boolean', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(canEditDossier('d1', 'u1')).resolves.toBe(true);
  });
});

describe('locationService', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('calls update_driver_location RPC (not direct table insert)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await pushDriverLocation({
      lat: 48.85,
      lng: 2.35,
      heading: 10,
      speed: 5,
      accuracy: 8,
    });

    expect(mockRpc).toHaveBeenCalledWith('update_driver_location', {
      p_lat: 48.85,
      p_lng: 2.35,
      p_heading: 10,
      p_speed: 5,
      p_accuracy: 8,
    });
    expect(result.error).toBeNull();
  });
});
