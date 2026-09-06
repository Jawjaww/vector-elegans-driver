jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { useDriverStore, type Ride } from '../stores/driverStore';
import {
  hydratePendingOffers,
  newlyStackedOfferIds,
  selectFreshHydrateRides,
} from '../utils/offerHydrate';

const baseRide = (id: string): Ride => ({
  id,
  user_id: 'u1',
  status: 'pending',
  pickup_address: 'A',
  pickup_lat: 0,
  pickup_lon: 0,
  dropoff_address: 'B',
  dropoff_lat: 1,
  dropoff_lon: 1,
  pickup_time: new Date().toISOString(),
  distance: 1000,
  duration: 600,
  vehicle_type: 'STANDARD',
  options: [],
  estimated_price: 20,
  final_price: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  matching_deadline_at: new Date(Date.now() + 60_000).toISOString(),
  matching_paused_at: null,
});

describe('hydratePendingOffers', () => {
  beforeEach(() => {
    useDriverStore.setState({
      availableRide: null,
      availableRides: [],
      deferredRides: [],
      declinedOfferIds: [],
      suppressedRideIds: [],
      activeRide: null,
    });
  });

  it('fills the overlay to 4 when realtime already queued one ride', () => {
    const r1 = baseRide('r1');
    const pending = [r1, baseRide('r2'), baseRide('r3'), baseRide('r4')];
    useDriverStore.getState().addAvailableRide(r1);

    const gate = useDriverStore.getState();
    const stackIdsBefore = gate.availableRides.map((r) => r.id);
    const recordIds = hydratePendingOffers({
      pending,
      gate,
      stackIdsBefore,
      addAvailableRide: useDriverStore.getState().addAvailableRide,
      getStackIdsAfter: () =>
        useDriverStore.getState().availableRides.map((r) => r.id),
    });

    expect(useDriverStore.getState().availableRides.map((r) => r.id)).toEqual([
      'r1',
      'r2',
      'r3',
      'r4',
    ]);
    expect(recordIds).toEqual(['r2', 'r3', 'r4']);
  });

  it('overflows extra pending into the bottomsheet without re-recording the front card', () => {
    const r1 = baseRide('r1');
    useDriverStore.getState().addAvailableRide(r1);
    const pending = [
      r1,
      baseRide('r2'),
      baseRide('r3'),
      baseRide('r4'),
      baseRide('r5'),
    ];
    const gate = useDriverStore.getState();
    const recordIds = hydratePendingOffers({
      pending,
      gate,
      stackIdsBefore: ['r1'],
      addAvailableRide: useDriverStore.getState().addAvailableRide,
      getStackIdsAfter: () =>
        useDriverStore.getState().availableRides.map((r) => r.id),
    });

    const state = useDriverStore.getState();
    expect(state.availableRides.map((r) => r.id)).toEqual([
      'r1',
      'r2',
      'r3',
      'r4',
    ]);
    expect(state.deferredRides.map((r) => r.id)).toEqual(['r5']);
    expect(recordIds).toEqual(['r2', 'r3', 'r4']);
  });

  it('does not re-present declined or already stacked ids', () => {
    const stacked = baseRide('live');
    const declined = baseRide('nope');
    useDriverStore.getState().addAvailableRide(stacked);
    useDriverStore.setState({ declinedOfferIds: ['nope'] });

    const gate = useDriverStore.getState();
    expect(selectFreshHydrateRides([stacked, declined, baseRide('fresh')], gate).map((r) => r.id)).toEqual(
      ['fresh'],
    );
    expect(newlyStackedOfferIds(['live'], ['live', 'fresh'])).toEqual(['fresh']);
  });
});

describe('setCurrentLocation', () => {
  it('is a no-op for GPS jitter below the store threshold', () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    useDriverStore.setState({ currentLocation: paris });
    const before = useDriverStore.getState().currentLocation;
    useDriverStore.getState().setCurrentLocation({
      lat: 48.85662,
      lng: 2.3522,
    });
    expect(useDriverStore.getState().currentLocation).toBe(before);
  });
});
