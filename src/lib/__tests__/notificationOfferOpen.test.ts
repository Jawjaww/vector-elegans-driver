jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockFetchDriverOfferRide = jest.fn();
const mockRespondOffer = jest.fn();

jest.mock('../../services/rideService', () => ({
  rideService: {
    fetchDriverOfferRide: (...args: unknown[]) => mockFetchDriverOfferRide(...args),
    respondOffer: (...args: unknown[]) => mockRespondOffer(...args),
    acceptRide: jest.fn(),
  },
}));

jest.mock('../notifications/offerPipelineDiag', () => ({
  logOfferStage: jest.fn(),
}));

jest.mock('../notifications/offerNotification', () => ({
  dismissOfferNotification: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

import { useDriverStore, type Ride } from '../stores/driverStore';
import { runPendingNotificationOfferOpen } from '../utils/notificationOfferOpen';

const FUTURE = new Date(Date.now() + 10 * 60_000).toISOString();

function baseRide(id: string, extra: Partial<Ride> = {}): Ride {
  return {
    id,
    user_id: 'u1',
    status: 'pending',
    pickup_address: 'A',
    pickup_lat: 0,
    pickup_lon: 0,
    dropoff_address: 'B',
    dropoff_lat: 1,
    dropoff_lon: 1,
    pickup_time: FUTURE,
    distance: 1000,
    duration: 600,
    vehicle_type: 'STANDARD',
    options: [],
    estimated_price: 20,
    final_price: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    matching_deadline_at: FUTURE,
    matching_paused_at: null,
    ...extra,
  };
}

describe('runPendingNotificationOfferOpen: a parked ride', () => {
  const ride = baseRide('ride-1');

  beforeEach(() => {
    mockFetchDriverOfferRide.mockReset();
    mockRespondOffer.mockReset();
    useDriverStore.setState({
      pendingOfferOpen: { rideId: ride.id, action: null },
      provisionalOffer: {
        rideId: ride.id,
        pickupAddress: 'A',
        dropoffAddress: 'B',
        priceLabel: '20 €',
      },
      offerArrivalSource: 'wake',
      availableRides: [],
      availableRide: null,
      deferredRides: [ride],
      declinedOfferIds: [ride.id],
      suppressedRideIds: [],
      activeRide: null,
      isOnline: true,
    });
  });

  it('does not reopen the overlay from a silent wake after Refuser', async () => {
    await runPendingNotificationOfferOpen({
      pendingOfferOpen: { rideId: ride.id, action: null },
      driverStatus: 'active',
      driverId: 'driver-1',
      storeHydrated: true,
      deferredRides: [ride],
      availableRides: [],
      isOnline: true,
      activeRideId: null,
      acceptingRideIds: new Set(),
      promoteDeferredRide: useDriverStore.getState().promoteDeferredRide,
      promoteTrackedRideToFront: useDriverStore.getState().promoteTrackedRideToFront,
      onUnavailable: jest.fn(),
      setOfferNotice: jest.fn(),
    });

    const state = useDriverStore.getState();
    expect(state.availableRides).toEqual([]);
    expect(state.deferredRides.map((row) => row.id)).toEqual(['ride-1']);
    expect(state.provisionalOffer).toBeNull();
    expect(mockFetchDriverOfferRide).not.toHaveBeenCalled();
  });

  it('reopens the overlay when the driver taps the notification', async () => {
    useDriverStore.setState({ offerArrivalSource: 'tap' });
    await runPendingNotificationOfferOpen({
      pendingOfferOpen: { rideId: ride.id, action: null },
      driverStatus: 'active',
      driverId: 'driver-1',
      storeHydrated: true,
      deferredRides: [ride],
      availableRides: [],
      isOnline: true,
      activeRideId: null,
      acceptingRideIds: new Set(),
      promoteDeferredRide: useDriverStore.getState().promoteDeferredRide,
      promoteTrackedRideToFront: useDriverStore.getState().promoteTrackedRideToFront,
      onUnavailable: jest.fn(),
      setOfferNotice: jest.fn(),
    });

    const state = useDriverStore.getState();
    expect(state.availableRides[0]?.id).toBe('ride-1');
    expect(state.deferredRides).toHaveLength(0);
  });
});
