export type LatLngPoint = { lat: number; lng: number };

export type TripMapPoints = {
  start?: LatLngPoint;
  end?: LatLngPoint;
  approachFrom?: LatLngPoint;
};

type RideCoords = {
  status: string;
  pickup_lat: number;
  pickup_lon: number;
  dropoff_lat: number;
  dropoff_lon: number;
};

function finitePoint(lat: number, lng: number): LatLngPoint | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

/**
 * Pickup→dropoff for offers; driver→pickup (or driver→dropoff when in-progress)
 * for an active trip. Approach dashed line only on offers.
 */
export function resolveTripMapPoints(input: {
  activeRide: RideCoords | null | undefined;
  offerRide: RideCoords | null | undefined;
  currentLocation?: { lat: number; lng: number } | null;
  offerApproach?: LatLngPoint;
}): TripMapPoints {
  const { activeRide, offerRide, currentLocation, offerApproach } = input;

  if (activeRide) {
    const pickup = {
      lat: activeRide.pickup_lat,
      lng: activeRide.pickup_lon,
    };
    const dropoff = {
      lat: activeRide.dropoff_lat,
      lng: activeRide.dropoff_lon,
    };
    const driver = currentLocation
      ? finitePoint(currentLocation.lat, currentLocation.lng)
      : undefined;

    if (activeRide.status === 'in-progress') {
      return {
        start: driver ?? pickup,
        end: dropoff,
        approachFrom: undefined,
      };
    }
    if (driver) {
      return { start: driver, end: pickup, approachFrom: undefined };
    }
    return { start: pickup, end: dropoff, approachFrom: undefined };
  }

  if (offerRide) {
    return {
      start: { lat: offerRide.pickup_lat, lng: offerRide.pickup_lon },
      end: { lat: offerRide.dropoff_lat, lng: offerRide.dropoff_lon },
      approachFrom: offerApproach,
    };
  }

  return { start: undefined, end: undefined, approachFrom: undefined };
}
