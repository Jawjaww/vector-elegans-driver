import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Dimensions } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import type { MapControllerRef } from '../map/types';
import type { Ride } from '../lib/stores/driverStore';
import {
  computeFullscreenOfferFitPadding,
  type FitPadding,
} from '../lib/utils/offerMapFit';
import { seedOfferApproach } from '../lib/utils/offerApproach';
import { resolveTripMapPoints } from '../lib/utils/tripMapPoints';

function resolveMapRouteRide(args: {
  activeRide: Ride | null;
  availableRides: Ride[];
}): Ride | null {
  if (args.activeRide) return args.activeRide;
  return args.availableRides[0] ?? null;
}

function clearOfferMapSession(args: {
  setActiveOfferIndex: (index: number) => void;
  setOfferApproach: (value: undefined) => void;
  mapControllerRef: RefObject<MapControllerRef | null>;
}) {
  args.setActiveOfferIndex(0);
  args.setOfferApproach(undefined);
  args.mapControllerRef.current?.clearRoute();
}

type UseDashboardOfferMapOptions = {
  activeRide: Ride | null;
  canReceiveOffers: boolean;
  availableRides: Ride[];
  currentLocation: { lat: number; lng: number } | null;
  insets: EdgeInsets;
  offerOverlayBand: number;
  mapControllerRef: RefObject<MapControllerRef | null>;
};

export function useDashboardOfferMap({
  activeRide,
  canReceiveOffers,
  availableRides,
  currentLocation,
  insets,
  offerOverlayBand,
  mapControllerRef,
}: UseDashboardOfferMapOptions) {
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);
  const [offerApproach, setOfferApproach] = useState<
    { lat: number; lng: number } | undefined
  >();
  const mapBackgroundReleasedRef = useRef(false);
  const seededApproachOfferIdRef = useRef<string | null>(null);

  const showOfferCarousel = Boolean(
    canReceiveOffers && !activeRide && availableRides.length > 0,
  );

  const offerRide = showOfferCarousel ? availableRides[0] ?? null : null;

  const mapRouteRide = useMemo(
    () =>
      resolveMapRouteRide({
        activeRide,
        availableRides,
      }),
    [activeRide, availableRides],
  );

  const screenSize = useMemo(() => Dimensions.get('window'), []);
  const offerTopInset = insets.top + 48;

  const offerFitPadding: FitPadding | undefined = useMemo(() => {
    if (!mapRouteRide || activeRide) return undefined;
    return computeFullscreenOfferFitPadding(screenSize, {
      topInset: offerTopInset,
      bottomSheetBand: offerOverlayBand,
    });
  }, [activeRide, mapRouteRide, offerOverlayBand, offerTopInset, screenSize]);

  const tripMapPoints = useMemo(
    () =>
      resolveTripMapPoints({
        activeRide,
        offerRide: mapRouteRide,
        currentLocation,
        offerApproach:
          mapRouteRide && !activeRide ? offerApproach : undefined,
      }),
    [activeRide, currentLocation, mapRouteRide, offerApproach],
  );

  const mapInOfferMode = Boolean(!activeRide && mapRouteRide);
  const mapShowRoute = Boolean(
    tripMapPoints.start && tripMapPoints.end && (activeRide || mapRouteRide),
  );

  useEffect(() => {
    const reset = () =>
      clearOfferMapSession({
        setActiveOfferIndex,
        setOfferApproach,
        mapControllerRef,
      });

    if (!canReceiveOffers || availableRides.length === 0) {
      reset();
    }
  }, [availableRides.length, canReceiveOffers, mapControllerRef]);

  useEffect(() => {
    if (!offerRide?.id) {
      seededApproachOfferIdRef.current = null;
      setOfferApproach(undefined);
      return;
    }
    if (seededApproachOfferIdRef.current !== offerRide.id) {
      seededApproachOfferIdRef.current = offerRide.id;
      setOfferApproach(seedOfferApproach(undefined, currentLocation));
      return;
    }
    setOfferApproach((prev) => seedOfferApproach(prev, currentLocation));
  }, [currentLocation, offerRide?.id]);

  useEffect(() => {
    if (activeRide || !canReceiveOffers) return;
    if (mapRouteRide) {
      mapBackgroundReleasedRef.current = false;
      return;
    }
    if (mapBackgroundReleasedRef.current) return;
    mapBackgroundReleasedRef.current = true;
    requestAnimationFrame(() => {
      mapControllerRef.current?.clearRoute();
    });
  }, [activeRide, canReceiveOffers, mapRouteRide, mapControllerRef]);

  return {
    activeOfferIndex,
    setActiveOfferIndex,
    showOfferCarousel,
    mapRouteRide,
    mapInOfferMode,
    mapShowRoute,
    offerFitPadding,
    tripMapPoints,
  };
}
