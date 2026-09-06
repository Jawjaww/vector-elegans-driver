import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useTransition,
} from 'react';
import {
  StyleSheet,
  View,
  Alert,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import type { MapProps, LatLng, DriverMarker, MapBounds, MapViewportCrop } from './types';
import { buildMapHtmlTemplate } from './mapHtmlTemplate';
import { buildOfferRouteUpdateKey } from '../lib/utils/offerRouteUpdateKey';

type PrefetchMode = 'normal' | 'aggressive' | 'disabled';

interface PrefetchConfig {
  enabled: boolean;
  aggressiveMode: boolean;
  debugMode: boolean;
}

interface MapMessage {
  type: string;
  [key: string]: unknown;
}

const DEFAULT_IDLE_RECENTER_MS = 8000;
/** Tight follow zoom when a trip is active (not offer overview). */
const NAV_FOLLOW_ZOOM = 18;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function readMapMessageString(msg: MapMessage, key: string): string {
  const value = msg[key];
  return typeof value === 'string' ? value : '';
}

type SnapshotWaiter = {
  resolve: (uri: string | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};

function resolveSnapshotWaiter(
  waiters: Map<string, SnapshotWaiter>,
  rideId: string,
  dataUrl: string | null,
) {
  const waiter = waiters.get(rideId);
  if (!waiter) return;
  clearTimeout(waiter.timeout);
  waiters.delete(rideId);
  waiter.resolve(dataUrl);
}

function handleMapConsoleMessage(msg: MapMessage) {
  const args = msg.args as unknown[] | undefined;
  if (msg.level === 'error') {
    console.error('[Map]', ...(args ?? []));
    return;
  }
  if (msg.level === 'warn') {
    console.warn('[Map]', ...(args ?? []));
    return;
  }
  console.log('[Map]', ...(args ?? []));
}

function handleMapRouteInfoMessage(
  msg: MapMessage,
  onRouteReady: MapProps['onRouteReady'],
) {
  const distanceMeters = Number(
    msg.distanceMeters ?? (Number(msg.distance) || 0) * 1000,
  );
  const durationSeconds = Number(
    msg.durationSeconds ?? (Number(msg.duration) || 0) * 60,
  );
  const next = msg.nextManeuver as
    | {
        type?: string;
        modifier?: string | null;
        distanceMeters?: number;
        name?: string;
      }
    | null
    | undefined;

  onRouteReady?.(
    distanceMeters,
    durationSeconds,
    next?.type
      ? {
          type: String(next.type),
          modifier: next.modifier ?? null,
          distanceMeters: Number(next.distanceMeters) || 0,
          name: typeof next.name === 'string' ? next.name : '',
        }
      : null,
  );
}

type WebViewMapMessageContext = {
  isMapReadyRef: { current: boolean };
  locationRef: { current: LatLng };
  routePresentedSentRef: { current: boolean };
  snapshotWaitersRef: { current: Map<string, SnapshotWaiter> };
  startMapTransition: (fn: () => void) => void;
  setIsMapReady: (ready: boolean) => void;
  onMapReady?: () => void;
  shouldFollowCamera: () => boolean;
  postGpsCamera: (coords: LatLng, follow: boolean, heading?: number) => void;
  handleUserMapInteract: () => void;
  onRouteReady?: NonNullable<MapProps['onRouteReady']>;
  onRoutePresented?: () => void;
  onOfferRouteFramed?: (rideId: string) => void;
  onOfferRouteCaptureReady?: (rideId: string) => void;
  onOfferRouteCaptureFailed?: (rideId: string, error?: string) => void;
  onMapSnapshot?: (rideId: string, dataUrl: string) => void;
  onMapSnapshotError?: (rideId: string, error?: string) => void;
};

function dispatchWebViewMapMessage(
  msg: MapMessage,
  ctx: WebViewMapMessageContext,
): void {
  switch (msg.type) {
    case 'mapError':
      console.error('[WebView] mapError', msg.error);
      break;
    case 'console':
      handleMapConsoleMessage(msg);
      break;
    case 'mapReady':
      ctx.isMapReadyRef.current = true;
      ctx.startMapTransition(() => {
        ctx.setIsMapReady(true);
      });
      ctx.onMapReady?.();
      if (ctx.shouldFollowCamera()) {
        ctx.postGpsCamera(ctx.locationRef.current, true);
      } else if (ctx.locationRef.current) {
        ctx.postGpsCamera(ctx.locationRef.current, false);
      }
      break;
    case 'userMapInteract':
      ctx.handleUserMapInteract();
      break;
    case 'routeInfo':
      handleMapRouteInfoMessage(msg, ctx.onRouteReady);
      break;
    case 'routePresented':
      if (!ctx.routePresentedSentRef.current) {
        ctx.routePresentedSentRef.current = true;
        ctx.onRoutePresented?.();
      }
      break;
    case 'offerRouteFramed': {
      const rideId = readMapMessageString(msg, 'rideId');
      if (rideId) ctx.onOfferRouteFramed?.(rideId);
      break;
    }
    case 'offerRouteCaptureReady': {
      const rideId = readMapMessageString(msg, 'rideId');
      if (rideId) ctx.onOfferRouteCaptureReady?.(rideId);
      break;
    }
    case 'offerRouteCaptureFailed': {
      const rideId = readMapMessageString(msg, 'rideId');
      if (rideId) {
        ctx.onOfferRouteCaptureFailed?.(
          rideId,
          readMapMessageString(msg, 'error'),
        );
      }
      break;
    }
    case 'mapSnapshot': {
      const rideId = readMapMessageString(msg, 'rideId');
      const dataUrl = readMapMessageString(msg, 'dataUrl');
      resolveSnapshotWaiter(ctx.snapshotWaitersRef.current, rideId, dataUrl || null);
      if (rideId && dataUrl) {
        ctx.onMapSnapshot?.(rideId, dataUrl);
      }
      break;
    }
    case 'mapSnapshotError': {
      const rideId = readMapMessageString(msg, 'rideId');
      resolveSnapshotWaiter(ctx.snapshotWaitersRef.current, rideId, null);
      ctx.onMapSnapshotError?.(rideId, readMapMessageString(msg, 'error'));
      break;
    }
    default:
      break;
  }
}

export function WebViewMap({
  initialCenter,
  initialZoom = 14,
  start,
  end,
  approachFrom,
  drivers = [],
  followUser = true,
  navigationFollow = false,
  showRoute = true,
  presentation = 'default',
  offerOverview = false,
  offerSnapshotMode = false,
  driverMarker,
  offerSnapshotRideId,
  offerSnapshotAttempt = 0,
  mapInstanceKey,
  routeFitPaddingBottom = 48,
  routeFitPadding,
  idleRecenterMs = DEFAULT_IDLE_RECENTER_MS,
  style,
  onMapReady,
  onRouteReady,
  onRoutePresented,
  onOfferRouteFramed,
  onOfferRouteCaptureReady,
  onOfferRouteCaptureFailed,
  onLocationUpdate,
  onUserMapInteract,
  onFollowPausedChange,
  resumeFollowRef,
  mapControllerRef,
  onMapSnapshot,
  onMapSnapshotError,
  prefetchConfig = {
    enabled: true,
    aggressiveMode: false,
    debugMode: false,
  },
}: MapProps & {
  drivers?: DriverMarker[];
  prefetchConfig?: PrefetchConfig;
}) {
  const webViewRef = useRef<WebView>(null);
  const appState = useRef(AppState.currentState);

  const seedCenter = initialCenter ?? { lat: 48.8566, lng: 2.3522 };
  const [location, setLocation] = useState<LatLng>(seedCenter);
  const [isMapReady, setIsMapReady] = useState(false);

  const locationRef = useRef(location);
  const followPausedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationFollowRef = useRef(navigationFollow);
  const isMapReadyRef = useRef(false);
  const lastHeadingRef = useRef<number | undefined>(undefined);
  const routePresentedSentRef = useRef(false);
  const lastRouteKey = useRef<string>('');
  const snapshotWaitersRef = useRef(
    new Map<string, { resolve: (uri: string | null) => void; timeout: ReturnType<typeof setTimeout> }>(),
  );
  const lastPrefetchCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const prefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SNAPSHOT_TIMEOUT_MS = 12000;

  const [, startMapTransition] = useTransition();

  const htmlContent = useMemo(
    () => buildMapHtmlTemplate(seedCenter, prefetchConfig, initialZoom),
    // Offer: remount HTML per mapInstanceKey + seed. Default home: stable HTML once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    mapInstanceKey != null
      ? [mapInstanceKey, seedCenter.lat, seedCenter.lng, initialZoom]
      : [],
  );

  // Remount resets internal map-ready until WebView fires mapReady again
  useEffect(() => {
    if (mapInstanceKey == null) return;
    isMapReadyRef.current = false;
    routePresentedSentRef.current = false;
    lastRouteKey.current = '';
    setIsMapReady(false);
    setLocation(seedCenter);
  }, [mapInstanceKey, seedCenter.lat, seedCenter.lng]);

  const postToMap = useCallback((payload: Record<string, unknown>) => {
    const json = JSON.stringify(payload);
    webViewRef.current?.injectJavaScript(
      `(function(){try{if(window.__veHandleNativeMessage){window.__veHandleNativeMessage({data:${JSON.stringify(json)}});} }catch(e){console.error(e);}true;})();`,
    );
  }, []);

  const requestSnapshot = useCallback(
    (rideId: string, crop?: MapViewportCrop): Promise<string | null> => {
      return new Promise((resolve) => {
        const existing = snapshotWaitersRef.current.get(rideId);
        if (existing) {
          clearTimeout(existing.timeout);
        }
        const timeout = setTimeout(() => {
          snapshotWaitersRef.current.delete(rideId);
          resolve(null);
        }, SNAPSHOT_TIMEOUT_MS);
        snapshotWaitersRef.current.set(rideId, { resolve, timeout });
        postToMap({ type: 'captureSnapshot', rideId, crop: crop ?? null });
      });
    },
    [postToMap],
  );

  const prefetchBounds = useCallback(
    (bounds: MapBounds, zoomLevels: number[] = [10, 11, 12]) => {
      postToMap({ type: 'prefetchBounds', bounds, zoomLevels });
    },
    [postToMap],
  );

  const clearRouteOnMap = useCallback(() => {
    lastRouteKey.current = '';
    routePresentedSentRef.current = false;
    postToMap({ type: 'clearRoute' });
  }, [postToMap]);

  useEffect(() => {
    if (!mapControllerRef) return;
    mapControllerRef.current = {
      requestSnapshot,
      prefetchBounds,
      clearRoute: clearRouteOnMap,
    };
    return () => {
      mapControllerRef.current = null;
    };
  }, [mapControllerRef, requestSnapshot, prefetchBounds, clearRouteOnMap]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    navigationFollowRef.current = navigationFollow;
  }, [navigationFollow]);

  const setPaused = useCallback(
    (paused: boolean) => {
      followPausedRef.current = paused;
      onFollowPausedChange?.(paused);
    },
    [onFollowPausedChange],
  );

  const postGpsCamera = useCallback(
    (coords: LatLng, followCamera: boolean, heading?: number) => {
      if (typeof heading === 'number') {
        lastHeadingRef.current = heading;
      }
      const nav = navigationFollowRef.current;
      postToMap({
        type: 'gpsUpdate',
        coords: [coords.lng, coords.lat],
        zoom: nav ? NAV_FOLLOW_ZOOM : 16,
        heading: heading ?? lastHeadingRef.current,
        pitch: nav ? 50 : 0,
        duration: nav ? 400 : 800,
        followCamera,
      });
    },
    [postToMap],
  );

  const shouldFollowCamera = useCallback(() => {
    return (followUser || navigationFollow) && !followPausedRef.current;
  }, [followUser, navigationFollow]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const resumeFollow = useCallback(() => {
    clearIdleTimer();
    setPaused(false);
    if (!isMapReadyRef.current) return;
    postGpsCamera(locationRef.current, true, lastHeadingRef.current);
  }, [clearIdleTimer, postGpsCamera, setPaused]);

  useEffect(() => {
    if (!resumeFollowRef) return;
    resumeFollowRef.current = resumeFollow;
    return () => {
      resumeFollowRef.current = null;
    };
  }, [resumeFollow, resumeFollowRef]);

  const scheduleIdleRecenter = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      resumeFollow();
    }, idleRecenterMs);
  }, [clearIdleTimer, idleRecenterMs, resumeFollow]);

  const handleUserMapInteract = useCallback(() => {
    if (!followUser && !navigationFollow) return;
    setPaused(true);
    onUserMapInteract?.();
    scheduleIdleRecenter();
  }, [followUser, navigationFollow, onUserMapInteract, scheduleIdleRecenter, setPaused]);

  const handleGPSPosition = useCallback(
    (pos: Location.LocationObject) => {
      const newLoc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      startMapTransition(() => {
        setLocation(newLoc);
        onLocationUpdate?.(newLoc);
      });

      if (isMapReadyRef.current) {
        const prev = lastPrefetchCenterRef.current;
        const movedKm =
          prev != null
            ? haversineKm(prev.lat, prev.lng, newLoc.lat, newLoc.lng)
            : Infinity;
        if (prev == null || movedKm > 2) {
          if (prefetchDebounceRef.current) {
            clearTimeout(prefetchDebounceRef.current);
          }
          prefetchDebounceRef.current = setTimeout(() => {
            prefetchDebounceRef.current = null;
            lastPrefetchCenterRef.current = newLoc;
            const pad = 0.08;
            prefetchBounds(
              [
                [newLoc.lng - pad, newLoc.lat - pad],
                [newLoc.lng + pad, newLoc.lat + pad],
              ],
              [10, 11, 12],
            );
          }, prev == null ? 0 : 30000);
        }
      }

      if (!isMapReadyRef.current) return;

      const heading =
        typeof pos.coords.heading === 'number' &&
        Number.isFinite(pos.coords.heading) &&
        pos.coords.heading >= 0
          ? pos.coords.heading
          : undefined;

      // Puck always updates; camera follows in home GPS or active-trip navigation.
      postGpsCamera(newLoc, shouldFollowCamera(), heading);
    },
    [onLocationUpdate, postGpsCamera, prefetchBounds, shouldFollowCamera, startMapTransition],
  );

  useEffect(() => {
    if (!navigationFollow || !isMapReady) return;
    setPaused(false);
    postGpsCamera(locationRef.current, true, lastHeadingRef.current);
  }, [navigationFollow, isMapReady, postGpsCamera, setPaused]);

  useEffect(() => {
    let watch: Location.LocationSubscription | null = null;
    let cancelled = false;

    const setupGPSTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'GPS requis',
          'Active la localisation pour utiliser la map.',
        );
        return;
      }

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          handleGPSPosition(current);
        }
      } catch {
        // Watch below will still deliver a fix
      }

      if (cancelled) return;

      watch = await Location.watchPositionAsync(
        navigationFollow
          ? {
              accuracy: Location.Accuracy.High,
              timeInterval: 1500,
              distanceInterval: 8,
            }
          : {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 5000,
              distanceInterval: 25,
            },
        handleGPSPosition,
      );
    };

    void setupGPSTracking();

    return () => {
      cancelled = true;
      watch?.remove();
      clearIdleTimer();
    };
  }, [
    handleGPSPosition,
    navigationFollow,
    clearIdleTimer,
  ]);

  const getPrefetchModeForState = (state: AppStateStatus): PrefetchMode => {
    if (state === 'background') {
      return 'disabled';
    }
    return prefetchConfig.aggressiveMode ? 'aggressive' : 'normal';
  };

  const handleAppStateChange = useCallback(
    (state: AppStateStatus) => {
      appState.current = state;

      const newMode = getPrefetchModeForState(state);
      postToMap({ type: 'setPrefetchMode', mode: newMode });

      if (state === 'active') {
        webViewRef.current?.injectJavaScript(
          `(function(){try{if(window.__veResizeMap)window.__veResizeMap();}catch(e){}true;})();`,
        );
      }
    },
    [prefetchConfig.aggressiveMode, postToMap],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  useEffect(() => {
    if (!isMapReady) return;

    if (!showRoute || !start || !end) {
      lastRouteKey.current = '';
      routePresentedSentRef.current = false;
      postToMap({ type: 'clearRoute' });
      return;
    }

    const padKey = routeFitPadding
      ? [
          routeFitPadding.top,
          routeFitPadding.right,
          routeFitPadding.bottom,
          routeFitPadding.left,
        ].join(',')
      : String(routeFitPaddingBottom);

    // Overview Europe only on the first offer paint — padding-only refits stay local.
    const useOfferOverview =
      presentation === 'offer' &&
      offerOverview &&
      !routePresentedSentRef.current;

    const key = buildOfferRouteUpdateKey({
      start,
      end,
      approachFrom,
      padKey,
      navigationFollow,
      presentation,
      offerOverview: useOfferOverview,
      offerSnapshotMode,
      offerSnapshotRideId,
      snapshotAttempt: offerSnapshotAttempt,
    });

    if (key === lastRouteKey.current) return;
    lastRouteKey.current = key;
    routePresentedSentRef.current = false;

    const shouldFitBounds = !navigationFollow;

    postToMap({
      type: 'updateRoute',
      start: [start.lng, start.lat],
      end: [end.lng, end.lat],
      approachFrom: approachFrom
        ? [approachFrom.lng, approachFrom.lat]
        : null,
      driverMarker: driverMarker
        ? [driverMarker.lng, driverMarker.lat]
        : null,
      fitPadding: routeFitPadding ?? null,
      fitPaddingBottom: routeFitPaddingBottom,
      fitBounds: shouldFitBounds,
      presentation,
      offerOverview: useOfferOverview,
      offerSnapshotMode,
      snapshotRideId: offerSnapshotRideId ?? null,
    });
  }, [
    isMapReady,
    start?.lat,
    start?.lng,
    end?.lat,
    end?.lng,
    approachFrom?.lat,
    approachFrom?.lng,
    showRoute,
    routeFitPaddingBottom,
    routeFitPadding?.top,
    routeFitPadding?.right,
    routeFitPadding?.bottom,
    routeFitPadding?.left,
    navigationFollow,
    presentation,
    offerOverview,
    offerSnapshotMode,
    offerSnapshotRideId,
    offerSnapshotAttempt,
    postToMap,
  ]);

  useEffect(() => {
    if (!isMapReady) return;
    postToMap({ type: 'updateDrivers', drivers });
  }, [isMapReady, drivers, postToMap]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg: MapMessage = JSON.parse(event.nativeEvent.data);
        if (!msg?.type) return;
        dispatchWebViewMapMessage(msg, {
          isMapReadyRef,
          locationRef,
          routePresentedSentRef,
          snapshotWaitersRef,
          startMapTransition,
          setIsMapReady,
          onMapReady,
          shouldFollowCamera,
          postGpsCamera,
          handleUserMapInteract,
          onRouteReady,
          onRoutePresented,
          onOfferRouteFramed,
          onOfferRouteCaptureReady,
          onOfferRouteCaptureFailed,
          onMapSnapshot,
          onMapSnapshotError,
        });
      } catch (e) {
        console.error('WebView message error:', e);
      }
    },
    [
      handleUserMapInteract,
      onMapReady,
      onRouteReady,
      onRoutePresented,
      onOfferRouteFramed,
      onOfferRouteCaptureReady,
      onOfferRouteCaptureFailed,
      onMapSnapshot,
      onMapSnapshotError,
      postGpsCamera,
      shouldFollowCamera,
      startMapTransition,
    ],
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        key={mapInstanceKey ?? 'default-map'}
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.map}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        {...(Platform.OS === 'android'
          ? { cacheMode: 'LOAD_DEFAULT' as const }
          : {})}
        onMessage={handleMessage}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        automaticallyAdjustContentInsets={false}
        allowsBackForwardNavigationGestures={false}
        scalesPageToFit={false}
        keyboardDisplayRequiresUserAction
        startInLoadingState={false}
        mediaPlaybackRequiresUserAction={false}
        androidLayerType="hardware"
        // @ts-expect-error: hardwareAccelerationEnabled not officially typed
        hardwareAccelerationEnabled={Platform.OS === 'ios'}
      />
    </View>
  );
}

export const usePrefetchControl = () => {
  const ref = useRef<WebView>(null);

  const togglePrefetchMode = useCallback((mode: PrefetchMode) => {
    ref.current?.postMessage(JSON.stringify({ type: 'setPrefetchMode', mode }));
  }, []);

  return { ref, togglePrefetchMode };
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e8eef4' },
  map: { flex: 1, backgroundColor: '#e8eef4' },
});
