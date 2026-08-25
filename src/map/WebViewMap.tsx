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
import type { MapProps, LatLng, DriverMarker } from './types';
import { buildMapHtmlTemplate } from './mapHtmlTemplate';

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
  mapInstanceKey,
  routeFitPaddingBottom = 48,
  routeFitPadding,
  idleRecenterMs = DEFAULT_IDLE_RECENTER_MS,
  style,
  onMapReady,
  onRouteReady,
  onRoutePresented,
  onLocationUpdate,
  onUserMapInteract,
  onFollowPausedChange,
  resumeFollowRef,
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
      postToMap({
        type: 'gpsUpdate',
        coords: [coords.lng, coords.lat],
        zoom: navigationFollowRef.current ? 17.5 : 16,
        heading: heading ?? lastHeadingRef.current,
        pitch: navigationFollowRef.current ? 50 : 0,
        duration: navigationFollowRef.current ? 400 : 800,
        followCamera,
      });
    },
    [postToMap],
  );

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
    if (!followUser) return;
    setPaused(true);
    onUserMapInteract?.();
    scheduleIdleRecenter();
  }, [followUser, onUserMapInteract, scheduleIdleRecenter, setPaused]);

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

      if (!followUser || !isMapReadyRef.current) return;

      const heading =
        typeof pos.coords.heading === 'number' &&
        Number.isFinite(pos.coords.heading) &&
        pos.coords.heading >= 0
          ? pos.coords.heading
          : undefined;

      // Marker always updates; camera only when follow is active
      postGpsCamera(newLoc, !followPausedRef.current, heading);
    },
    [followUser, onLocationUpdate, postGpsCamera, startMapTransition],
  );

  useEffect(() => {
    if (!followUser) return;

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
    followUser,
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

    const endKey = [end.lat.toFixed(5), end.lng.toFixed(5)].join('|');

    const startKey = navigationFollow
      ? [start.lat.toFixed(4), start.lng.toFixed(4)].join('|')
      : [start.lat.toFixed(5), start.lng.toFixed(5)].join('|');

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

    const key = [
      startKey,
      endKey,
      approachFrom?.lat?.toFixed(4) ?? '',
      approachFrom?.lng?.toFixed(4) ?? '',
      padKey,
      navigationFollow ? 'nav' : 'fit',
      presentation,
      useOfferOverview ? 'ov' : '',
    ].join('|');

    if (key === lastRouteKey.current) return;
    lastRouteKey.current = key;

    const shouldFitBounds = !navigationFollow;

    postToMap({
      type: 'updateRoute',
      start: [start.lng, start.lat],
      end: [end.lng, end.lat],
      approachFrom: approachFrom
        ? [approachFrom.lng, approachFrom.lat]
        : null,
      fitPadding: routeFitPadding ?? null,
      fitPaddingBottom: routeFitPaddingBottom,
      fitBounds: shouldFitBounds,
      presentation,
      offerOverview: useOfferOverview,
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

        switch (msg.type) {
          case 'mapError':
            console.error('[WebView] mapError', msg.error);
            break;

          case 'console':
            if (msg.level === 'error') {
              console.error('[Map]', ...(msg.args as unknown[]));
            } else if (msg.level === 'warn') {
              console.warn('[Map]', ...(msg.args as unknown[]));
            } else {
              console.log('[Map]', ...(msg.args as unknown[]));
            }
            break;

          case 'mapReady':
            isMapReadyRef.current = true;
            startMapTransition(() => {
              setIsMapReady(true);
            });
            onMapReady?.();
            if (followUser && !followPausedRef.current) {
              postGpsCamera(locationRef.current, true);
            }
            break;

          case 'userMapInteract':
            handleUserMapInteract();
            break;

          case 'routeInfo': {
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
                    name: next.name || '',
                  }
                : null,
            );
            break;
          }

          case 'routePresented':
            if (!routePresentedSentRef.current) {
              routePresentedSentRef.current = true;
              onRoutePresented?.();
            }
            break;

          default:
            break;
        }
      } catch (e) {
        console.error('WebView message error:', e);
      }
    },
    [
      followUser,
      handleUserMapInteract,
      onMapReady,
      onRouteReady,
      onRoutePresented,
      postGpsCamera,
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
