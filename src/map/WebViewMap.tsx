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
  drivers = [],
  followUser = true,
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
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        handleGPSPosition,
      );
    };

    setupGPSTracking();

    return () => {
      watch?.remove();
    };
  }, [handleGPSPosition]);

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

  useEffect(() => {
    if (!isMapReady || !start || !end) return;

    webViewRef.current?.postMessage(
      JSON.stringify({
        type: "updateRoute",
        start: [start.lng, start.lat],
        end: [end.lng, end.lat],
      }),
    );
  }, [isMapReady, start, end]);

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
        onMessage={handleMessage}
        originWhitelist={["*"]}
        setSupportMultipleWindows={false}
        automaticallyAdjustContentInsets={false}
        allowsBackForwardNavigationGestures={false}
        scalesPageToFit={false}
        keyboardDisplayRequiresUserAction
        startInLoadingState
        mediaPlaybackRequiresUserAction={false}
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
