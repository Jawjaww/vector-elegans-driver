const mockRpc = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: jest.fn(),
    channel: jest.fn(),
  },
}));

import { rideService } from '../../services/rideService';

describe('rideService.acceptRide', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockGetUser.mockReset();
  });

  it('returns error when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await rideService.acceptRide('ride-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not authenticated');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls accept_ride and returns scheduled on success', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'auth-user-1' } },
    });
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        ride_id: 'ride-1',
        status: 'scheduled',
        driver_id: 'driver-row-1',
      },
      error: null,
    });

    const result = await rideService.acceptRide('ride-1');

    expect(mockRpc).toHaveBeenCalledWith('accept_ride', {
      p_ride_id: 'ride-1',
      p_driver_id: 'auth-user-1',
    });
    expect(result).toEqual({
      success: true,
      rideId: 'ride-1',
      status: 'scheduled',
    });
  });

  it('surfaces RPC business error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'auth-user-1' } },
    });
    mockRpc.mockResolvedValue({
      data: { success: false, error: 'Chauffeur non trouvé ou inactif' },
      error: null,
    });

    const result = await rideService.acceptRide('ride-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('inactif');
  });
});
