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
import type { MapProps, LatLng, DriverMarker, MapBounds } from './types';
import { buildMapHtmlTemplate } from './mapHtmlTemplate';
import { BASEMAP_CANVAS } from './basemapTone';
import {
  getFrostRects,
  getFrostScene,
  subscribeFrostRects,
  type FrostRect,
} from './frostRects';
import { buildOfferRouteUpdateKey } from '../lib/utils/offerRouteUpdateKey';
import { fetchRoute, RoutingError, type RouteStep } from '../services/routing';
import { logOfferStage } from '../lib/notifications/offerPipelineDiag';
import { nextManeuverAlongTrack } from '../lib/utils/navProgress';
import {
  gpsFixAcceptable,
  gpsMovedEnough,
  haversineMeters,
  navCameraForSpeed,
} from '../lib/utils/gpsThrottle';

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

function gpsFollowMotion(coords: Location.LocationObjectCoords): {
  speed: number | undefined;
  heading: number | undefined;
} {
  const rawSpeed = coords.speed;
  const speed =
    typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) && rawSpeed >= 0
      ? rawSpeed
      : undefined;
  const stopped = typeof speed === 'number' && speed < 1;
  const rawHeading = coords.heading;
  const heading =
    !stopped &&
    typeof rawHeading === 'number' &&
    Number.isFinite(rawHeading) &&
    rawHeading >= 0
      ? rawHeading
      : undefined;
  return { speed, heading };
}

function queueCoarsePrefetch(
  center: LatLng,
  lastCenter: { current: LatLng | null },
  debounce: { current: ReturnType<typeof setTimeout> | null },
  prefetch: (bounds: MapBounds, zoomLevels?: number[]) => void,
) {
  const prev = lastCenter.current;
  const movedM = prev != null ? haversineMeters(prev, center) : Infinity;
  if (prev != null && movedM <= 2000) return;
  if (debounce.current) clearTimeout(debounce.current);
  debounce.current = setTimeout(
    () => {
      debounce.current = null;
      lastCenter.current = center;
      const pad = 0.08;
      prefetch(
        [
          [center.lng - pad, center.lat - pad],
          [center.lng + pad, center.lat + pad],
        ],
        [10, 11, 12],
      );
    },
    prev == null ? 0 : 30000,
  );
}

const DEFAULT_IDLE_RECENTER_MS = 8000;
/**
 * Guidance camera heartbeat, ms.
 *
 * The camera was only commanded from a GPS fix, and the navigation watch asks for updates every
 * 8 m (`watchPositionAsync` below). A driver stopped at the pickup point therefore received
 * nothing at all: any north-up command that had won once — a fit on route arrival, a follow
 * resume — stayed on screen, and the map never came back course-up. Measured symptom, reported
 * from a test ride: "it does not turn at all, it stays north-up".
 */
const NAV_CAMERA_KEEPALIVE_MS = 1000;
/**
 * Age of the last fix beyond which the driver counts as stopped, ms.
 *
 * A stale speed is worse than no speed here: the zoom is chosen from it, so a driver who braked
 * to a halt would keep the city zoom of 18 instead of the standstill 19. Not moving the watch's
 * 8 m is exactly what "stopped" means.
 */
const NAV_CAMERA_STALE_FIX_MS = 3000;
/** Ignore a second off-route signal until the new geometry has had time to land. */
const REROUTE_COOLDOWN_MS = 8000;

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

/**
 * Turn one `routeInfo` push into a navigation progress update.
 *
 * The next maneuver is picked from the steps this side fetched (`nextManeuverAlongTrack`), not
 * read off the message: the map document used to carry a second copy of that rule, and the two
 * could disagree after any change to either.
 */
function handleMapRouteInfoMessage(
  msg: MapMessage,
  steps: RouteStep[] | null,
  onRouteReady: MapProps['onRouteReady'],
) {
  const distanceMeters = Number(
    msg.distanceMeters ?? (Number(msg.distance) || 0) * 1000,
  );
  const durationSeconds = Number(
    msg.durationSeconds ?? (Number(msg.duration) || 0) * 60,
  );

  const alongRaw = Number(msg.alongTrackMeters);
  const alongTrackMeters = Number.isFinite(alongRaw) ? alongRaw : null;

  // No along-track position (the fix is off the line, or there is no line yet) means no
  // maneuver can be named — and naming the first one anyway would be a wrong instruction.
  const maneuver =
    steps && alongTrackMeters !== null
      ? nextManeuverAlongTrack(steps, alongTrackMeters)
      : null;

  onRouteReady?.(distanceMeters, durationSeconds, maneuver, alongTrackMeters);
}

type WebViewMapMessageContext = {
  isMapReadyRef: { current: boolean };
  locationRef: { current: LatLng };
  routePresentedSentRef: { current: boolean };
  /** Steps of the trip line currently drawn, so a maneuver can be named from them. */
  tripStepsRef: { current: RouteStep[] | null };
  startMapTransition: (fn: () => void) => void;
  setIsMapReady: (ready: boolean) => void;
  onMapReady?: () => void;
  shouldFollowCamera: () => boolean;
  postGpsCamera: (
    coords: LatLng,
    follow: boolean,
    heading?: number,
    speed?: number,
  ) => void;
  handleUserMapInteract: () => void;
  onOffRoute?: () => void;
  onRouteReady?: NonNullable<MapProps['onRouteReady']>;
  onRoutePresented?: () => void;
  /** Active ride id, attached to the guidance diagnostic rows. */
  activeRideId?: string;
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
      handleMapRouteInfoMessage(
        msg,
        ctx.tripStepsRef.current,
        ctx.onRouteReady,
      );
      break;
    case 'routePresented':
      if (!ctx.routePresentedSentRef.current) {
        ctx.routePresentedSentRef.current = true;
        ctx.onRoutePresented?.();
      }
      break;
    case 'offRoute':
      ctx.onOffRoute?.();
      break;
    case 'navDiag': {
      // The tick and the message bridge report from inside the map document, where they are the
      // only observers. Three stages out of one message: a swallowed message and a broken tick
      // look the same on the map and want different fixes.
      const detail = (msg.detail as Record<string, unknown>) ?? {};
      const stage = !detail.error
        ? 'nav_tick'
        : detail.source === 'handleNativeMessage'
          ? 'nav_message_error'
          : 'nav_tick_error';
      logOfferStage(stage, detail, ctx.activeRideId ?? null);
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
  driverMarker,
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
  mapControllerRef,
  activeRideId,
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
  const hostRef = useRef<View>(null);
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
  const lastSpeedRef = useRef<number | undefined>(undefined);
  const hasGpsFixRef = useRef(false);
  const lastAcceptedRef = useRef<LatLng | null>(null);
  const lastFixAtRef = useRef(0);
  const latestFixRef = useRef<LatLng | null>(null);
  const rerouteGenerationRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const [rerouteGeneration, setRerouteGeneration] = useState(0);
  const routePresentedSentRef = useRef(false);
  const lastRouteKey = useRef<string>('');
  const prevNavigationFollowRef = useRef(false);
  /**
   * In-flight route request. Aborted when a new one supersedes it, and when the route is
   * cleared; never in an effect cleanup, because this effect also returns early on an
   * unchanged key and a cleanup would then cancel the request it is not re-issuing.
   */
  const routeAbortRef = useRef<AbortController | null>(null);
  /** Monotonic request id, handed to the map so a late answer cannot redraw a newer route. */
  const routeRequestSeqRef = useRef(0);
  /** Steps of the trip line the map is currently drawing. */
  const tripStepsRef = useRef<RouteStep[] | null>(null);
  const lastPrefetchCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const prefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLocationUpdateRef = useRef(onLocationUpdate);
  const onUserMapInteractRef = useRef(onUserMapInteract);
  const onFollowPausedChangeRef = useRef(onFollowPausedChange);

  onLocationUpdateRef.current = onLocationUpdate;
  onUserMapInteractRef.current = onUserMapInteract;
  onFollowPausedChangeRef.current = onFollowPausedChange;

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

  /**
   * Resolve the trip line, and the approach line when there is one, outside the WebView.
   *
   * The map document used to issue these requests itself, with no deadline and a single
   * endpoint, and it swallowed the failure — which is how a stalled router left a straight
   * line on screen with nothing to distinguish it from a road. Each leg answers with its own
   * message and carries the request id, so an answer that outlived its request is ignored by
   * the map instead of drawing over a newer route.
   */
  const requestRouteLegs = useCallback(
    (
      generation: number,
      tripFrom: LatLng,
      tripTo: LatLng,
      approachFromCoord: LatLng | null,
      approachTo: LatLng,
      signal: AbortSignal,
    ) => {
      const legs: Array<{
        legKind: 'trip' | 'approach';
        from: LatLng;
        to: LatLng;
      }> = [{ legKind: 'trip', from: tripFrom, to: tripTo }];
      if (approachFromCoord) {
        legs.push({
          legKind: 'approach',
          from: approachFromCoord,
          to: approachTo,
        });
      }

      for (const leg of legs) {
        logOfferStage('nav_route_requested', {
          leg: leg.legKind,
          generation,
        });
        void fetchRoute(leg.from, leg.to, { signal })
          .then((route) => {
            if (signal.aborted) return;
            if (leg.legKind === 'trip') {
              tripStepsRef.current = route.steps.length ? route.steps : null;
            }
            postToMap({
              type: 'routeGeometry',
              routeGeneration: generation,
              legKind: leg.legKind,
              coordinates: route.coordinates,
              steps: route.steps,
              distanceMeters: route.distanceMeters,
              durationSeconds: route.durationSeconds,
            });
          })
          .catch((error: unknown) => {
            if (signal.aborted) return;
            const reason =
              error instanceof RoutingError ? error.reason : 'network';
            postToMap({
              type: 'routeError',
              routeGeneration: generation,
              legKind: leg.legKind,
              reason,
            });
          });
      }
    },
    [postToMap],
  );

  const frostPushRafRef = useRef(0);
  const latestFrostRectsRef = useRef<FrostRect[]>([]);
  const pushFrostNow = useCallback(
    (rects: FrostRect[]) => {
      const scene = getFrostScene();
      const host = hostRef.current;
      if (!scene || !host) return;
      // Both frames are in the scene. The difference is the WebView's own origin,
      // which is the map document's origin. Window space is not that origin.
      host.measureLayout(
        scene,
        (originX, originY) => {
          postToMap({
            type: 'setFrost',
            rects: rects.map((rect) => ({
              id: rect.id,
              x: rect.x - originX,
              y: rect.y - originY,
              w: rect.width,
              h: rect.height,
              radius: rect.radius,
            })),
          });
        },
        () => {},
      );
    },
    [postToMap],
  );

  const pushFrost = useCallback(
    (rects: FrostRect[]) => {
      latestFrostRectsRef.current = rects;
      if (frostPushRafRef.current) return;
      frostPushRafRef.current = requestAnimationFrame(() => {
        frostPushRafRef.current = 0;
        pushFrostNow(latestFrostRectsRef.current);
      });
    },
    [pushFrostNow],
  );

  useEffect(() => {
    return subscribeFrostRects((rects) => {
      if (!isMapReadyRef.current) return;
      pushFrost(rects);
    });
  }, [pushFrost]);

  useEffect(() => {
    if (!isMapReady) return;
    pushFrost(getFrostRects());
  }, [isMapReady, pushFrost]);

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
      prefetchBounds,
      clearRoute: clearRouteOnMap,
    };
    return () => {
      mapControllerRef.current = null;
    };
  }, [mapControllerRef, prefetchBounds, clearRouteOnMap]);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    navigationFollowRef.current = navigationFollow;
  }, [navigationFollow]);

  const setPaused = useCallback((paused: boolean) => {
    followPausedRef.current = paused;
    onFollowPausedChangeRef.current?.(paused);
  }, []);

  const postGpsCamera = useCallback(
    (
      coords: LatLng,
      followCamera: boolean,
      heading?: number,
      speed?: number,
    ) => {
      if (typeof heading === 'number') {
        lastHeadingRef.current = heading;
      }
      if (typeof speed === 'number' && speed >= 0) {
        lastSpeedRef.current = speed;
      }
      const nav = navigationFollowRef.current;
      const cam = nav ? navCameraForSpeed(lastSpeedRef.current) : null;
      postToMap({
        type: 'gpsUpdate',
        coords: [coords.lng, coords.lat],
        zoom: cam ? cam.zoom : 16,
        heading: heading ?? lastHeadingRef.current,
        pitch: cam ? cam.pitch : 0,
        speed:
          typeof lastSpeedRef.current === 'number' ? lastSpeedRef.current : null,
        navigation: nav,
        duration: nav ? 900 : 800,
        followCamera,
      });
    },
    [postToMap],
  );

  const requestReroute = useCallback(() => {
    if (!navigationFollowRef.current) return;
    const now = Date.now();
    if (now - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS) {
      logOfferStage('nav_off_route', {
        action: 'cooldown',
        since_ms: now - lastRerouteAtRef.current,
      });
      return;
    }
    lastRerouteAtRef.current = now;
    // The line the driver left is the one that was drawn, and the generation that follows is
    // what a late answer for it must fail to overwrite.
    logOfferStage('nav_off_route', {
      action: 'reroute',
      generation: routeRequestSeqRef.current + 1,
    });
    rerouteGenerationRef.current += 1;
    setRerouteGeneration(rerouteGenerationRef.current);
  }, []);

  useEffect(() => {
    if (navigationFollow) return;
    if (rerouteGenerationRef.current === 0) return;
    rerouteGenerationRef.current = 0;
    lastRerouteAtRef.current = 0;
    setRerouteGeneration(0);
  }, [navigationFollow]);

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
    onUserMapInteractRef.current?.();
    scheduleIdleRecenter();
  }, [followUser, navigationFollow, scheduleIdleRecenter, setPaused]);

  const handleGPSPosition = useCallback(
    (pos: Location.LocationObject) => {
      const newLoc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      if (
        !gpsFixAcceptable({
          accuracy: pos.coords.accuracy,
          prev: hasGpsFixRef.current ? lastAcceptedRef.current : null,
          next: newLoc,
          elapsedMs: hasGpsFixRef.current
            ? pos.timestamp - lastFixAtRef.current
            : 0,
          hasFix: hasGpsFixRef.current,
        })
      ) {
        return;
      }
      hasGpsFixRef.current = true;
      lastAcceptedRef.current = newLoc;
      lastFixAtRef.current = pos.timestamp;
      latestFixRef.current = newLoc;

      const movedForStore = gpsMovedEnough(locationRef.current, newLoc);
      if (movedForStore) {
        locationRef.current = newLoc;
        startMapTransition(() => {
          setLocation(newLoc);
          onLocationUpdateRef.current?.(newLoc);
        });
      }

      if (isMapReadyRef.current) {
        queueCoarsePrefetch(
          newLoc,
          lastPrefetchCenterRef,
          prefetchDebounceRef,
          prefetchBounds,
        );
      }

      if (!isMapReadyRef.current) return;

      const { speed, heading } = gpsFollowMotion(pos.coords);

      // Puck always updates; camera follows in home GPS or active-trip navigation.
      postGpsCamera(newLoc, shouldFollowCamera(), heading, speed);
    },
    [postGpsCamera, prefetchBounds, shouldFollowCamera, startMapTransition],
  );

  const handleGPSPositionRef = useRef(handleGPSPosition);
  handleGPSPositionRef.current = handleGPSPosition;
  const clearIdleTimerRef = useRef(clearIdleTimer);
  clearIdleTimerRef.current = clearIdleTimer;

  useEffect(() => {
    if (!navigationFollow || !isMapReady) return;
    setPaused(false);
    postGpsCamera(locationRef.current, true, lastHeadingRef.current);
  }, [navigationFollow, isMapReady, postGpsCamera, setPaused]);

  /**
   * Keep the guidance camera commanded between fixes.
   *
   * The map document only moves its camera on a fix it receives, and the navigation watch only
   * reports after 8 m. A driver stopped at the pickup point — which is precisely where guidance
   * begins — would then never be commanded again, and whatever commanded the camera last won for
   * the rest of the wait. This re-asserts the framing once a second, from the last known fix.
   *
   * It goes through `shouldFollowCamera()`, so panning the map still pauses the follow and the
   * idle timer still resumes it; the heartbeat never fights a deliberate gesture. A fix older
   * than `NAV_CAMERA_STALE_FIX_MS` means the 8 m threshold has not been crossed, so the last
   * speed is dropped to zero — otherwise a driver who just stopped would keep the zoom of the
   * speed they were doing.
   */
  useEffect(() => {
    if (!navigationFollow) return;
    const id = setInterval(() => {
      if (!isMapReadyRef.current) return;
      if (!shouldFollowCamera()) return;
      if (
        hasGpsFixRef.current &&
        Date.now() - lastFixAtRef.current > NAV_CAMERA_STALE_FIX_MS
      ) {
        lastSpeedRef.current = 0;
      }
      // The freshest accepted fix, not `locationRef`: that one only moves every ~10 m, and
      // re-centring the 1 Hz heartbeat on a staler point than the last fix makes the camera
      // step backwards between two fixes.
      postGpsCamera(
        latestFixRef.current ?? locationRef.current,
        true,
        lastHeadingRef.current,
      );
    }, NAV_CAMERA_KEEPALIVE_MS);
    return () => clearInterval(id);
  }, [navigationFollow, postGpsCamera, shouldFollowCamera]);

  useEffect(() => {
    let watch: Location.LocationSubscription | null = null;
    let cancelled = false;

    const onGpsFix = (pos: Location.LocationObject) => {
      handleGPSPositionRef.current(pos);
    };

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
          accuracy: navigationFollow
            ? Location.Accuracy.High
            : Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          onGpsFix(current);
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
        onGpsFix,
      );
    };

    void setupGPSTracking();

    return () => {
      cancelled = true;
      watch?.remove();
      clearIdleTimerRef.current();
    };
    // Watch must not restart on GPS ticks — only High vs Balanced for trip nav.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationFollow]);

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

    if (navigationFollow && !prevNavigationFollowRef.current) {
      // Accept reuses the same trip endpoints as the offer chord; the dedup key can match and
      // skip updateRoute while the WebView still owns the offer camera lock.
      lastRouteKey.current = '';
    }
    prevNavigationFollowRef.current = navigationFollow;

    if (!showRoute || !start || !end) {
      lastRouteKey.current = '';
      routePresentedSentRef.current = false;
      tripStepsRef.current = null;
      routeAbortRef.current?.abort();
      routeAbortRef.current = null;
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
      rerouteGeneration,
    });

    if (key === lastRouteKey.current) return;
    lastRouteKey.current = key;
    routePresentedSentRef.current = false;

    const shouldFitBounds = !navigationFollow;
    const origin =
      navigationFollow && hasGpsFixRef.current && latestFixRef.current
        ? latestFixRef.current
        : start;

    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    tripStepsRef.current = null;
    routeRequestSeqRef.current += 1;
    const generation = routeRequestSeqRef.current;

    postToMap({
      type: 'updateRoute',
      routeGeneration: generation,
      start: [origin.lng, origin.lat],
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
      // The camera is told what the route is for, instead of inferring it from `fitBounds`.
      navigation: navigationFollow,
    });

    if (navigationFollow) {
      setPaused(false);
      postGpsCamera(locationRef.current, true, lastHeadingRef.current);
    }

    requestRouteLegs(
      generation,
      origin,
      end,
      approachFrom ?? null,
      start,
      controller.signal,
    );
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
    rerouteGeneration,
    presentation,
    offerOverview,
    postToMap,
    postGpsCamera,
    setPaused,
    requestRouteLegs,
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
          tripStepsRef,
          startMapTransition,
          setIsMapReady,
          onMapReady,
          shouldFollowCamera,
          postGpsCamera,
          handleUserMapInteract,
          onRouteReady,
          onRoutePresented,
          onOffRoute: requestReroute,
          activeRideId,
        });
      } catch (e) {
        console.error('WebView message error:', e);
      }
    },
    [
      activeRideId,
      handleUserMapInteract,
      onMapReady,
      onRouteReady,
      onRoutePresented,
      postGpsCamera,
      requestReroute,
      shouldFollowCamera,
      startMapTransition,
    ],
  );

  return (
    <View
      ref={hostRef}
      style={[styles.container, style]}
      onLayout={() => {
        if (isMapReadyRef.current) pushFrost(getFrostRects());
      }}
    >
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
        contentInsetAdjustmentBehavior="never"
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
  container: { flex: 1, backgroundColor: BASEMAP_CANVAS },
  map: { flex: 1, backgroundColor: BASEMAP_CANVAS },
});
