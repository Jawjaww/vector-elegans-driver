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

  it('does not call auth.getUser(): accept_ride resolves the driver from auth.uid()', async () => {
    // Non-vacuity: re-adding the getSession/getUser precheck would make this fail. The RPC
    // is the single authority on identity — p_driver_id is only an optional, validated hint.
    mockRpc.mockResolvedValue({
      data: { success: false, error: 'Non authentifié' },
      error: null,
    });

    const result = await rideService.acceptRide('ride-1');

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('accept_ride', { p_ride_id: 'ride-1' });
    expect(result).toEqual({ success: false, error: 'Non authentifié' });
  });

  it('calls accept_ride and returns scheduled on success', async () => {
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

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('accept_ride', {
      p_ride_id: 'ride-1',
    });
    expect(result).toEqual({
      success: true,
      rideId: 'ride-1',
      status: 'scheduled',
      overrideVehicleId: null,
    });
  });

  it('surfaces RPC business error', async () => {
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

describe('rideService.fetchAssignedRide', () => {
  it('returns the latest scheduled or in-progress ride for the driver', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'r1', status: 'scheduled', driver_id: 'd1' },
      error: null,
    });
    const limit = jest.fn(() => ({ maybeSingle }));
    const order = jest.fn(() => ({ limit }));
    const inFn = jest.fn(() => ({ order }));
    const eq = jest.fn(() => ({ in: inFn }));
    const select = jest.fn(() => ({ eq }));
    const { supabase } = require('../supabase');
    supabase.from.mockReturnValue({ select });

    const row = await rideService.fetchAssignedRide('d1');
    expect(supabase.from).toHaveBeenCalledWith('rides');
    expect(eq).toHaveBeenCalledWith('driver_id', 'd1');
    expect(inFn).toHaveBeenCalledWith('status', ['scheduled', 'in-progress']);
    expect(row).toMatchObject({ id: 'r1', status: 'scheduled' });
  });
});

describe('rideService.fetchDriverOfferRide', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockGetUser.mockReset();
  });

  const expectOk = (
    result: Awaited<ReturnType<typeof rideService.fetchDriverOfferRide>>,
  ) => {
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    return result;
  };

  it('maps a successful payload to ride + offer state', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        ride: { id: 'r1', status: 'pending', pickup_address: 'Rue de Rivoli' },
        offer: {
          status: 'offered',
          wave_n: 1,
          offered_at: '2026-09-16T10:00:00Z',
          expires_at: '2026-09-16T10:01:30Z',
          responded_at: null,
          alive: true,
        },
      },
      error: null,
    });

    const result = await rideService.fetchDriverOfferRide('r1');

    expect(mockRpc).toHaveBeenCalledWith('get_driver_offer_ride', {
      p_ride_id: 'r1',
    });
    expect(expectOk(result)).toEqual({
      ok: true,
      ride: expect.objectContaining({
        id: 'r1',
        pickup_address: 'Rue de Rivoli',
      }),
      offer: {
        status: 'offered',
        waveN: 1,
        offeredAt: '2026-09-16T10:00:00Z',
        expiresAt: '2026-09-16T10:01:30Z',
        respondedAt: null,
        alive: true,
      },
    });
  });

  it('keeps an expired offer readable and flags it dead', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        ride: { id: 'r1', status: 'pending' },
        offer: {
          status: 'offered',
          expires_at: '2020-01-01T00:00:00Z',
          alive: false,
        },
      },
      error: null,
    });

    expect(expectOk(await rideService.fetchDriverOfferRide('r1')).offer.alive).toBe(
      false,
    );
  });

  it('maps a refusal payload to its reason', async () => {
    mockRpc.mockResolvedValue({
      data: { success: false, reason: 'no_offer' },
      error: null,
    });

    expect(await rideService.fetchDriverOfferRide('r1')).toEqual({
      ok: false,
      reason: 'no_offer',
    });
  });

  it('flags a transient network failure', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });

    expect(await rideService.fetchDriverOfferRide('r1')).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});

describe('rideService.fetchOfferableRides', () => {
  it('selects pending and delayed then keeps still-offerable rows', async () => {
    const ride = {
      id: 'r1',
      status: 'delayed',
      matching_paused_at: null,
      matching_deadline_at: new Date(Date.now() + 60_000).toISOString(),
      pickup_time: new Date().toISOString(),
    };
    const limit = jest.fn().mockResolvedValue({ data: [ride], error: null });
    const order = jest.fn(() => ({ limit }));
    const or = jest.fn(() => ({ order }));
    const is = jest.fn(() => ({ or }));
    const inFn = jest.fn(() => ({ is }));
    const select = jest.fn(() => ({ in: inFn }));
    const { supabase } = require('../supabase');
    supabase.from.mockReturnValue({ select });

    const rows = await rideService.fetchOfferableRides();
    expect(inFn).toHaveBeenCalledWith('status', ['pending', 'delayed']);
    expect(rows).toMatchObject([ride]);
  });
});

describe('rideService.fetchOpenOfferRides', () => {
  it('loads rides for non-expired offered rows', async () => {
    const ride = {
      id: 'r1',
      status: 'pending',
      matching_paused_at: null,
      matching_deadline_at: new Date(Date.now() + 60_000).toISOString(),
      pickup_time: new Date().toISOString(),
    };
    const inFn = jest.fn().mockResolvedValue({ data: [ride], error: null });
    const selectRides = jest.fn(() => ({ in: inFn }));
    const eqStatus = jest.fn().mockResolvedValue({
      data: [
        {
          ride_id: 'r1',
          status: 'offered',
          expires_at: new Date(Date.now() + 30_000).toISOString(),
        },
      ],
      error: null,
    });
    const eqDriver = jest.fn(() => ({ eq: eqStatus }));
    const selectOffers = jest.fn(() => ({ eq: eqDriver }));
    const { supabase } = require('../supabase');
    supabase.from.mockImplementation((table: string) => {
      if (table === 'ride_offers') return { select: selectOffers };
      return { select: selectRides };
    });

    const rows = await rideService.fetchOpenOfferRides('driver-1');
    expect(rows).toMatchObject([ride]);
    expect(inFn).toHaveBeenCalledWith('id', ['r1']);
  });
});
