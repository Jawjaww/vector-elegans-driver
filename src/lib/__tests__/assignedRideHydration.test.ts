import {
  isActiveRideStatus,
  reconcileAssignedRide,
} from '../utils/assignedRideReconcile';
import type { Ride } from '../stores/driverStore';

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 'ride-1',
    user_id: 'client-1',
    status: 'scheduled',
    pickup_address: 'Rue A',
    pickup_lat: 48.85,
    pickup_lon: 2.35,
    dropoff_address: 'Rue B',
    dropoff_lat: 48.86,
    dropoff_lon: 2.36,
    pickup_time: '2026-09-27T09:00:00.000Z',
    distance: null,
    duration: null,
    vehicle_type: 'STANDARD',
    estimated_price: 10,
    final_price: null,
    created_at: '2026-09-27T08:00:00.000Z',
    updated_at: '2026-09-27T08:00:00.000Z',
    ...overrides,
  };
}

describe('isActiveRideStatus', () => {
  it('matches exactly the statuses fetchAssignedRide asks for', () => {
    expect(isActiveRideStatus('scheduled')).toBe(true);
    expect(isActiveRideStatus('in-progress')).toBe(true);
    expect(isActiveRideStatus('completed')).toBe(false);
    expect(isActiveRideStatus('client-canceled')).toBe(false);
    expect(isActiveRideStatus(null)).toBe(false);
  });
});

describe('reconcileAssignedRide', () => {
  const readStartedAt = Date.parse('2026-09-27T09:57:55.000Z');

  it('keeps the trip when the read failed', () => {
    // The failure this guards: a transient read error reaching `setActiveRide(null)`.
    const current = ride();
    const result = reconcileAssignedRide({
      current,
      fetch: { ok: false, reason: 'network' },
      readStartedAt,
    });
    expect(result).toEqual({ next: current, action: 'read_failed' });
  });

  it('keeps a ride accepted after the read was issued', () => {
    // Measured race: the boot read started at 09:57:55, accept_ride landed at 09:57:58.9,
    // and the answer "no ride" was about a question asked before the ride existed.
    const current = ride({ accepted_at: '2026-09-27T09:57:58.920Z' });
    const result = reconcileAssignedRide({
      current,
      fetch: { ok: true, ride: null },
      readStartedAt,
    });
    expect(result).toEqual({ next: current, action: 'kept_accept_race' });
  });

  it('releases the trip when a later read confirms no ride', () => {
    // Non-vacuity for the guard above: without the acceptance timestamp comparison this
    // stays "kept" too, and a ride canceled while the app was closed never clears.
    const current = ride({ accepted_at: '2026-09-26T20:00:00.000Z' });
    const result = reconcileAssignedRide({
      current,
      fetch: { ok: true, ride: null },
      readStartedAt,
    });
    expect(result).toEqual({ next: null, action: 'released' });
  });

  it('releases a persisted ride that carries no acceptance time', () => {
    const result = reconcileAssignedRide({
      current: ride({ accepted_at: null }),
      fetch: { ok: true, ride: null },
      readStartedAt,
    });
    expect(result.action).toBe('released');
  });

  it('adopts a ride the device did not know about', () => {
    const assigned = ride({ id: 'ride-2' });
    const result = reconcileAssignedRide({
      current: null,
      fetch: { ok: true, ride: assigned },
      readStartedAt,
    });
    expect(result).toEqual({ next: assigned, action: 'adopted' });
  });

  it('refreshes the ride already open instead of replacing it', () => {
    const assigned = ride({ driver_arrived_at: '2026-09-27T09:59:00.000Z' });
    const result = reconcileAssignedRide({
      current: ride(),
      fetch: { ok: true, ride: assigned },
      readStartedAt,
    });
    expect(result).toEqual({ next: assigned, action: 'refreshed' });
  });

  it('does nothing at all when neither side has a ride', () => {
    const result = reconcileAssignedRide({
      current: null,
      fetch: { ok: true, ride: null },
      readStartedAt,
    });
    expect(result).toEqual({ next: null, action: 'unchanged' });
  });
});
