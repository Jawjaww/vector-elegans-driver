export const ASSIGNED_TRIP_STATUSES = ['scheduled', 'in-progress'] as const;

export type DriverDuty = 'offline' | 'available' | 'on_trip';

export function isAssignedTripStatus(
  status: string | null | undefined,
): boolean {
  return status === 'scheduled' || status === 'in-progress';
}

export function resolveDriverDuty(
  isOnline: boolean,
  activeRide: { status: string } | null,
): DriverDuty {
  if (activeRide && isAssignedTripStatus(activeRide.status)) return 'on_trip';
  if (isOnline) return 'available';
  return 'offline';
}

/** First assigned-ride hydrate this process: turn the switch on (in service). */
export function shouldForceOnlineOnAssignedHydrate(
  alreadyHydratedThisSession: boolean,
  hasAssignedRide: boolean,
): boolean {
  return hasAssignedRide && !alreadyHydratedThisSession;
}

export function onlineStatusCopyKeys(
  duty: DriverDuty,
  isOnline: boolean,
): { titleKey: string; subtitleKey: string } {
  if (duty === 'on_trip') {
    return {
      titleKey: 'dashboard.onTrip',
      subtitleKey: isOnline
        ? 'dashboard.stayAvailableAfter'
        : 'dashboard.offlineAfterTrip',
    };
  }
  if (duty === 'available') {
    return {
      titleKey: 'dashboard.available',
      subtitleKey: 'dashboard.receivingRides',
    };
  }
  return {
    titleKey: 'dashboard.available',
    subtitleKey: 'dashboard.offlineNoOffers',
  };
}
