import {
  onlineStatusCopyKeys,
  resolveDriverDuty,
  shouldForceOnlineOnAssignedHydrate,
} from '../utils/driverDuty';

describe('resolveDriverDuty', () => {
  it('is on_trip while a scheduled or in-progress ride is assigned', () => {
    expect(
      resolveDriverDuty(false, { status: 'scheduled' }),
    ).toBe('on_trip');
    expect(
      resolveDriverDuty(true, { status: 'in-progress' }),
    ).toBe('on_trip');
  });

  it('is available only when online and not on a trip', () => {
    expect(resolveDriverDuty(true, null)).toBe('available');
    expect(resolveDriverDuty(false, null)).toBe('offline');
    expect(
      resolveDriverDuty(true, { status: 'completed' }),
    ).toBe('available');
  });
});

describe('shouldForceOnlineOnAssignedHydrate', () => {
  it('turns the switch on once per session when a trip is restored', () => {
    expect(shouldForceOnlineOnAssignedHydrate(false, true)).toBe(true);
    expect(shouldForceOnlineOnAssignedHydrate(true, true)).toBe(false);
    expect(shouldForceOnlineOnAssignedHydrate(false, false)).toBe(false);
  });
});

describe('onlineStatusCopyKeys', () => {
  it('explains after-trip matching intent while on a trip', () => {
    expect(onlineStatusCopyKeys('on_trip', true).subtitleKey).toBe(
      'dashboard.stayAvailableAfter',
    );
    expect(onlineStatusCopyKeys('on_trip', false).subtitleKey).toBe(
      'dashboard.offlineAfterTrip',
    );
  });
});
