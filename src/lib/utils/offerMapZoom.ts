import { geoDistanceMeters, type GeoPt } from './markerDeclutter';

/** MapLibre/OSRM coordinate tuple [lng, lat]. */
export type LngLat = [number, number];

export type OfferFitCamera = {
  maxZoom: number;
  boundsExpand: number;
};

/** Long-trip fallback — matches legacy offerCardLayout constants. */
export const OFFER_FIT_CAMERA_LONG_TRIP: OfferFitCamera = {
  maxZoom: 10,
  boundsExpand: 1.38,
};

/**
 * Max great-circle distance (km) among all fitBounds coordinates.
 * Uses pairwise max — good enough for offer framing tiers.
 */
export function computeFitSpanKm(coords: LngLat[]): number {
  if (coords.length < 2) return 0;

  let maxMeters = 0;
  for (let i = 0; i < coords.length; i += 1) {
    for (let j = i + 1; j < coords.length; j += 1) {
      const a: GeoPt = { lng: coords[i][0], lat: coords[i][1] };
      const b: GeoPt = { lng: coords[j][0], lat: coords[j][1] };
      const d = geoDistanceMeters(a, b);
      if (d > maxMeters) maxMeters = d;
    }
  }
  return maxMeters / 1000;
}

/** Flatten nested coord lists from fitBounds payloads. */
export function flattenFitCoordLists(coordLists: LngLat[][]): LngLat[] {
  const out: LngLat[] = [];
  for (const list of coordLists) {
    if (!list?.length) continue;
    for (const c of list) {
      if (c && c.length >= 2) out.push(c);
    }
  }
  return out;
}

/**
 * Distance-aware camera for offer-mode fitBounds.
 * Short spans allow higher maxZoom and minimal bounds expansion.
 */
export function resolveOfferFitCamera(spanKm: number): OfferFitCamera {
  if (spanKm < 2) return { maxZoom: 15, boundsExpand: 1.0 };
  if (spanKm < 5) return { maxZoom: 14, boundsExpand: 1.02 };
  if (spanKm < 15) return { maxZoom: 12, boundsExpand: 1.12 };
  return OFFER_FIT_CAMERA_LONG_TRIP;
}

/** Injected into the MapLibre WebView HTML (no module loader). */
export function offerMapZoomScriptBlock(): string {
  return `
    function __veGeoDistanceMeters(a, b) {
      var toRad = Math.PI / 180;
      var dLat = (b.lat - a.lat) * toRad;
      var dLng = (b.lng - a.lng) * toRad;
      var lat1 = a.lat * toRad;
      var lat2 = b.lat * toRad;
      var h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function __veFlattenFitCoordLists(coordLists) {
      var out = [];
      if (!coordLists) return out;
      coordLists.forEach(function (list) {
        if (!list || !list.length) return;
        list.forEach(function (c) {
          if (c && c.length >= 2) out.push(c);
        });
      });
      return out;
    }

    function computeFitSpanKm(coordLists) {
      var coords = __veFlattenFitCoordLists(coordLists);
      if (coords.length < 2) return 0;
      var maxM = 0;
      for (var i = 0; i < coords.length; i++) {
        for (var j = i + 1; j < coords.length; j++) {
          var a = { lng: coords[i][0], lat: coords[i][1] };
          var b = { lng: coords[j][0], lat: coords[j][1] };
          var d = __veGeoDistanceMeters(a, b);
          if (d > maxM) maxM = d;
        }
      }
      return maxM / 1000;
    }

    function resolveOfferFitCamera(spanKm) {
      if (spanKm < 2) return { maxZoom: 15, boundsExpand: 1.0 };
      if (spanKm < 5) return { maxZoom: 14, boundsExpand: 1.02 };
      if (spanKm < 15) return { maxZoom: 12, boundsExpand: 1.12 };
      return { maxZoom: 10, boundsExpand: 1.38 };
    }
  `;
}
