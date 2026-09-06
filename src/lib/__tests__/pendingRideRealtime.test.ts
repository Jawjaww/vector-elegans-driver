import type { Ride } from '../stores/driverStore';
import {
  isRideClaimedByMe,
  resolvePendingRideRealtimeUpdate,
} from '../utils/pendingRideRealtime';

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
  ...extra,
});

const emptyCtx = {
  availableRide: null as Ride | null,
  availableRides: [] as Ride[],
  deferredRides: [] as Ride[],
  activeRide: null as Ride | null,
  myDriverId: 'driver-me',
  acceptingRideIds: new Set<string>(),
};

describe('resolvePendingRideRealtimeUpdate', () => {
  it('does not toast when our accept UPDATE arrives while the offer is still on overlay', () => {
    const ride = baseRide('r1');
    const updated = baseRide('r1', {
      status: 'scheduled',
      driver_id: 'driver-me',
    });
    const decision = resolvePendingRideRealtimeUpdate(updated, {
      ...emptyCtx,
      availableRide: ride,
      availableRides: [ride],
    });
    expect(decision).toEqual({ action: 'drop', notifyUnavailable: false });
  });

  it('does not toast when accept is still in-flight (RPC not resolved yet)', () => {
    const ride = baseRide('r1');
    const updated = baseRide('r1', { status: 'scheduled', driver_id: 'driver-me' });
    const decision = resolvePendingRideRealtimeUpdate(updated, {
      ...emptyCtx,
      availableRide: ride,
      availableRides: [ride],
      myDriverId: null,
      acceptingRideIds: new Set(['r1']),
    });
    expect(decision).toEqual({ action: 'drop', notifyUnavailable: false });
    expect(isRideClaimedByMe(updated, {
      myDriverId: null,
      activeRide: null,
      acceptingRideIds: new Set(['r1']),
    })).toBe(true);
  });

  it('does not toast when the ride is already our active trip', () => {
    const updated = baseRide('r1', { status: 'scheduled', driver_id: 'driver-me' });
    expect(
      resolvePendingRideRealtimeUpdate(updated, {
        ...emptyCtx,
        activeRide: updated,
      }),
    ).toEqual({ action: 'ignore' });
  });

  it('toasts when another driver took the front overlay card', () => {
    const ride = baseRide('r1');
    const updated = baseRide('r1', {
      status: 'scheduled',
      driver_id: 'other-driver',
    });
    expect(
      resolvePendingRideRealtimeUpdate(updated, {
        ...emptyCtx,
        availableRide: ride,
        availableRides: [ride],
      }),
    ).toEqual({ action: 'drop', notifyUnavailable: true });
  });

  it('drops a cancelled front card with a toast', () => {
    const ride = baseRide('r1');
    const updated = baseRide('r1', { status: 'client-canceled' });
    expect(
      resolvePendingRideRealtimeUpdate(updated, {
        ...emptyCtx,
        availableRide: ride,
        availableRides: [ride],
      }),
    ).toEqual({ action: 'drop', notifyUnavailable: true });
  });

  it('silently drops a taken ride that was only in the sheet', () => {
    const ride = baseRide('r1');
    const updated = baseRide('r1', {
      status: 'scheduled',
      driver_id: 'other-driver',
    });
    expect(
      resolvePendingRideRealtimeUpdate(updated, {
        ...emptyCtx,
        deferredRides: [ride],
      }),
    ).toEqual({ action: 'drop', notifyUnavailable: false });
  });

  it('patches a still-offerable tracked ride', () => {
    const ride = baseRide('r1', { client_incentive: 0 });
    const updated = baseRide('r1', { client_incentive: 5 });
    expect(
      resolvePendingRideRealtimeUpdate(updated, {
        ...emptyCtx,
        availableRide: ride,
        availableRides: [ride],
      }),
    ).toEqual({ action: 'patch' });
  });
});
