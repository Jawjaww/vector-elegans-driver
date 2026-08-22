import type { LatLng } from "./types";

interface PrefetchConfig {
  enabled: boolean;
  aggressiveMode: boolean;
  debugMode: boolean;
}

export function buildMapHtmlTemplate(
  initialLocation: LatLng,
  prefetchConfig: PrefetchConfig = {
    enabled: true,
    aggressiveMode: false,
    debugMode: false,
  },
) {
  const {
    enabled: prefetchEnabled,
    aggressiveMode,
    debugMode,
  } = prefetchConfig;

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
  />
  <meta name="color-scheme" content="dark" />
  <meta name="theme-color" content="#171717" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; background-color: #171717; }
    #map { position: absolute; top: 0; bottom: 0; width: 100%; }
    #map canvas { background-color: #171717; }

    /* Hide noisy OpenMapTiles / OSM chrome under address overlays */
    .maplibregl-ctrl-attrib,
    .maplibregl-ctrl-logo,
    .maplibregl-ctrl-bottom-right,
    .maplibregl-ctrl-bottom-left {
      display: none !important;
    }

    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }

    /* Debug overlay (si debugMode=true) */
    #debug-overlay {
      position: fixed;
      top: 8px;
      left: 8px;
      background: rgba(0, 0, 0, 0.8);
      color: #10b981;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      z-index: 999;
      max-width: 200px;
      line-height: 1.4;
      display: none;
    }

    .driver-marker {
      background: #007cbf;
      width: 28px;
      height: 28px;
      border-radius: 14px;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      will-change: transform;
    }
    .driver-marker::after { content: '🚗'; }

    .route-marker {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));
    }
    .route-marker svg { display: block; }
    .route-marker-driver {
      width: 18px;
      height: 18px;
      border-radius: 9px;
      background: #f97316;
      border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="debug-overlay"></div>
  <script>
    // --- Performance tracing (debug mode) ---
    const DEBUG = ${debugMode};
    const PERF_MARKS = {};
    
    function perfMark(label) {
      if (!DEBUG) return;
      PERF_MARKS[label] = Date.now();
    }

    function perfMeasure(label) {
      if (!DEBUG) return 0;
      const duration = Date.now() - (PERF_MARKS[label] || Date.now());
      updateDebugOverlay('perf', label, \`\${duration}ms\`);
      return duration;
    }

    function updateDebugOverlay(type, key, value) {
      if (!DEBUG) return;
      const overlay = document.getElementById('debug-overlay');
      if (!overlay) return;
      overlay.style.display = 'block';
      if (!overlay.dataset[type]) overlay.dataset[type] = '{}';
      const data = JSON.parse(overlay.dataset[type]);
      data[key] = value;
      overlay.dataset[type] = JSON.stringify(data);
      overlay.innerHTML = Object.entries(data)
        .map(([k, v]) => \`<div>\${k}: \${v}</div>\`)
        .join('');
    }

    // --- Console → React Native bridge ---
    (function () {
      const forward = (level, args) => {
        try {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(
              JSON.stringify({ type: "console", level, args })
            );
          }
        } catch {}
      };
      const origErr = console.error.bind(console);
      const origWarn = console.warn.bind(console);
      const origLog = console.log.bind(console);
      console.error = function () { origErr.apply(null, arguments); forward("error", Array.from(arguments)); };
      console.warn = function () { origWarn.apply(null, arguments); forward("warn", Array.from(arguments)); };
      console.log = function () { origLog.apply(null, arguments); forward("log", Array.from(arguments)); };
    })();

    perfMark('init');

    const INITIAL_CENTER = [${initialLocation.lng}, ${initialLocation.lat}];
    const PREFETCH_ENABLED = ${prefetchEnabled};
    const AGGRESSIVE_MODE = ${aggressiveMode};

    // --- MapLibre init avec WebGL optimisations ---
    const map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: INITIAL_CENTER,
      zoom: 14,
      pitch: 0,
      bearing: 0,
      fadeDuration: 0,
      minZoom: 3,
      maxZoom: 18,
      renderWorldCopies: false,
      attributionControl: false,
      preserveDrawingBuffer: false,
      antialias: false,
      optimizeForTerrain: false,
    });

    try {
      const canvas = map.getCanvas();
      canvas.addEventListener("webglcontextlost", (e) => {
        try { e.preventDefault(); } catch (_) {}
      });
      canvas.addEventListener("webglcontextrestored", () => {
        try {
          map.resize();
          map.triggerRepaint();
        } catch (_) {}
      });
    } catch (_) {}

    // Keep canvas sized if the RN WebView layout settles late
    setTimeout(() => { try { map.resize(); } catch (_) {} }, 250);
    setTimeout(() => { try { map.resize(); } catch (_) {} }, 1000);

    perfMeasure('init');

      // Navigation control removed to hide +/- zoom buttons in the WebView

    let driverSource = null;
    let _tileLoadStats = { loaded: 0, failed: 0, queued: 0 };

    map.on("error", (e) => {
      console.error("MapLibre error:", e);
      updateDebugOverlay('tiles', 'error', e?.error?.message || 'unknown');
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: "mapError",
              error: e && e.error && e.error.message ? e.error.message : String(e),
            })
          );
        }
      } catch {}
    });

    // --- Tile prefetch (aggressive + débounce) ---
    function long2tile(lon, zoom) {
      return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
    }

    function lat2tile(lat, zoom) {
      const latRad = (lat * Math.PI) / 180;
      return Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
          Math.pow(2, zoom)
      );
    }

    function shouldPrefetch() {
      try {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn) return true;

        if (conn.saveData) return false;
        const ect = conn.effectiveType || "";
        if (ect === "slow-2g" || ect === "2g") return false;

        return true;
      } catch {
        return true;
      }
    }

    // Prefetch Cache API disabled — competed with MapLibre tile loads in Expo Go.
    async function prefetchTilesAround() { return; }
    function schedulePrefetch() {}

    // --- Map load ---
    map.on("load", () => {
      perfMark('mapLoad');

      try {
        map.resize();
        window.__veResizeMap = function () {
          try {
            map.resize();
            map.triggerRepaint();
          } catch (_) {}
        };
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "mapReady" }));
        }
      } catch {}

      // Source GeoJSON pour les chauffeurs
      map.addSource("drivers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true, // clustering pour perf avec 100+ drivers
        clusterMaxZoom: 15,
        clusterRadius: 50,
      });
      driverSource = map.getSource("drivers");

      map.addLayer({
        id: "drivers-layer",
        type: "circle",
        source: "drivers",
        paint: {
          "circle-radius": 8,
          "circle-color": "#007cbf",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
        filter: ["!", ["has", "point_count"]],
      });

      // Couche cluster
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "drivers",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#51bbd6", 100, "#f1f075", 750, "#f28cb1"],
          "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40],
        },
      });

      perfMeasure('mapLoad');
    });

    // --- RN → Web bridge (iOS: window, Android: document) ---
    function handleNativeMessage(event) {
      try {
        const raw = event && event.data !== undefined ? event.data : event;
        const msg = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!msg || !msg.type) return;

        if (msg.type === "gpsUpdate") {
          updateGps(msg.coords, msg.zoom);
        } else if (msg.type === "updateRoute" && msg.start && msg.end) {
          updateRoute(msg.start, msg.end, msg.approachFrom || null, msg.fitPaddingBottom || 32);
        } else if (msg.type === "clearRoute") {
          clearAllRoutes();
        } else if (msg.type === "updateDrivers" && Array.isArray(msg.drivers)) {
          updateDrivers(msg.drivers);
        } else if (msg.type === "setPrefetchMode") {
          if (msg.mode === 'aggressive') {
            console.log('[Prefetch] Mode → AGGRESSIVE');
          } else if (msg.mode === 'normal') {
            console.log('[Prefetch] Mode → NORMAL');
          } else if (msg.mode === 'disabled') {
            console.log('[Prefetch] Mode → DISABLED');
          }
        }
      } catch (e) {
        console.error("Message parse error:", e);
      }
    }
    window.addEventListener("message", handleNativeMessage);
    document.addEventListener("message", handleNativeMessage);
    window.__veHandleNativeMessage = handleNativeMessage;

    // --- GPS marker avec will-change ---
    function updateGps(coords, zoom) {
      const srcId = "gps-point";
      if (map.getSource(srcId)) {
        map.getSource(srcId).setData({ type: "Point", coordinates: coords });
      } else {
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "Point", coordinates: coords },
        });
        map.addLayer({
          id: "gps-marker",
          type: "circle",
          source: srcId,
          paint: {
            "circle-radius": 10,
            "circle-color": "#10b981",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
      }

      map.flyTo({
        center: coords,
        zoom: zoom || 16,
        duration: 800,
        essential: true,
      });
    }

    // --- Routes OSRM: trip (pickup→dropoff) + dashed approach (driver→pickup) ---
    let routeAbortController = null;

    function removeLayerSafe(id) {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch (e) {}
    }
    function removeSourceSafe(id) {
      try {
        if (map.getSource(id)) map.removeSource(id);
      } catch (e) {}
    }

    function clearAllRoutes() {
      [
        "route-line", "route-casing",
        "approach-line", "approach-casing",
        "endpoint-pickup", "endpoint-dropoff", "endpoint-driver",
      ].forEach(removeLayerSafe);
      ["route", "approach", "endpoints"].forEach(removeSourceSafe);
      if (window.__vePickupMarker) {
        window.__vePickupMarker.remove();
        window.__vePickupMarker = null;
      }
      if (window.__veDropoffMarker) {
        window.__veDropoffMarker.remove();
        window.__veDropoffMarker = null;
      }
      if (window.__veDriverMarker) {
        window.__veDriverMarker.remove();
        window.__veDriverMarker = null;
      }
    }

    function lineFeature(coords) {
      return {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      };
    }

    function setOrAddLine(sourceId, casingId, lineId, feature, style) {
      removeLayerSafe(lineId);
      removeLayerSafe(casingId);
      removeSourceSafe(sourceId);
      map.addSource(sourceId, { type: "geojson", data: feature });
      if (style.casing) {
        map.addLayer({
          id: casingId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: style.casing,
        });
      }
      map.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: style.line,
      });
    }

    function upsertEndpoints(start, end, approachFrom) {
      removeLayerSafe("endpoint-pickup");
      removeLayerSafe("endpoint-dropoff");
      removeLayerSafe("endpoint-driver");
      removeSourceSafe("endpoints");

      if (window.__vePickupMarker) {
        window.__vePickupMarker.remove();
        window.__vePickupMarker = null;
      }
      if (window.__veDropoffMarker) {
        window.__veDropoffMarker.remove();
        window.__veDropoffMarker = null;
      }
      if (window.__veDriverMarker) {
        window.__veDriverMarker.remove();
        window.__veDriverMarker = null;
      }

      function makePinEl(color) {
        const el = document.createElement("div");
        el.className = "route-marker";
        el.innerHTML =
          '<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" fill="' + color + '"/>' +
          '<circle cx="14" cy="14" r="5.5" fill="#fff"/>' +
          "</svg>";
        return el;
      }

      function makeFlagEl(color) {
        const el = document.createElement("div");
        el.className = "route-marker";
        el.innerHTML =
          '<svg width="28" height="34" viewBox="0 0 28 34" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M6 2v30" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
          '<path d="M7 3h14l-3 5 3 5H7z" fill="' + color + '"/>' +
          "</svg>";
        return el;
      }

      window.__vePickupMarker = new maplibregl.Marker({
        element: makePinEl("#f59e0b"),
        anchor: "bottom",
      })
        .setLngLat(start)
        .addTo(map);

      window.__veDropoffMarker = new maplibregl.Marker({
        element: makeFlagEl("#10b981"),
        anchor: "bottom-left",
      })
        .setLngLat(end)
        .addTo(map);

      if (approachFrom) {
        const dEl = document.createElement("div");
        dEl.className = "route-marker-driver";
        window.__veDriverMarker = new maplibregl.Marker({
          element: dEl,
          anchor: "center",
        })
          .setLngLat(approachFrom)
          .addTo(map);
      }
    }

    function fitRouteBounds(coordLists, padBottom) {
      const all = [];
      coordLists.forEach((list) => {
        if (list && list.length) list.forEach((c) => all.push(c));
      });
      if (all.length < 1) return;
      const bounds = all.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(all[0], all[0])
      );
      map.fitBounds(bounds, {
        padding: {
          top: 28,
          left: 28,
          right: 28,
          bottom: Math.max(48, Number(padBottom) || 48),
        },
        duration: 500,
        maxZoom: 15,
      });
      try { map.resize(); } catch (e) {}
    }

    async function fetchOsrmGeometry(from, to, signal) {
      const url =
        "https://router.project-osrm.org/route/v1/driving/" +
        from[0] + "," + from[1] + ";" + to[0] + "," + to[1] +
        "?geometries=geojson&overview=full";
      const res = await fetch(url, { signal });
      const data = await res.json();
      if (!data.routes || !data.routes.length) return null;
      return data.routes[0];
    }

    function updateRoute(start, end, approachFrom, fitPaddingBottom) {
      if (routeAbortController) routeAbortController.abort();
      routeAbortController = new AbortController();
      const signal = routeAbortController.signal;

      upsertEndpoints(start, end, approachFrom);

      // Immediate straight-line fallbacks so the user always sees a path
      setOrAddLine(
        "route",
        "route-casing",
        "route-line",
        lineFeature([start, end]),
        {
          casing: {
            "line-color": "#064e3b",
            "line-width": 8,
            "line-opacity": 0.35,
          },
          line: {
            "line-color": "#10b981",
            "line-width": 5,
            "line-opacity": 0.95,
          },
        }
      );

      if (approachFrom) {
        setOrAddLine(
          "approach",
          "approach-casing",
          "approach-line",
          lineFeature([approachFrom, start]),
          {
            casing: null,
            line: {
              "line-color": "#f97316",
              "line-width": 3.5,
              "line-opacity": 0.85,
              "line-dasharray": [1.5, 1.5],
            },
          }
        );
      } else {
        removeLayerSafe("approach-line");
        removeLayerSafe("approach-casing");
        removeSourceSafe("approach");
      }

      fitRouteBounds(
        [approachFrom ? [approachFrom, start, end] : [start, end]],
        fitPaddingBottom
      );

      Promise.all([
        fetchOsrmGeometry(start, end, signal),
        approachFrom
          ? fetchOsrmGeometry(approachFrom, start, signal)
          : Promise.resolve(null),
      ])
        .then(([trip, approach]) => {
          let tripCoords = [start, end];
          if (trip && trip.geometry && trip.geometry.coordinates) {
            tripCoords = trip.geometry.coordinates;
            setOrAddLine(
              "route",
              "route-casing",
              "route-line",
              {
                type: "Feature",
                properties: {},
                geometry: trip.geometry,
              },
              {
                casing: {
                  "line-color": "#064e3b",
                  "line-width": 9,
                  "line-opacity": 0.4,
                },
                line: {
                  "line-color": "#10b981",
                  "line-width": 5.5,
                  "line-opacity": 0.95,
                },
              }
            );
            try {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(
                  JSON.stringify({
                    type: "routeInfo",
                    duration: Math.round(trip.duration / 60),
                    distance: (trip.distance / 1000).toFixed(1),
                  })
                );
              }
            } catch {}
          }

          let approachCoords = approachFrom ? [approachFrom, start] : [];
          if (approach && approach.geometry && approach.geometry.coordinates) {
            approachCoords = approach.geometry.coordinates;
            setOrAddLine(
              "approach",
              "approach-casing",
              "approach-line",
              {
                type: "Feature",
                properties: {},
                geometry: approach.geometry,
              },
              {
                casing: null,
                line: {
                  "line-color": "#f97316",
                  "line-width": 3.5,
                  "line-opacity": 0.85,
                  "line-dasharray": [1.8, 1.4],
                },
              }
            );
          }

          fitRouteBounds([approachCoords, tripCoords], fitPaddingBottom);
          // Re-add endpoints above lines
          upsertEndpoints(start, end, approachFrom);
        })
        .catch((err) => {
          if (err && err.name === "AbortError") return;
          console.error("Route error:", err);
          try {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(
                JSON.stringify({ type: "routeError", error: String(err) })
              );
            }
          } catch {}
        });
    }

    // --- Drivers GeoJSON avec clustering ---
    function updateDrivers(drivers) {
      try {
        const features = drivers.map((d) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [d.lng, d.lat] },
          properties: { id: d.id || "", status: d.status || "" },
        }));
        if (driverSource) {
          driverSource.setData({
            type: "FeatureCollection",
            features,
          });
        }
        updateDebugOverlay('drivers', 'count', drivers.length);
      } catch (e) {
        console.error("updateDrivers error", e);
      }
    }

    // Service Worker intentionally not registered — stale tile cache blanked the map.
  </script>
</body>
</html>
`;
}
