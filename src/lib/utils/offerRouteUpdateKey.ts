export type OfferRouteUpdateKeyInput = {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  approachFrom?: { lat: number; lng: number } | null;
  padKey: string;
  navigationFollow: boolean;
  presentation: string;
  offerOverview: boolean;
};

/**
 * Identity for posting updateRoute.
 * GPS / driverMarker is intentionally omitted — ticks must not abort OSRM.
 */
export function buildOfferRouteUpdateKey(input: OfferRouteUpdateKeyInput): string {
  const startDigits = input.navigationFollow ? 4 : 5;
  const startKey = [
    input.start.lat.toFixed(startDigits),
    input.start.lng.toFixed(startDigits),
  ].join('|');
  const endKey = [input.end.lat.toFixed(5), input.end.lng.toFixed(5)].join('|');
  return [
    startKey,
    endKey,
    input.approachFrom?.lat?.toFixed(4) ?? '',
    input.approachFrom?.lng?.toFixed(4) ?? '',
    input.padKey,
    input.navigationFollow ? 'nav' : 'fit',
    input.presentation,
    input.offerOverview ? 'ov' : '',
  ].join('|');
}
