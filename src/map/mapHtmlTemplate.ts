import type { LatLng } from "./types";

interface PrefetchConfig {
  enabled: boolean;
  aggressiveMode: boolean;
  debugMode: boolean;
}

const DEFAULT_PREFETCH_CONFIG: PrefetchConfig = {
  enabled: true,
  aggressiveMode: false,
  debugMode: false,
};

export function buildMapHtmlTemplate(
  initialLocation: LatLng,
  prefetchConfig: PrefetchConfig = DEFAULT_PREFETCH_CONFIG,
  initialZoom = 14,
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
  <meta name="color-scheme" content="light" />
  <meta name="theme-color" content="#e8eef4" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; background-color: #e8eef4; }
    #map { position: absolute; top: 0; bottom: 0; width: 100%; }
    #map canvas { background-color: #e8eef4; }

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

    /* GPS nav puck: always points up on screen; map bearing does the turn */
    .gps-nav-puck {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45));
    }
    .gps-nav-puck svg {
      display: block;
      width: 36px;
      height: 36px;
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
    const INITIAL_ZOOM = ${Number(initialZoom) || 14};
    const PREFETCH_ENABLED = ${prefetchEnabled};
    const AGGRESSIVE_MODE = ${aggressiveMode};

    // --- MapLibre init avec WebGL optimisations ---
    const map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
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

    // Prefetch Cache API — bounded Western Europe overview tiles (z4–7)
    const WEST_EUROPE_BOUNDS = [
      [-10.5, 35.0],
      [12.5, 55.0],
    ];
    const TILE_URL =
      "https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf";

    function tilesForBounds(bounds, z) {
      const n = Math.pow(2, z);
      const x0 = Math.max(0, long2tile(bounds[0][0], z));
      const x1 = Math.min(n - 1, long2tile(bounds[1][0], z));
      const y0 = Math.max(0, lat2tile(bounds[1][1], z));
      const y1 = Math.min(n - 1, lat2tile(bounds[0][1], z));
      const out = [];
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          out.push(
            TILE_URL.replace("{z}", String(z))
              .replace("{x}", String(x))
              .replace("{y}", String(y))
          );
        }
      }
      return out;
    }

    async function prefetchTilesAround() {
      if (!PREFETCH_ENABLED || !shouldPrefetch()) return;
      try {
        const cache = await caches.open("ve-eu-tiles-v1");
        const urls = [];
        [4, 5, 6, 7].forEach(function (z) {
          tilesForBounds(WEST_EUROPE_BOUNDS, z).forEach(function (u) {
            urls.push(u);
          });
        });
        const concurrency = 4;
        let i = 0;
        async function worker() {
          while (i < urls.length) {
            const url = urls[i++];
            try {
              const hit = await cache.match(url);
              if (hit) continue;
              const res = await fetch(url, { mode: "cors" });
              if (res && res.ok) await cache.put(url, res.clone());
            } catch (_) {}
          }
        }
        await Promise.all(
          Array.from({ length: concurrency }, function () {
            return worker();
          })
        );
      } catch (e) {
        console.warn("[Prefetch]", e);
      }
    }

    function schedulePrefetch() {
      if (!PREFETCH_ENABLED) return;
      setTimeout(function () {
        prefetchTilesAround();
      }, 2000);
    }

    function setOverviewWestEurope(durationMs, fitPadding) {
      offerRoutePresented = false;
      const duration = durationMs == null ? 0 : Number(durationMs);
      const pad = normalizeFitPadding(fitPadding, 16);
      try {
        beginProgrammaticCamera(Math.max(duration, 50));
        map.fitBounds(WEST_EUROPE_BOUNDS, {
          padding: pad,
          duration: duration,
          maxZoom: 6,
        });
      } catch (e) {
        console.warn("setOverviewWestEurope", e);
      }
    }

    function normalizeFitPadding(fitPadding, padBottomFallback) {
      if (fitPadding && typeof fitPadding === "object") {
        return {
          top: Math.max(8, Number(fitPadding.top) || 28),
          right: Math.max(8, Number(fitPadding.right) || 28),
          bottom: Math.max(8, Number(fitPadding.bottom) || 48),
          left: Math.max(8, Number(fitPadding.left) || 28),
        };
      }
      return {
        top: 28,
        left: 28,
        right: 28,
        bottom: Math.max(48, Number(padBottomFallback) || 48),
      };
    }

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
      schedulePrefetch();
    });

    // Ignore camera events caused by easeTo / fitBounds from RN
    window.__veProgrammaticCamera = false;
    window.__veProgrammaticCameraUntil = 0;
    function beginProgrammaticCamera(durationMs) {
      const ms = Math.max(300, Number(durationMs) || 800) + 120;
      window.__veProgrammaticCamera = true;
      window.__veProgrammaticCameraUntil = Date.now() + ms;
      setTimeout(function () {
        if (Date.now() >= window.__veProgrammaticCameraUntil) {
          window.__veProgrammaticCamera = false;
        }
      }, ms);
    }

    function notifyUserMapInteract() {
      if (window.__veProgrammaticCamera) return;
      if (Date.now() < window.__veProgrammaticCameraUntil) return;
      const now = Date.now();
      if (window.__veLastUserInteractAt && now - window.__veLastUserInteractAt < 150) {
        return;
      }
      window.__veLastUserInteractAt = now;
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: "userMapInteract" })
          );
        }
      } catch (_) {}
    }

    window.__veLastUserInteractAt = 0;
    map.on("dragstart", notifyUserMapInteract);
    map.on("zoomstart", notifyUserMapInteract);
    map.on("rotatestart", notifyUserMapInteract);
    map.on("pitchstart", notifyUserMapInteract);
    // Some WebView platforms skip *start; drag confirms a real user pan
    map.on("drag", notifyUserMapInteract);

    // --- RN → Web bridge (iOS: window, Android: document) ---
    function handleNativeMessage(event) {
      try {
        const raw = event && event.data !== undefined ? event.data : event;
        const msg = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!msg || !msg.type) return;

        if (msg.type === "gpsUpdate") {
          updateGps(msg.coords, msg);
        } else if (msg.type === "updateRoute" && msg.start && msg.end) {
          updateRoute(
            msg.start,
            msg.end,
            msg.approachFrom || null,
            msg.fitPadding || null,
            msg.fitPaddingBottom || 32,
            msg.fitBounds !== false,
            msg.presentation === "offer" ? "offer" : "default",
            msg.offerOverview === true
          );
        } else if (msg.type === "setOverview") {
          setOverviewWestEurope(
            msg.durationMs == null ? 0 : Number(msg.durationMs),
            msg.fitPadding || null
          );
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

    // --- GPS marker + navigation camera (look-ahead along OSRM line) ---
    window.__veNavLine = null;
    window.__veNavSteps = null;
    window.__veLastGpsCoords = null;
    window.__veGpsMarker = null;

    function haversineMeters(a, b) {
      const toRad = Math.PI / 180;
      const dLat = (b[1] - a[1]) * toRad;
      const dLng = (b[0] - a[0]) * toRad;
      const lat1 = a[1] * toRad;
      const lat2 = b[1] * toRad;
      const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function bearingDegrees(from, to) {
      const toRad = Math.PI / 180;
      const toDeg = 180 / Math.PI;
      const φ1 = from[1] * toRad;
      const φ2 = to[1] * toRad;
      const Δλ = (to[0] - from[0]) * toRad;
      const y = Math.sin(Δλ) * Math.cos(φ2);
      const x =
        Math.cos(φ1) * Math.sin(φ2) -
        Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
      return (Math.atan2(y, x) * toDeg + 360) % 360;
    }

    /** Point ~lookAheadM along the nav polyline ahead of current position */
    function lookAheadPoint(coords, line, lookAheadM) {
      if (!line || !line.length) return null;
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < line.length; i++) {
        const d = haversineMeters(coords, line[i]);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }
      let traveled = 0;
      for (let i = nearestIdx; i < line.length - 1; i++) {
        const seg = haversineMeters(line[i], line[i + 1]);
        if (traveled + seg >= lookAheadM) {
          return line[i + 1];
        }
        traveled += seg;
      }
      return line[line.length - 1];
    }

    function ensureGpsArrowMarker() {
      if (window.__veGpsMarker) return window.__veGpsMarker;
      // Remove legacy circle layer if present
      try {
        if (map.getLayer("gps-marker")) map.removeLayer("gps-marker");
        if (map.getSource("gps-point")) map.removeSource("gps-point");
      } catch (e) {}

      const el = document.createElement("div");
      el.className = "gps-nav-puck";
      el.innerHTML =
        '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<circle cx="24" cy="24" r="22" fill="rgba(16,185,129,0.22)"/>' +
        '<path d="M24 6 L38 38 L24 30 L10 38 Z" fill="#10b981" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>' +
        "</svg>";

      window.__veGpsMarker = new maplibregl.Marker({
        element: el,
        anchor: "center",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      });
      window.__veGpsMarkerAdded = false;
      return window.__veGpsMarker;
    }

    function postRouteProgress(coords) {
      try {
        if (!window.ReactNativeWebView) return;
        const line = window.__veNavLine;
        const steps = window.__veNavSteps;
        let distanceMeters = 0;
        let durationSeconds = 0;
        if (window.__veRouteMeta) {
          distanceMeters = window.__veRouteMeta.distanceMeters || 0;
          durationSeconds = window.__veRouteMeta.durationSeconds || 0;
        }
        // Scale remaining roughly by fraction of polyline left from nearest point
        if (line && line.length > 1 && coords) {
          let nearestIdx = 0;
          let nearestDist = Infinity;
          for (let i = 0; i < line.length; i++) {
            const d = haversineMeters(coords, line[i]);
            if (d < nearestDist) {
              nearestDist = d;
              nearestIdx = i;
            }
          }
          let remainingLine = 0;
          for (let i = nearestIdx; i < line.length - 1; i++) {
            remainingLine += haversineMeters(line[i], line[i + 1]);
          }
          const totalLine = window.__veRouteMeta && window.__veRouteMeta.lineMeters
            ? window.__veRouteMeta.lineMeters
            : remainingLine;
          if (totalLine > 0 && distanceMeters > 0) {
            const ratio = Math.min(1, Math.max(0.02, remainingLine / totalLine));
            distanceMeters = Math.round(distanceMeters * ratio);
            durationSeconds = Math.round(durationSeconds * ratio);
          } else if (remainingLine > 0) {
            distanceMeters = Math.round(remainingLine);
          }
        }

        const nextManeuver = pickNextManeuver(coords, steps);
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "routeInfo",
            distanceMeters: distanceMeters,
            durationSeconds: durationSeconds,
            nextManeuver: nextManeuver,
          })
        );
      } catch (e) {}
    }

    function pickNextManeuver(coords, steps) {
      if (!steps || !steps.length || !coords) return null;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const man = step.maneuver || {};
        const loc = man.location;
        if (!loc || loc.length < 2) continue;
        const t = (man.type || "").toLowerCase();
        if (t === "depart") continue;
        const dist = haversineMeters(coords, loc);
        // Skip maneuvers we already passed (behind / very close)
        if (dist < 25 && t !== "arrive") continue;
        return {
          type: man.type || "turn",
          modifier: man.modifier || null,
          distanceMeters: Math.round(dist),
          name: step.name || "",
        };
      }
      const last = steps[steps.length - 1];
      const man = (last && last.maneuver) || {};
      const loc = man.location;
      return {
        type: man.type || "arrive",
        modifier: man.modifier || null,
        distanceMeters: loc ? Math.round(haversineMeters(coords, loc)) : 0,
        name: (last && last.name) || "",
      };
    }

    function resolveNavBearing(coords, opts) {
      // Prefer route look-ahead so the map faces the road (classic GPS).
      const ahead = lookAheadPoint(coords, window.__veNavLine, 70);
      if (ahead) return bearingDegrees(coords, ahead);
      if (opts && typeof opts.heading === "number" && opts.heading >= 0) {
        return opts.heading;
      }
      return map.getBearing();
    }

    function updateGps(coords, opts) {
      window.__veLastGpsCoords = coords;
      const marker = ensureGpsArrowMarker();
      marker.setLngLat(coords);
      if (!window.__veGpsMarkerAdded) {
        marker.addTo(map);
        window.__veGpsMarkerAdded = true;
      }

      if (opts && opts.followCamera === false) {
        return;
      }

      const zoom = (opts && opts.zoom) || 16;
      const duration = (opts && opts.duration) || 800;
      const pitch =
        opts && typeof opts.pitch === "number" ? opts.pitch : map.getPitch();
      const bearing = resolveNavBearing(coords, opts);

      beginProgrammaticCamera(duration);
      map.easeTo({
        center: coords,
        zoom: zoom,
        bearing: bearing,
        pitch: pitch,
        duration: duration,
        essential: true,
      });

      const now = Date.now();
      if (
        !window.__veLastProgressAt ||
        now - window.__veLastProgressAt > 2000
      ) {
        window.__veLastProgressAt = now;
        postRouteProgress(coords);
      }
    }

    // --- Routes OSRM: trip (pickup→dropoff) + dashed approach (driver→pickup) ---
    let routeAbortController = null;
    let offerRoutePresented = false;

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
      offerRoutePresented = false;
      window.__veNavLine = null;
      window.__veNavSteps = null;
      window.__veRouteMeta = null;
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

    function fitRouteBounds(coordLists, fitPadding, padBottomFallback, durationMs, maxZoom) {
      const all = [];
      coordLists.forEach((list) => {
        if (list && list.length) list.forEach((c) => all.push(c));
      });
      if (all.length < 1) return;
      const duration = durationMs == null ? 500 : Number(durationMs);
      const bounds = all.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(all[0], all[0])
      );
      beginProgrammaticCamera(Math.max(duration, 50));
      map.fitBounds(bounds, {
        padding: normalizeFitPadding(fitPadding, padBottomFallback),
        duration: duration,
        maxZoom: maxZoom == null ? 15 : Number(maxZoom),
      });
      try { map.resize(); } catch (e) {}
    }

    async function fetchOsrmGeometry(from, to, signal) {
      const url =
        "https://router.project-osrm.org/route/v1/driving/" +
        from[0] + "," + from[1] + ";" + to[0] + "," + to[1] +
        "?geometries=geojson&overview=full&steps=true";
      const res = await fetch(url, { signal });
      const data = await res.json();
      if (!data.routes || !data.routes.length) return null;
      return data.routes[0];
    }

    function notifyRoutePresented() {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: "routePresented" })
          );
        }
      } catch (_) {}
    }

    function updateRoute(start, end, approachFrom, fitPadding, fitPaddingBottom, shouldFitBounds, presentation, offerOverview) {
      const isOffer = presentation === "offer";
      if (routeAbortController) routeAbortController.abort();
      routeAbortController = new AbortController();
      const signal = routeAbortController.signal;

      if (isOffer && offerOverview) {
        offerRoutePresented = false;
        setOverviewWestEurope(0, fitPadding);
      }

      // Never paint bird-flight stubs before OSRM — looks broken on overview / cold start.
      // Endpoints + polylines appear together with the final fit (or on OSRM failure).
      window.__veNavLine = [start, end];

      let presented = false;
      function presentOnce(coordLists) {
        if (presented) return;
        presented = true;
        const zoomCap = isOffer ? 12 : 15;
        if (isOffer && offerRoutePresented) {
          if (shouldFitBounds || isOffer) {
            fitRouteBounds(coordLists, fitPadding, fitPaddingBottom, 450, zoomCap);
          }
          return;
        }
        if (shouldFitBounds || isOffer) {
          fitRouteBounds(
            coordLists,
            fitPadding,
            fitPaddingBottom,
            isOffer ? 700 : 500,
            zoomCap
          );
        }
        if (isOffer) {
          offerRoutePresented = true;
          notifyRoutePresented();
        }
      }

      function paintStraightFallback() {
        upsertEndpoints(start, end, approachFrom);
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
      }

      const offerTimeout = isOffer
        ? setTimeout(function () {
            paintStraightFallback();
            presentOnce([
              approachFrom ? [approachFrom, start, end] : [start, end],
            ]);
          }, 2500)
        : null;

      Promise.all([
        fetchOsrmGeometry(start, end, signal),
        approachFrom
          ? fetchOsrmGeometry(approachFrom, start, signal)
          : Promise.resolve(null),
      ])
        .then(([trip, approach]) => {
          if (offerTimeout) clearTimeout(offerTimeout);
          let tripCoords = [start, end];
          let drewTrip = false;
          if (trip && trip.geometry && trip.geometry.coordinates) {
            tripCoords = trip.geometry.coordinates;
            drewTrip = true;
            window.__veNavLine = tripCoords;
            let lineMeters = 0;
            for (let i = 0; i < tripCoords.length - 1; i++) {
              lineMeters += haversineMeters(tripCoords[i], tripCoords[i + 1]);
            }
            window.__veRouteMeta = {
              distanceMeters: Math.round(trip.distance || lineMeters),
              durationSeconds: Math.round(trip.duration || 0),
              lineMeters: lineMeters,
            };
            const legs = trip.legs || [];
            window.__veNavSteps =
              legs.length && legs[0].steps ? legs[0].steps : null;
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
              postRouteProgress(
                window.__veLastGpsCoords || start
              );
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
          } else if (approachFrom && drewTrip) {
            // Keep approach dashed only if OSRM approach failed but trip exists
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
          } else if (!approachFrom) {
            removeLayerSafe("approach-line");
            removeLayerSafe("approach-casing");
            removeSourceSafe("approach");
          }

          if (!drewTrip) {
            paintStraightFallback();
          } else {
            upsertEndpoints(start, end, approachFrom);
          }

          presentOnce([approachCoords.length ? approachCoords : [], tripCoords]);
        })
        .catch((err) => {
          if (offerTimeout) clearTimeout(offerTimeout);
          if (err && err.name === "AbortError") return;
          console.error("Route error:", err);
          paintStraightFallback();
          presentOnce([
            approachFrom ? [approachFrom, start, end] : [start, end],
          ]);
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
