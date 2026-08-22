import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useTransition,
} from "react";
import {
  StyleSheet,
  View,
  Alert,
  Platform,
  AppState,
  AppStateStatus,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import type { MapProps, LatLng, DriverMarker } from "./types";
import { buildMapHtmlTemplate } from "./mapHtmlTemplate";

// ============================================================================
// Types
// ============================================================================

type PrefetchMode = "normal" | "aggressive" | "disabled";

interface PrefetchConfig {
  enabled: boolean;
  aggressiveMode: boolean;
  debugMode: boolean;
}

interface MapMessage {
  type: string;
  [key: string]: unknown;
}

// ============================================================================
// Main Component
// ============================================================================

export function WebViewMap({
  initialCenter,
  start,
  end,
  approachFrom,
  drivers = [],
  followUser = true,
  showRoute = true,
  routeFitPaddingBottom = 48,
  style,
  onMapReady,
  onRouteReady,
  onLocationUpdate,
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

  const [location, setLocation] = useState<LatLng>(
    initialCenter ?? { lat: 48.8566, lng: 2.3522 },
  );
  const [isMapReady, setIsMapReady] = useState(false);

  // useTransition pour les updates GPS (non-critical)
  const [, startMapTransition] = useTransition();

  // HTML figé au mount
  const htmlContent = useMemo(
    () => buildMapHtmlTemplate(location, prefetchConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ========================================================================
  // GPS Live Tracking
  // ========================================================================

  const handleGPSPosition = useCallback(
    (pos: Location.LocationObject) => {
      const newLoc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      // Concurrent state update: GPS updates are non-critical
      startMapTransition(() => {
        setLocation(newLoc);
        onLocationUpdate?.(newLoc);
      });

      if (!followUser || !isMapReady) return;

      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "gpsUpdate",
          coords: [newLoc.lng, newLoc.lat],
          zoom: 16,
        }),
      );
    },
    [followUser, isMapReady, onLocationUpdate, startMapTransition],
  );

  useEffect(() => {
    if (!followUser) return;

    let watch: Location.LocationSubscription | null = null;

    const setupGPSTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "GPS requis",
          "Active la localisation pour utiliser la map.",
        );
        return;
      }

      watch = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 25,
        },
        handleGPSPosition,
      );
    };

    void setupGPSTracking();

    return () => {
      watch?.remove();
    };
  }, [handleGPSPosition, followUser]);

  // ========================================================================
  // App State Listener (Background/Foreground)
  // ========================================================================

  const getPrefetchModeForState = (state: AppStateStatus): PrefetchMode => {
    if (state === "background") {
      return "disabled";
    }
    return prefetchConfig.aggressiveMode ? "aggressive" : "normal";
  };

  const handleAppStateChange = useCallback(
    (state: AppStateStatus) => {
      appState.current = state;

      const newMode = getPrefetchModeForState(state);
      webViewRef.current?.postMessage(
        JSON.stringify({ type: "setPrefetchMode", mode: newMode }),
      );

      if (state === "active") {
        webViewRef.current?.injectJavaScript(
          `(function(){try{if(window.__veResizeMap)window.__veResizeMap();}catch(e){}true;})();`,
        );
      }
    },
    [prefetchConfig.aggressiveMode],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  // ========================================================================
  // Route Updates
  // ========================================================================

  const postToMap = useCallback((payload: Record<string, unknown>) => {
    const json = JSON.stringify(payload);
    // Single delivery path — dual postMessage+inject caused double abort / flicker
    webViewRef.current?.injectJavaScript(
      `(function(){try{if(window.__veHandleNativeMessage){window.__veHandleNativeMessage({data:${JSON.stringify(json)}});}else if(window.ReactNativeWebView){/* noop */} }catch(e){console.error(e);}true;})();`,
    );
  }, []);

  const lastRouteKey = useRef<string>("");

  useEffect(() => {
    if (!isMapReady) return;

    if (!showRoute || !start || !end) {
      lastRouteKey.current = "";
      postToMap({ type: "clearRoute" });
      return;
    }

    const key = [
      start.lat.toFixed(5),
      start.lng.toFixed(5),
      end.lat.toFixed(5),
      end.lng.toFixed(5),
      approachFrom?.lat?.toFixed(4) ?? "",
      approachFrom?.lng?.toFixed(4) ?? "",
      routeFitPaddingBottom,
    ].join("|");

    if (key === lastRouteKey.current) return;
    lastRouteKey.current = key;

    postToMap({
      type: "updateRoute",
      start: [start.lng, start.lat],
      end: [end.lng, end.lat],
      approachFrom: approachFrom
        ? [approachFrom.lng, approachFrom.lat]
        : null,
      fitPaddingBottom: routeFitPaddingBottom,
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
    postToMap,
  ]);

  // ========================================================================
  // Driver Updates
  // ========================================================================

  useEffect(() => {
    if (!isMapReady) return;

    webViewRef.current?.postMessage(
      JSON.stringify({
        type: "updateDrivers",
        drivers,
      }),
    );
  }, [isMapReady, drivers]);

  // ========================================================================
  // WebView Message Handler
  // ========================================================================

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg: MapMessage = JSON.parse(event.nativeEvent.data);
        if (!msg?.type) return;

        switch (msg.type) {
          case "mapError":
            console.error("[WebView] mapError", msg.error);
            break;

          case "console":
            if (msg.level === "error") {
              console.error("[Map]", ...(msg.args as unknown[]));
            } else if (msg.level === "warn") {
              console.warn("[Map]", ...(msg.args as unknown[]));
            } else {
              console.log("[Map]", ...(msg.args as unknown[]));
            }
            break;

          case "mapReady":
            startMapTransition(() => {
              setIsMapReady(true);
            });
            onMapReady?.();
            break;

          case "routeInfo": {
            const distance = Number(msg.distance);
            const duration = Number(msg.duration);
            onRouteReady?.(distance, duration);
            break;
          }

          default:
            break;
        }
      } catch (e) {
        console.error("WebView message error:", e);
      }
    },
    [onMapReady, onRouteReady, startMapTransition],
  );

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.map}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        onMessage={handleMessage}
        originWhitelist={["*"]}
        setSupportMultipleWindows={false}
        automaticallyAdjustContentInsets={false}
        allowsBackForwardNavigationGestures={false}
        scalesPageToFit={false}
        keyboardDisplayRequiresUserAction
        startInLoadingState={false}
        mediaPlaybackRequiresUserAction={false}
        androidLayerType="hardware"
        // @ts-expect-error: hardwareAccelerationEnabled not officially typed
        hardwareAccelerationEnabled={Platform.OS === "ios"}
      />
    </View>
  );
}

// ============================================================================
// Hook: usePrefetchControl
// ============================================================================

export const usePrefetchControl = () => {
  const ref = useRef<WebView>(null);

  const togglePrefetchMode = useCallback((mode: PrefetchMode) => {
    ref.current?.postMessage(JSON.stringify({ type: "setPrefetchMode", mode }));
  }, []);

  return { ref, togglePrefetchMode };
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#171717" },
  map: { flex: 1, backgroundColor: "#171717" },
});
