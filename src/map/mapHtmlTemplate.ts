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
      fadeDuration: 200,
      minZoom: 3,
      maxZoom: 20,
      renderWorldCopies: false,
      attributionControl: true,
      // 2026 opts: WebGL parallélisation
      preserveDrawingBuffer: false, // ↓ mémoire GPU
      antialias: true, // smooth edges
      optimizeForTerrain: false, // optimiser terrain si besoin plus tard
    });

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

    async function prefetchTilesAround(centerLngLat, zoom, radiusOverride = null) {
      try {
        if (!PREFETCH_ENABLED || !shouldPrefetch()) return;

        perfMark('prefetch');

        const style = map.getStyle && map.getStyle();
        if (!style || !style.sources) return;

        const vectorSources = Object.values(style.sources).filter(
          (s) => s && s.type === "vector" && Array.isArray(s.tiles) && s.tiles.length
        );
        if (!vectorSources.length) return;

        const cache = await caches.open("vtc-map-cache-v2");
        const baseZ = Math.round(zoom);

        // Radius adaptatif selon le mode agressif
        let radius = radiusOverride ?? 2;
        if (AGGRESSIVE_MODE) {
          radius = Math.min(3, Math.ceil(map.getZoom() / 12)); // +1 tuile radius at zoom 12+
        }

        // Zooms à préfetch [z-1, z, z+1]
        let zoomsToFetch = [baseZ - 1, baseZ, baseZ + 1].filter((z) => z >= 0 && z <= 20);
        
        // Mode ultra-agressif: +1 zoom de plus
        if (AGGRESSIVE_MODE && baseZ < 19) {
          zoomsToFetch.push(baseZ + 2);
        }

        const urls = [];
        for (const z of zoomsToFetch) {
          const cx = long2tile(centerLngLat[0], z);
          const cy = lat2tile(centerLngLat[1], z);
          const maxIndex = Math.pow(2, z);

          for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
              const x = cx + dx;
              const y = cy + dy;

              const wrappedX = ((x % maxIndex) + maxIndex) % maxIndex;
              const clampedY = Math.min(Math.max(y, 0), maxIndex - 1);

              for (const src of vectorSources) {
                const template = src.tiles[0];
                const url = template
                  .replace("{z}", z)
                  .replace("{x}", wrappedX)
                  .replace("{y}", clampedY);
                urls.push(url);
              }
            }
          }
        }

        const uniqueUrls = Array.from(new Set(urls));
        _tileLoadStats.queued = uniqueUrls.length;
        updateDebugOverlay('tiles', 'queued', uniqueUrls.length);

        // Concurrence adaptatif (mode agressif = +2)
        let CONC = AGGRESSIVE_MODE ? 6 : 4;
        
        for (let i = 0; i < uniqueUrls.length; i += CONC) {
          await Promise.all(
            uniqueUrls.slice(i, i + CONC).map(async (u) => {
              try {
                const match = await cache.match(u);
                if (match) {
                  _tileLoadStats.loaded++;
                  return;
                }
                const res = await fetch(u, { mode: "cors", priority: "low" });
                if (res && res.ok) {
                  await cache.put(u, res.clone());
                  _tileLoadStats.loaded++;
                } else {
                  _tileLoadStats.failed++;
                }
              } catch {
                _tileLoadStats.failed++;
              }
            })
          );
        }

        updateDebugOverlay('tiles', 'loaded', _tileLoadStats.loaded);
        updateDebugOverlay('tiles', 'failed', _tileLoadStats.failed);
        perfMeasure('prefetch');
      } catch (e) {
        console.warn("prefetch failed", e);
      }
    }

    let _pfTimer = null;
    let _lastPrefetch = 0;

    function schedulePrefetch() {
      try {
        const now = Date.now();
        const minInterval = AGGRESSIVE_MODE ? 300 : 700;
        if (now - _lastPrefetch < minInterval) return;

        clearTimeout(_pfTimer);
        const debounceDelay = AGGRESSIVE_MODE ? 150 : 250;
        _pfTimer = setTimeout(() => {
          _lastPrefetch = Date.now();
          const center = map.getCenter().toArray();
          const z = map.getZoom();
          prefetchTilesAround(center, z);
        }, debounceDelay);
      } catch {}
    }

    // --- Map load ---
    map.on("load", () => {
      perfMark('mapLoad');

      try {
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

      // Zoom snapping
      map.on("zoomend", () => {
        try {
          const z = map.getZoom();
          const snapped = Math.round(z * 4) / 4;
          if (Math.abs(snapped - z) > 0.001) {
            map.easeTo({ zoom: snapped, duration: 80 });
          }
        } catch (e) {
          console.warn("zoomend snap failed", e);
        }
      });

      // Préwarm initial
      try {
        prefetchTilesAround(INITIAL_CENTER, map.getZoom() || 14, AGGRESSIVE_MODE ? 3 : 2);
      } catch (e) {
        console.warn("initial prefetch failed", e);
      }

      map.on("moveend", schedulePrefetch);
      map.on("zoomend", schedulePrefetch);

      perfMeasure('mapLoad');
    });

    // --- RN → Web bridge ---
    window.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg || !msg.type) return;

        if (msg.type === "gpsUpdate") {
          updateGps(msg.coords, msg.zoom);
        } else if (msg.type === "updateRoute" && msg.start && msg.end) {
          updateRoute(msg.start, msg.end);
        } else if (msg.type === "updateDrivers" && Array.isArray(msg.drivers)) {
          updateDrivers(msg.drivers);
        } else if (msg.type === "setPrefetchMode") {
          // Toggle prefetch mode from RN
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
    });

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

    // --- Route OSRM avec abort signal ---
    let routeAbortController = null;

    function updateRoute(start, end) {
      if (routeAbortController) routeAbortController.abort();
      routeAbortController = new AbortController();

      if (map.getLayer("route-line")) map.removeLayer("route-line");
      if (map.getLayer("route-casing")) map.removeLayer("route-casing");
      if (map.getSource("route")) map.removeSource("route");

      const url =
        "https://router.project-osrm.org/route/v1/driving/" +
        start[0] + "," + start[1] + ";" + end[0] + "," + end[1] +
        "?geometries=geojson&steps=true&overview=full&annotations=true";

      fetch(url, { signal: routeAbortController.signal })
        .then((r) => r.json())
        .then((data) => {
          if (!data.routes || !data.routes.length) return;
          const route = data.routes[0];

          map.addSource("route", {
            type: "geojson",
            data: route.geometry,
          });

          map.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            paint: {
              "line-color": "#000000",
              "line-width": 10,
              "line-opacity": 0.25,
            },
          });

          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: {
              "line-color": "#007cbf",
              "line-width": 6,
              "line-opacity": 0.9,
            },
          });

          const coords = route.geometry.coordinates;
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, {
            padding: 32,
            duration: 700,
            maxZoom: 16,
          });

          const duration = Math.round(route.duration / 60);
          const distance = (route.distance / 1000).toFixed(1);
          try {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(
                JSON.stringify({ type: "routeInfo", duration, distance })
              );
            }
          } catch {}
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error("Route error:", err);
            try {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(
                  JSON.stringify({ type: "routeError", error: String(err) })
                );
              }
            } catch {}
          }
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

    // --- Service Worker cache optimisé ---
    if ("serviceWorker" in navigator) {
      try {
        navigator.serviceWorker.register(
          "data:text/javascript," +
            encodeURIComponent(\`
              const CACHE_NAME = "vtc-map-cache-v2";
              const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 jours
              
              async function getCacheAge(url) {
                try {
                  const cache = await caches.open(CACHE_NAME);
                  const res = await cache.match(url);
                  if (!res) return null;
                  const dateStr = res.headers.get('date');
                  return dateStr ? Date.now() - new Date(dateStr).getTime() : null;
                } catch {
                  return null;
                }
              }

              self.addEventListener("fetch", (e) => {
                if (e.request.url.includes("tiles.openfreemap.org")) {
                  e.respondWith(
                    (async () => {
                      const cache = await caches.open(CACHE_NAME);
                      const cached = await cache.match(e.request);
                      
                      if (cached) {
                        const age = await getCacheAge(e.request.url);
                        if (age && age < MAX_CACHE_AGE) {
                          return cached;
                        }
                      }

                      try {
                        const res = await fetch(e.request);
                        if (res && res.ok && res.status === 200) {
                          cache.put(e.request, res.clone());
                        }
                        return res;
                      } catch {
                        return cached || new Response("Offline", { status: 503 });
                      }
                    })()
                  );
                }
              });
            \`)
        );
      } catch (e) {
        console.warn("SW register failed", e);
      }
    }
  </script>
</body>
</html>
`;
}
