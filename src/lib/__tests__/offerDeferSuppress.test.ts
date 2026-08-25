jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  canPresentRideOffer,
  pickNextPendingRide,
  useDriverStore,
  type Ride,
} from '../stores/driverStore';
import { optionFeatherIcon, vehicleTypeIconName } from '../services/optionsCatalog';

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
});

describe('offer present / defer / suppress helpers', () => {
  it('blocks suppressed and deferred rides from presentOffer', () => {
    const ride = baseRide('r1');
    expect(
      canPresentRideOffer(ride.id, {
        suppressedRideIds: ['r1'],
        deferredRides: [],
        availableRides: [],
      }),
    ).toBe(false);

    expect(
      canPresentRideOffer(ride.id, {
        suppressedRideIds: [],
        deferredRides: [ride],
        availableRides: [],
      }),
    ).toBe(false);

    expect(
      canPresentRideOffer(ride.id, {
        suppressedRideIds: [],
        deferredRides: [],
        availableRides: [ride],
      }),
    ).toBe(false);

    expect(
      canPresentRideOffer(ride.id, {
        suppressedRideIds: [],
        deferredRides: [],
        availableRides: [],
      }),
    ).toBe(true);
  });

  it('pickNextPendingRide skips suppressed and deferred', () => {
    const a = baseRide('a');
    const b = baseRide('b');
    const c = baseRide('c');
    const next = pickNextPendingRide([a, b, c], {
      suppressedRideIds: ['a'],
      deferredRides: [b],
      availableRides: [],
    });
    expect(next?.id).toBe('c');
  });
});

describe('driverStore defer / suppress / promote', () => {
  beforeEach(() => {
    useDriverStore.setState({
      availableRide: null,
      availableRides: [],
      deferredRides: [],
      suppressedRideIds: [],
    });
  });

  it('defer moves ride to sheet queue and blocks re-present', () => {
    const ride = baseRide('defer-1');
    useDriverStore.getState().addAvailableRide(ride);
    useDriverStore.getState().deferAvailableRide(ride.id);

    const state = useDriverStore.getState();
    expect(state.availableRide).toBeNull();
    expect(state.deferredRides.map((r) => r.id)).toEqual(['defer-1']);
    expect(canPresentRideOffer(ride.id, state)).toBe(false);
  });

  it('suppress removes ride for the session', () => {
    const ride = baseRide('sup-1');
    useDriverStore.getState().addAvailableRide(ride);
    useDriverStore.getState().suppressRide(ride.id);

    const state = useDriverStore.getState();
    expect(state.availableRide).toBeNull();
    expect(state.deferredRides).toHaveLength(0);
    expect(state.suppressedRideIds).toContain('sup-1');
    expect(canPresentRideOffer(ride.id, state)).toBe(false);
  });

  it('promoteDeferredRide restores fullscreen offer', () => {
    const ride = baseRide('pro-1');
    useDriverStore.getState().addAvailableRide(ride);
    useDriverStore.getState().deferAvailableRide(ride.id);
    useDriverStore.getState().promoteDeferredRide(ride.id);

    const state = useDriverStore.getState();
    expect(state.availableRide?.id).toBe('pro-1');
    expect(state.availableRides[0]?.id).toBe('pro-1');
    expect(state.deferredRides).toHaveLength(0);
  });

  it('promoteDeferredRide puts clicked ride at front of offer queue', () => {
    const current = baseRide('pro-current');
    const clicked = baseRide('pro-clicked');
    useDriverStore.getState().addAvailableRide(current);
    useDriverStore.getState().seedDeferredRides([clicked]);
    useDriverStore.getState().promoteDeferredRide(clicked.id);

    const state = useDriverStore.getState();
    expect(state.availableRide?.id).toBe('pro-clicked');
    expect(state.availableRides.map((r) => r.id)).toEqual([
      'pro-clicked',
      'pro-current',
    ]);
    expect(state.deferredRides).toHaveLength(0);
  });

  it('seedDeferredRides fills bottomsheet without touching available offer', () => {
    const active = baseRide('seed-active');
    const a = baseRide('seed-a');
    const b = baseRide('seed-b');
    useDriverStore.getState().addAvailableRide(active);
    useDriverStore.getState().seedDeferredRides([active, a, b]);

    const state = useDriverStore.getState();
    expect(state.availableRide?.id).toBe('seed-active');
    expect(state.deferredRides.map((r) => r.id).sort()).toEqual([
      'seed-a',
      'seed-b',
    ]);
  });
});

describe('optionFeatherIcon', () => {
  it('maps known options and falls back to package', () => {
    expect(optionFeatherIcon('Siège enfant')).toBe('user');
    expect(optionFeatherIcon('WiFi à bord')).toBe('wifi');
    expect(optionFeatherIcon('unknown-option')).toBe('package');
  });
});

describe('vehicleTypeIconName', () => {
  it('maps vehicle types to car / limo / van / electric', () => {
    expect(vehicleTypeIconName('STANDARD')).toBe('car');
    expect(vehicleTypeIconName('PREMIUM')).toBe('car-limousine');
    expect(vehicleTypeIconName('VAN')).toBe('van-passenger');
    expect(vehicleTypeIconName('ELECTRIC')).toBe('car-electric');
  });
});
