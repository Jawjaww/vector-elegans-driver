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
      overrideVehicleId: null,
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

describe('rideService.offer + progress', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('recordOffer calls record_ride_offer', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    await rideService.recordOffer('ride-1');
    expect(mockRpc).toHaveBeenCalledWith('record_ride_offer', {
      p_ride_id: 'ride-1',
    });
  });

  it('respondOffer calls respond_ride_offer', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    await rideService.respondOffer('ride-1', 'timeout');
    expect(mockRpc).toHaveBeenCalledWith('respond_ride_offer', {
      p_ride_id: 'ride-1',
      p_response: 'timeout',
    });
  });

  it('updateRideProgress calls update_ride_progress', async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, status: 'in-progress' },
      error: null,
    });
    const result = await rideService.updateRideProgress('ride-1', 'in-progress');
    expect(mockRpc).toHaveBeenCalledWith('update_ride_progress', {
      p_ride_id: 'ride-1',
      p_status: 'in-progress',
    });
    expect(result.success).toBe(true);
  });

  it('markDriverArrived calls mark_driver_arrived', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        driver_arrived_at: '2026-08-24T12:00:00Z',
        already_marked: false,
      },
      error: null,
    });
    const result = await rideService.markDriverArrived('ride-1');
    expect(mockRpc).toHaveBeenCalledWith('mark_driver_arrived', {
      p_ride_id: 'ride-1',
    });
    expect(result).toMatchObject({
      success: true,
      driverArrivedAt: '2026-08-24T12:00:00Z',
    });
  });
});
