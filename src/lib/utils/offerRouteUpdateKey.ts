export type OfferRouteUpdateKeyInput = {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  approachFrom?: { lat: number; lng: number } | null;
  padKey: string;
  navigationFollow: boolean;
  presentation: string;
  offerOverview: boolean;
  /**
   * Bumped only after an off-route latch. Navigation follow otherwise ignores
   * the moving GPS origin so ticks do not abort the in-flight OSRM request.
   */
  rerouteGeneration?: number;
};

/**
 * Identity for posting updateRoute.
 * GPS / driverMarker is intentionally omitted — ticks must not abort OSRM.
 * In navigation the origin is omitted too; a new route is a new generation.
 */
export function buildOfferRouteUpdateKey(input: OfferRouteUpdateKeyInput): string {
  const startKey = input.navigationFollow
    ? `reroute:${input.rerouteGeneration ?? 0}`
    : [input.start.lat.toFixed(5), input.start.lng.toFixed(5)].join('|');
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
