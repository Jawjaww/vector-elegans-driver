import type { RefObject } from 'react';
import { ViewStyle, StyleProp } from 'react-native';

export type LatLng = {
  lat: number;
  lng: number;
};

export interface DriverMarker {
  id: string;
  position: LatLng;
  heading?: number;
  status?: 'idle' | 'en_route' | 'on_trip';
  name?: string;
}

export type NavManeuverInfo = {
  type: string;
  modifier?: string | null;
  distanceMeters: number;
  name?: string;
};

export interface MapProps {
  initialCenter?: LatLng;
  initialZoom?: number;
  /** Trip pickup (or route start) */
  start?: LatLng;
  /** Trip dropoff (or route end) */
  end?: LatLng;
  /** Optional driver GPS → dashed approach to start */
  approachFrom?: LatLng;
  drivers?: DriverMarker[];
  followUser?: boolean;
  /** Street-level camera follow (bearing + pitch) while on an active trip */
  navigationFollow?: boolean;
  showRoute?: boolean;
  /**
   * `offer` = overview Europe then single fitBounds after OSRM + `routePresented`.
   */
  presentation?: 'default' | 'offer';
  /** Remount WebView HTML when this key changes (avoid for offers — reuse home map). */
  mapInstanceKey?: string;
  /** Extra bottom padding when fitting route (overlay height in px) */
  routeFitPaddingBottom?: number;
  /**
   * Full fitBounds padding (e.g. offer modal viewport hole on a fullscreen map).
   * When set, overrides the uniform defaults / routeFitPaddingBottom.
   */
  routeFitPadding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /**
   * When true (with presentation=offer), camera jumps to Western Europe overview
   * before fetching the route.
   */
  offerOverview?: boolean;
  /**
   * After the user pans/zooms, wait this long then recenter on GPS
   * (idle and navigation). Default 8000.
   */
  idleRecenterMs?: number;
  /** Space above bottom sheet for the recenter FAB (px from bottom of map). */
  recenterBottomOffset?: number;
  /** Called when GPS camera follow is paused/resumed after user map gestures. */
  onFollowPausedChange?: (paused: boolean) => void;
  /** Parent assigns resumeFollow for an external recenter FAB. */
  resumeFollowRef?: RefObject<(() => void) | null>;
  style?: StyleProp<ViewStyle>;
  onMapPress?: (coord: LatLng) => void;
  onRouteReady?: (
    distanceMeters: number,
    durationSeconds: number,
    nextManeuver?: NavManeuverInfo | null,
  ) => void;
  /** Fired once when offer map has OSRM + final camera (presentation=offer). */
  onRoutePresented?: () => void;
  onLocationUpdate?: (coord: LatLng) => void;
  onMapReady?: () => void;
  /** Fired when the user drags/zooms/rotates the map (not programmatic camera). */
  onUserMapInteract?: () => void;
}
