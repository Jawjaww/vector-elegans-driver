jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockAcceptRide = jest.fn();
const mockFetchDriverOfferRide = jest.fn();

jest.mock('../../services/rideService', () => ({
  rideService: {
    acceptRide: (...args: unknown[]) => mockAcceptRide(...args),
    fetchDriverOfferRide: (...args: unknown[]) => mockFetchDriverOfferRide(...args),
  },
}));

const mockLogOfferStage = jest.fn();
jest.mock('../notifications/offerPipelineDiag', () => ({
  logOfferStage: (...args: unknown[]) => mockLogOfferStage(...args),
}));

/** The Jest preset is plain ts-jest on node, so RN must be stubbed to import the module. */
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

import { Alert } from 'react-native';
import { useDriverStore, type Ride } from '../stores/driverStore';
import {
  acceptTrackedRide,
  type AcceptTrackedRideArgs,
} from '../utils/acceptTrackedRide';

const alertMock = Alert.alert as jest.Mock;

const FUTURE_DEADLINE = new Date(Date.now() + 10 * 60_000).toISOString();
const PAST_DEADLINE = new Date(Date.now() - 10 * 60_000).toISOString();

const baseRide = (id: string, extra: Partial<Ride> = {}): Ride => ({
  id,
  user_id: 'u1',
  status: 'pending',
  pickup_address: 'A',
  pickup_lat: 0,
  pickup_lon: 0,
  dropoff_address: 'B',
  dropoff_lat: 1,
  dropoff_lon: 1,
  pickup_time: FUTURE_DEADLINE,
  distance: 1000,
  duration: 600,
  vehicle_type: 'STANDARD',
  options: [],
  estimated_price: 20,
  final_price: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  matching_deadline_at: FUTURE_DEADLINE,
  matching_paused_at: null,
  ...extra,
});

const liveOffer = {
  status: 'offered',
  waveN: 1,
  offeredAt: null,
  expiresAt: null,
  respondedAt: null,
  alive: true,
};

function buildArgs(
  overrides: Partial<AcceptTrackedRideArgs> = {},
): AcceptTrackedRideArgs {
  return {
    rideId: 'r1',
    driverStatus: 'active',
    isOnline: true,
    setIsOnline: jest.fn(),
    availableRides: [],
    deferredRides: [],
    availableRide: null,
    setActiveRide: jest.fn(),
    removeAvailableRide: jest.fn(),
    suppressRide: jest.fn(),
    promoteTrackedRideToFront: jest.fn(),
    onUnavailable: jest.fn(),
    acceptingRideIds: new Set<string>(),
    ...overrides,
  };
}

describe('acceptTrackedRide', () => {
  beforeEach(() => {
    mockAcceptRide.mockReset();
    mockFetchDriverOfferRide.mockReset();
    mockLogOfferStage.mockReset();
    useDriverStore.setState({
      availableRide: null,
      availableRides: [],
      deferredRides: [],
      declinedOfferIds: [],
      suppressedRideIds: [],
    });
  });

  it('explains a dead, unknown ride instead of returning silently', async () => {
    // Non-vacuity: the previous `if (!ride) return` made this whole path unreachable —
    // no fetch, no notice, no RPC. The driver pressed Accept and nothing whatsoever happened.
    mockFetchDriverOfferRide.mockResolvedValue({
      ok: true,
      ride: baseRide('r1', { matching_deadline_at: PAST_DEADLINE }),
      offer: { ...liveOffer, alive: false },
    });
    const args = buildArgs();

    await acceptTrackedRide(args);

    expect(mockFetchDriverOfferRide).toHaveBeenCalledWith('r1');
    expect(args.onUnavailable).toHaveBeenCalledTimes(1);
    expect(mockAcceptRide).not.toHaveBeenCalled();
    expect(mockLogOfferStage).toHaveBeenCalledWith(
      'accept_error',
      expect.objectContaining({ phase: 'unresolved', alive: false }),
      'r1',
    );
  });

  it('resolves the offer server-side when the store has not caught up', async () => {
    // The race behind "I pressed Accept and nothing happened": the tap lands before
    // Realtime has delivered the offer row, so the store does not know the ride yet.
    const fetchedRide = baseRide('r1');
    mockFetchDriverOfferRide.mockResolvedValue({
      ok: true,
      ride: fetchedRide,
      offer: liveOffer,
    });
    mockAcceptRide.mockResolvedValue({
      success: true,
      rideId: 'r1',
      status: 'scheduled',
      overrideVehicleId: null,
    });
    const args = buildArgs();

    await acceptTrackedRide(args);

    expect(args.promoteTrackedRideToFront).toHaveBeenCalledWith(fetchedRide);
    expect(mockAcceptRide).toHaveBeenCalledWith('r1');
    expect(args.setActiveRide).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1', status: 'scheduled' }),
    );
    expect(args.onUnavailable).not.toHaveBeenCalled();
  });

  it('accepts straight from the store without a server round-trip', async () => {
    mockAcceptRide.mockResolvedValue({
      success: true,
      rideId: 'r1',
      status: 'scheduled',
      overrideVehicleId: null,
    });
    const args = buildArgs({ availableRides: [baseRide('r1')] });

    await acceptTrackedRide(args);

    expect(mockFetchDriverOfferRide).not.toHaveBeenCalled();
    expect(mockAcceptRide).toHaveBeenCalledWith('r1');
  });

  it('refuses to accept on an inactive dossier, with a message', async () => {
    mockFetchDriverOfferRide.mockResolvedValue({
      ok: true,
      ride: baseRide('r1'),
      offer: liveOffer,
    });
    const args = buildArgs({ driverStatus: 'pending_review' });

    await acceptTrackedRide(args);

    expect(mockAcceptRide).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(
      'Error',
      'Only active drivers can accept rides',
    );
    expect(mockLogOfferStage).toHaveBeenCalledWith(
      'accept_error',
      expect.objectContaining({ phase: 'dossier' }),
      'r1',
    );
  });

  it('brings an offline driver online when they accept', async () => {
    mockAcceptRide.mockResolvedValue({
      success: true,
      rideId: 'r1',
      status: 'scheduled',
      overrideVehicleId: null,
    });
    const setIsOnline = jest.fn();
    const args = buildArgs({
      isOnline: false,
      setIsOnline,
      availableRides: [baseRide('r1')],
    });

    await acceptTrackedRide(args);

    expect(setIsOnline).toHaveBeenCalledWith(true);
  });
});
