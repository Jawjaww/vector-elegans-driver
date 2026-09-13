import { toAppRide } from '../utils/toAppRide';

describe('toAppRide', () => {
  it('coerces nullable user_id and coordinates for the store Ride', () => {
    const ride = toAppRide({
      id: 'r1',
      user_id: null,
      pickup_lat: null,
      pickup_lon: 2.35,
      status: 'pending',
      pickup_address: 'A',
      dropoff_address: 'B',
      pickup_time: '2026-09-13T08:00:00Z',
      vehicle_type: 'STANDARD',
      created_at: '2026-09-13T07:00:00Z',
      updated_at: '2026-09-13T07:00:00Z',
    });

    expect(ride.user_id).toBe('');
    expect(ride.pickup_lat).toBe(0);
    expect(ride.pickup_lon).toBe(2.35);
    expect(ride.status).toBe('pending');
  });
});
