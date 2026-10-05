import type { LatLng } from "./types";
import { offerMapZoomScriptBlock } from "../lib/utils/offerMapZoom";
import { MAP_PALETTE } from "../lib/mapPalette";
import { BASEMAP_CANVAS, BASEMAP_TONE_JS } from "./basemapTone";
import { FROST_RIM_CORNER_SPAN, GLASS_MATERIAL } from "../lib/theme";
import { NAV_GUIDANCE_SOURCE } from "./navGuidanceSource";
import {
  OFFER_APPROACH_HIDE_MAX_METERS,
  OFFER_PICKUP_DECLUTTER_MIN_SPAN_KM,
  OFFER_PICKUP_HIDE_MAX_METERS,
} from "../lib/utils/markerDeclutter";

/** Neon rim shared by every outline, ready to interpolate into CSS/SVG. */
const NEON_BLUR = `${MAP_PALETTE.neonBlur}px`;

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
  /** Les reglages du rattrapage de la fleche (D-23), venus de la politique de la course. */
  navPolicy?: Record<string, number>,
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
  <meta name="theme-color" content="${BASEMAP_CANVAS}" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; background-color: ${BASEMAP_CANVAS}; }
    #map { position: absolute; top: 0; bottom: 0; width: 100%; }
    /* Frost cards. Blur is a copy of the map canvas; the veil and the rim sit on that copy. */
    #ve-frost {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      pointer-events: none;
      z-index: 4;
    }
    #map canvas { background-color: ${BASEMAP_CANVAS}; }

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

    /* Marker wrapper — size and neon filter are set per marker in JS. */
    .route-marker {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .route-marker svg { display: block; }

    /* GPS nav puck: solid (declutter handles overlap with pickup at low zoom) */
    .gps-nav-puck {
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      filter: drop-shadow(0 2px 5px rgba(0,0,0,0.45)) drop-shadow(0 0 ${NEON_BLUR} ${MAP_PALETTE.driverGlow});
    }
    .gps-nav-puck svg {
      display: block;
      width: 48px;
      height: 48px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="ve-frost"></div>
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
    ${BASEMAP_TONE_JS}

    function __veBoot(mapStyle) {
    const map = new maplibregl.Map({
      container: "map",
      style: mapStyle,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
      fadeDuration: 0,
      minZoom: 3,
      maxZoom: 18,
      renderWorldCopies: false,
      attributionControl: false,
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

    window.__veMap = map;

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

    async function prefetchTileUrls(urls) {
      if (!PREFETCH_ENABLED || !shouldPrefetch() || !urls.length) return;
      try {
        const cache = await caches.open("ve-eu-tiles-v1");
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

    function collectTileUrls(bounds, zoomLevels) {
      const urls = [];
      zoomLevels.forEach(function (z) {
        tilesForBounds(bounds, z).forEach(function (u) {
          urls.push(u);
        });
      });
      return urls;
    }

    async function prefetchTilesAround() {
      const urls = collectTileUrls(WEST_EUROPE_BOUNDS, [4, 5, 6, 7]);
      await prefetchTileUrls(urls);
    }

    async function prefetchBounds(bounds, zoomLevels) {
      if (!Array.isArray(bounds) || bounds.length < 2) return;
      const levels = Array.isArray(zoomLevels) && zoomLevels.length
        ? zoomLevels
        : [10, 11, 12];
      const urls = collectTileUrls(bounds, levels);
      await prefetchTileUrls(urls);
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

    // Converts RN routeFitPadding object to MapLibre padding; falls back if undefined.
    function normalizeFitPadding(fitPadding, padBottomFallback) {
      var pad;
      if (fitPadding && typeof fitPadding === "object") {
        pad = {
          top: Math.max(8, Number(fitPadding.top) || 28),
          right: Math.max(8, Number(fitPadding.right) || 28),
          bottom: Math.max(8, Number(fitPadding.bottom) || 48),
          left: Math.max(8, Number(fitPadding.left) || 28),
        };
      } else {
        pad = {
          top: 28,
          left: 28,
          right: 28,
          bottom: Math.max(48, Number(padBottomFallback) || 48),
        };
      }
      return clampPaddingToMap(pad);
    }

    // WebView-side safety clamp (mirror of offerMapFit.clampCardFitPadding).
    function clampPaddingToMap(pad) {
      var el = map.getContainer();
      var w = (el && el.clientWidth) || window.innerWidth || 390;
      var h = (el && el.clientHeight) || window.innerHeight || 844;
      var minInner = 160; // lower (e.g. 140) only if RN padding is already sane
      var maxHoriz = Math.max(16, w - minInner);
      var maxVert = Math.max(16, h - minInner);
      var next = {
        top: pad.top,
        right: pad.right,
        bottom: pad.bottom,
        left: pad.left,
      };
      var horiz = next.left + next.right;
      var vert = next.top + next.bottom;
      if (horiz > maxHoriz && horiz > 0) {
        var sx = maxHoriz / horiz;
        next.left = Math.max(8, Math.round(next.left * sx));
        next.right = Math.max(8, Math.round(next.right * sx));
      }
      if (vert > maxVert && vert > 0) {
        // The bottom inset is the offer card. Shrink the top first so the route stays in
        // the band above the card; scaling both sides pulled that band down under it.
        var room = Math.max(8, maxVert - 8);
        if (next.bottom >= room) {
          next.bottom = room;
          next.top = 8;
        } else {
          next.top = Math.max(8, maxVert - next.bottom);
        }
      }
      return next;
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
        const injectionError = navInjectionProbe();
        if (injectionError) {
          postNavDiag({ error: injectionError, source: "navInjectionProbe" });
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
      ensureOfferMarkerImages(map);
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

    var gpsDeclutterRaf = 0;
    map.on("move", function () {
      if (!window.__veUseCanvasGpsPuck || !window.__veLastGpsCoords) return;
      if (gpsDeclutterRaf) return;
      gpsDeclutterRaf = requestAnimationFrame(function () {
        gpsDeclutterRaf = 0;
        if (!window.__veUseCanvasGpsPuck || !window.__veLastGpsCoords) return;
        upsertGpsCanvasPuck(window.__veLastGpsCoords);
      });
    });

    // Cards above the map. Native blur cannot sample this WebView, so each card is a
    // blurred copy of the canvas plus a thin white wash. The RN panel stays clear.
    const FROST_BLUR_PX = ${GLASS_MATERIAL.backdropBlurPx};
    const FROST_RIM_PX = ${GLASS_MATERIAL.rimWidthPx};
    const FROST_RIM_CORNER_SPAN = ${FROST_RIM_CORNER_SPAN};
    const FROST_RIM_HIGHLIGHT = ${JSON.stringify(GLASS_MATERIAL.rimHighlight)};
    const FROST_RIM_SHADE = ${JSON.stringify(GLASS_MATERIAL.rimShade)};
    const FROST_RIM_MID = ${JSON.stringify(GLASS_MATERIAL.rimMid)};
    const FROST_VEIL = "linear-gradient(to bottom, ${GLASS_MATERIAL.fillTop}, ${GLASS_MATERIAL.fillBottom})";
    function frostRimPaint(w, h) {
      var radiusPx = Math.max(8, Math.round(Math.min(w, h) * FROST_RIM_CORNER_SPAN));
      var r = radiusPx + "px";
      function at(x, y, color) {
        return "radial-gradient(" + r + " " + r + " at " + x + " " + y + ", " + color + " 0%, transparent 100%)";
      }
      return [
        at("0%", "0%", FROST_RIM_HIGHLIGHT),
        at("100%", "0%", FROST_RIM_SHADE),
        at("100%", "100%", FROST_RIM_HIGHLIGHT),
        at("0%", "100%", FROST_RIM_SHADE),
        FROST_RIM_MID,
      ].join(", ");
    }

    function frostCard(root, id) {
      const nodes = root.children;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute("data-frost") === id) return nodes[i];
      }
      return null;
    }

    function applyFrost(rects) {
      const root = document.getElementById("ve-frost");
      if (!root) return;
      const next = Array.isArray(rects) ? rects : [];
      window.__veFrostRects = next;
      const keep = {};
      for (let i = 0; i < next.length; i++) {
        const r = next[i];
        if (!r || r.w <= 0 || r.h <= 0) continue;
        const id = String(r.id);
        keep[id] = true;
        let card = frostCard(root, id);
        if (!card) {
          card = document.createElement("div");
          card.setAttribute("data-frost", id);
          card.style.position = "absolute";
          card.style.overflow = "visible";
          card.style.pointerEvents = "none";
          card.style.background = "none";
          const face = document.createElement("div");
          face.setAttribute("data-frost-face", "");
          face.style.position = "absolute";
          face.style.overflow = "hidden";
          face.style.pointerEvents = "none";
          const canvas = document.createElement("canvas");
          canvas.style.position = "absolute";
          canvas.style.left = "0";
          canvas.style.top = "0";
          face.appendChild(canvas);
          const veil = document.createElement("div");
          veil.style.position = "absolute";
          veil.style.left = "0";
          veil.style.top = "0";
          veil.style.right = "0";
          veil.style.bottom = "0";
          veil.style.background = FROST_VEIL;
          face.appendChild(veil);
          card.appendChild(face);
          const rim = document.createElement("div");
          rim.setAttribute("data-frost-rim", "");
          rim.style.position = "absolute";
          rim.style.left = "0";
          rim.style.top = "0";
          rim.style.right = "0";
          rim.style.bottom = "0";
          rim.style.boxSizing = "border-box";
          rim.style.pointerEvents = "none";
          rim.style.padding = FROST_RIM_PX + "px";
          rim.style.background = FROST_RIM_MID;
          rim.style.mixBlendMode = "overlay";
          const punch = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";
          rim.style.webkitMask = punch;
          rim.style.webkitMaskComposite = "xor";
          rim.style.mask = punch;
          rim.style.maskComposite = "exclude";
          card.appendChild(rim);
          root.appendChild(card);
        }
        const rimPx = FROST_RIM_PX;
        card.style.left = (r.x - rimPx) + "px";
        card.style.top = (r.y - rimPx) + "px";
        card.style.width = (r.w + rimPx * 2) + "px";
        card.style.height = (r.h + rimPx * 2) + "px";
        const faceNode = card.querySelector("[data-frost-face]");
        if (faceNode) {
          faceNode.style.left = rimPx + "px";
          faceNode.style.top = rimPx + "px";
          faceNode.style.width = r.w + "px";
          faceNode.style.height = r.h + "px";
          faceNode.style.borderRadius = (r.radius || 0) + "px";
        }
        const rimNode = card.querySelector("[data-frost-rim]");
        if (rimNode) {
          rimNode.style.borderRadius = ((r.radius || 0) + rimPx) + "px";
          rimNode.style.background = frostRimPaint(r.w + rimPx * 2, r.h + rimPx * 2);
        }
      }
      const cards = root.querySelectorAll("[data-frost]");
      for (let i = cards.length - 1; i >= 0; i--) {
        if (!keep[cards[i].getAttribute("data-frost")]) cards[i].remove();
      }
      try { if (window.__veMap) window.__veMap.triggerRepaint(); } catch (e) {}
    }

    function paintFrost() {
      const mapRef = window.__veMap;
      const rects = window.__veFrostRects || [];
      const root = document.getElementById("ve-frost");
      if (!mapRef || !root || !rects.length) return;
      const src = mapRef.getCanvas();
      if (!src || !src.width || !src.clientWidth) return;
      const scaleX = src.width / src.clientWidth;
      const scaleY = src.height / src.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const pad = FROST_BLUR_PX;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const card = frostCard(root, String(r.id));
        if (!card) continue;
        const faceNode = card.querySelector("[data-frost-face]");
        const canvas = faceNode ? faceNode.firstChild : null;
        if (!canvas || !canvas.getContext) continue;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        const bw = Math.max(1, Math.round(r.w * dpr));
        const bh = Math.max(1, Math.round(r.h * dpr));
        if (canvas.width !== bw) canvas.width = bw;
        if (canvas.height !== bh) canvas.height = bh;
        canvas.style.width = r.w + "px";
        canvas.style.height = r.h + "px";
        ctx.clearRect(0, 0, bw, bh);
        ctx.save();
        ctx.filter = "blur(" + (FROST_BLUR_PX * dpr) + "px)";
        try {
          ctx.drawImage(
            src,
            (r.x - pad) * scaleX,
            (r.y - pad) * scaleY,
            (r.w + pad * 2) * scaleX,
            (r.h + pad * 2) * scaleY,
            -pad * dpr,
            -pad * dpr,
            (r.w + pad * 2) * dpr,
            (r.h + pad * 2) * dpr
          );
        } catch (e) {}
        ctx.restore();
      }
    }

    let frostPaintAt = 0;
    if (window.__veMap) {
      window.__veMap.on("render", function () {
        if (!window.__veFrostRects || !window.__veFrostRects.length) return;
        const now = performance.now();
        if (now - frostPaintAt < 32) return;
        frostPaintAt = now;
        paintFrost();
      });
    }

    // --- RN → Web bridge (iOS: window, Android: document) ---
    function handleNativeMessage(event) {
      let messageType = null;
      try {
        const raw = event && event.data !== undefined ? event.data : event;
        const msg = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!msg || !msg.type) return;
        messageType = msg.type;

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
            msg.offerOverview === true,
            msg.driverMarker || null,
            msg.routeGeneration,
            msg.navigation === true
          );
        } else if (msg.type === "routeGeometry" || msg.type === "routeError") {
          // The line is resolved by the app (deadline + fallback endpoint); this document only
          // draws it. routeGeneration is checked inside, so a late answer is dropped.
          if (typeof window.__veRouteCommit === "function") {
            window.__veRouteCommit(msg);
          }
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
        } else if (msg.type === "prefetchBounds" && Array.isArray(msg.bounds)) {
          prefetchBounds(msg.bounds, msg.zoomLevels || [10, 11, 12]);
        } else if (msg.type === "rerouteCheck") {
          rerouteCheckNow();
        } else if (msg.type === "setFrost" && Array.isArray(msg.rects)) {
          applyFrost(msg.rects);
        }
      } catch (e) {
        console.error("Message parse error:", e);
        // Anything thrown by a message handler lands here too — a throw inside updateGps or
        // updateRoute is otherwise indistinguishable from a malformed payload, and both were
        // silent on the app side. Reporting it turns "the camera does not move" into a row, and
        // message_type is null exactly when the payload never parsed.
        postNavDiag({
          error: navErrorMessage(e),
          source: "handleNativeMessage",
          message_type: messageType,
        });
      }
    }
    window.addEventListener("message", handleNativeMessage);
    document.addEventListener("message", handleNativeMessage);
    window.__veHandleNativeMessage = handleNativeMessage;

    // --- GPS marker + navigation camera (look-ahead along the routed line) ---
    //
    // One owner for everything the guidance camera and the puck need. It used to be a dozen
    // loose window.__ve* globals, which is how __veNavCourseUp survived a clearAllRoutes()
    // and left the arrow stuck facing north while the map had gone back to north-up.
    window.__veNav = {
      /** Route polyline, [lng, lat][]; a two-point array is a chord, not a road. */
      line: null,
      /** Router steps for the next-maneuver hint. */
      steps: null,
      /** { distanceMeters, durationSeconds, lineMeters } for the drawn line. */
      meta: null,
      /** True once the line is the router's own geometry rather than a chord. */
      hasRoad: false,
      /** A request is out; the line on screen is the placeholder chord. */
      pending: false,
      /** Every endpoint failed for this request. */
      failed: false,
      /** Request id, matched against the answer to drop a late one. */
      generation: null,
      /**
       * The app said this route is a guidance route (navigationFollow), not an overview.
       *
       * It used to be inferred from "not an offer and no fitBounds asked", which made the
       * camera's duty depend on a flag computed on the other side of the bridge. The camera now
       * knows what it is for, and a fit can never be asked for while it is guiding.
       */
      navigating: false,
      /** True when the camera was last oriented to the route azimuth. */
      courseUp: false,
      /** Last bearing actually applied to the map. */
      bearing: null,
      /** Last position the puck was drawn at. */
      coords: null,
      /**
       * Where the drawn line was last cut, and for which request. Re-cutting on every tick would
       * rebuild the route source several times a second for a few metres of progress.
       */
      trimAnchor: null,
      zoom: 19,
      pitch: 50,
      speed: null,
      heading: null,
      offRouteSince: null,
      awaitingReroute: false,
      followCamera: true,
      snapOk: false,
      progressM: null,
      gpsProgressM: null,
      /** Speed estimate, m/s, EMA over matched fixes. The display clock integrates it. */
      vEst: 0,
      /** Where the estimate came from on the last fix: derived | coords | none. */
      speedSource: "none",
      lastGpsProgressM: null,
      lastGpsAtMs: null,
      /**
       * Cumulative distance at each vertex, paired with the line it was built from.
       *
       * Held by identity: the display loop paints every frame and must not walk the polyline
       * twice per frame, so the table is rebuilt only when the line array itself changes.
       */
      cum: null,
      cumLine: null,
      /** Frames painted since the loop started, and its measured rate, for the diagnostic. */
      displayFrames: 0,
      displayStartedAt: 0,
      displayFps: 0,
      displayFpsAt: 0,
      lastTickStalled: false,
      lastFrameAt: 0,
      lastPaintAt: 0,
    };
    window.__veLastGpsCoords = null;
    window.__veLastRawGpsCoords = null;
    window.__veGpsMarker = null;

    /**
     * Message text from anything thrown, without assuming it is an Error.
     */
    function navErrorMessage(error) {
      if (!error) return "unknown";
      if (typeof error === "string") return error;
      return String(error.message || error.name || error);
    }

    /**
     * One structured line per guidance tick, into the app's own diagnostic sink.
     *
     * Guidance lives entirely inside this document, so a camera that never turned left no trace
     * anywhere: a throw in the tick was swallowed by the message bridge below, and all the app
     * saw was a map that stayed north. This reports the decision (course_up, bearing, zoom)
     * rather than only the inputs, which is what makes "it did not turn" nameable without a
     * WebView debugger.
     *
     * Throttled twice, and on separate clocks: the tick fires at 1 Hz and the sink has a 7-day
     * retention, while errors deserve to be read. A failing tick would otherwise write 60 rows a
     * minute, and an error alternating with a healthy tick would be swallowed by the healthy
     * one's window and never reported at all.
     */
    var NAV_DIAG_MIN_INTERVAL_MS = 5000;
    window.__veLastNavDiagAt = 0;
    window.__veLastNavErrorAt = 0;
    function postNavDiag(detail) {
      try {
        if (!window.ReactNativeWebView) return;
        var now = Date.now();
        if (detail.error) {
          if (now - window.__veLastNavErrorAt < NAV_DIAG_MIN_INTERVAL_MS) return;
          window.__veLastNavErrorAt = now;
        } else {
          if (now - window.__veLastNavDiagAt < NAV_DIAG_MIN_INTERVAL_MS) return;
          window.__veLastNavDiagAt = now;
        }
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "navDiag", detail: detail })
        );
      } catch (e) {}
    }

    /* La politique de rattrapage, avant les helpers : posee par l'app, ajustable en base. */
    window.__veNavPolicy = ${JSON.stringify(navPolicy ?? {})};

    /* VE_NAV_HELPERS_START */
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

    /* The guidance helpers are embedded as literal text, never as a toString() result: Hermes
       ships bytecode and discards the source, so toString() yields the bytecode placeholder and
       every call throws on a release build. See navGuidanceSource.ts. */
    ${NAV_GUIDANCE_SOURCE}
    /* VE_NAV_HELPERS_END */

    /**
     * Fail loudly if the embedded guidance helpers are hollow.
     *
     * The helpers used to arrive through toString(), which Hermes answers with a bytecode
     * placeholder: the definition is valid and every call throws, so guidance silently fell back
     * and the only trace was a flood of nav_tick_error. This probe runs on the device, where the
     * document is the only observer, and names the failure instead of leaving it to be inferred.
     * Returns the reason string, or null when the helpers answer correctly.
     */
    function navInjectionProbe() {
      try {
        const plan = planNavCamera({
          traceBearing: 137,
          deviceHeading: 300,
          mapBearing: 0,
          lastBearing: 12,
        });
        if (!plan || plan.bearing !== 137 || plan.courseUp !== true) {
          return "planNavCamera answered " + JSON.stringify(plan);
        }
        const snap = snapToNavLine(
          [2.301, 48.8404],
          [
            [2.3, 48.84],
            [2.302, 48.84],
            [2.304, 48.84],
          ],
          60
        );
        if (!snap || typeof snap.traveledMeters !== "number") {
          return "snapToNavLine answered " + JSON.stringify(snap);
        }
        const motion = stepNavMotion(
          {
            progressM: 40,
            gpsProgressM: 40,
            vEst: 10,
            lastGpsProgressM: 40,
            lastGpsAtMs: Date.now(),
          },
          0.05,
          Date.now()
        );
        if (!motion || !(motion.progressM > 40)) {
          return "stepNavMotion answered " + JSON.stringify(motion);
        }
        return null;
      } catch (error) {
        return navErrorMessage(error);
      }
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

    // The puck keeps the trip route's blue on purpose, so a white ring is painted
    // under it: the ring, not the hue, is what detaches it from the route it sits
    // on. The ring is the same path with a wider stroke, hence the padded viewBox
    // (path spans x 8..56 / y 4..58; the 14px stroke reaches x 1..63 / y -3..65).
    var GPS_ARROW_SVG =
      '<svg width="64" height="64" viewBox="-4 -4 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M32 4 L56 58 L32 44 L8 58 Z" fill="${MAP_PALETTE.driverRing}" stroke="${MAP_PALETTE.driverRing}" stroke-width="14" stroke-linejoin="round"/>' +
      '<path d="M32 4 L56 58 L32 44 L8 58 Z" fill="${MAP_PALETTE.driver}" stroke="${MAP_PALETTE.driverEdge}" stroke-width="2.5" stroke-linejoin="round"/>' +
      "</svg>";

    ${offerMapZoomScriptBlock()}

    function ensureGpsArrowMarker() {
      if (window.__veGpsMarker) return window.__veGpsMarker;
      try {
        if (map.getLayer("gps-marker")) map.removeLayer("gps-marker");
        if (map.getSource("gps-point")) map.removeSource("gps-point");
      } catch (e) {}

      const el = document.createElement("div");
      el.className = "gps-nav-puck";
      el.innerHTML = GPS_ARROW_SVG;

      window.__veGpsMarker = new maplibregl.Marker({
        element: el,
        anchor: "center",
        pitchAlignment: "viewport",
        // Rotated in map space so the arrow keeps pointing along the track at
        // any camera bearing — same behaviour as the canvas puck below.
        rotationAlignment: "map",
      });
      window.__veGpsMarkerAdded = false;
      return window.__veGpsMarker;
    }

    function hideHtmlGpsMarker() {
      if (window.__veGpsMarker && window.__veGpsMarkerAdded) {
        window.__veGpsMarker.remove();
        window.__veGpsMarkerAdded = false;
      }
    }

    function removeGpsCanvasPuck() {
      removeLayerSafe("gps-puck");
      removeSourceSafe("gps-puck");
    }

    function offerPickupNegligible() {
      if (!window.__veUseCanvasGpsPuck) return false;
      var gps = window.__veLastGpsCoords;
      var pickup = window.__veOfferPickup;
      if (!gps || !pickup) return false;
      var fitPoints = [gps, pickup];
      if (window.__veOfferDropoff) fitPoints.push(window.__veOfferDropoff);
      var spanKm = computeFitSpanKm([fitPoints]);
      if (spanKm < ${OFFER_PICKUP_DECLUTTER_MIN_SPAN_KM}) return false;
      var toRad = Math.PI / 180;
      var dLat = (pickup[1] - gps[1]) * toRad;
      var dLng = (pickup[0] - gps[0]) * toRad;
      var lat1 = gps[1] * toRad;
      var lat2 = pickup[1] * toRad;
      var h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      var meters =
        6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      return meters < ${OFFER_PICKUP_HIDE_MAX_METERS};
    }

    // Hide orange approach only when already near pickup (meters). Screen px
    // alone is too strict after long-trip dezoom (far points look stacked).
    function offerApproachNegligible() {
      if (!window.__veUseCanvasGpsPuck) return false;
      var gps = window.__veLastGpsCoords;
      var pickup = window.__veOfferPickup;
      if (!gps || !pickup) return false;
      var toRad = Math.PI / 180;
      var dLat = (pickup[1] - gps[1]) * toRad;
      var dLng = (pickup[0] - gps[0]) * toRad;
      var lat1 = gps[1] * toRad;
      var lat2 = pickup[1] * toRad;
      var h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      var meters =
        6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      return meters < ${OFFER_APPROACH_HIDE_MAX_METERS};
    }

    function syncOfferPickupVisibility() {
      var hidePin = offerPickupNegligible();
      var hideApproach = offerApproachNegligible();
      var pinVis = hidePin ? "none" : "visible";
      var approachVis = hideApproach ? "none" : "visible";
      try {
        if (map.getLayer("endpoint-pickup")) {
          map.setLayoutProperty("endpoint-pickup", "visibility", pinVis);
        }
        if (map.getLayer("approach-line")) {
          map.setLayoutProperty("approach-line", "visibility", approachVis);
        }
        if (map.getLayer("approach-line-glow")) {
          map.setLayoutProperty(
            "approach-line-glow",
            "visibility",
            approachVis,
          );
        }
        if (map.getLayer("approach-casing")) {
          map.setLayoutProperty("approach-casing", "visibility", approachVis);
        }
      } catch (_) {}
      if (window.__vePickupMarker) {
        var el = window.__vePickupMarker.getElement();
        if (el) el.style.display = hidePin ? "none" : "";
      }
    }

    function gpsBearingAlongTrack(gpsCoords) {
      if (offerPickupNegligible() && window.__veOfferDropoff) {
        return bearingDegrees(gpsCoords, window.__veOfferDropoff);
      }
      var approach = window.__veApproachLine;
      if (approach && approach.length > 1) {
        var ahead = lookAheadPoint(gpsCoords, approach, 140);
        if (ahead) return bearingDegrees(gpsCoords, ahead);
      }
      var pickup = window.__veOfferPickup;
      if (pickup) return bearingDegrees(gpsCoords, pickup);
      return 0;
    }

    function upsertGpsCanvasPuck(coords, bearingOverride) {
      if (!coords) return;
      var bearing =
        typeof bearingOverride === "number"
          ? bearingOverride
          : gpsBearingAlongTrack(coords);
      ensureOfferMarkerImages(map, function () {
        if (!map.hasImage("gps-chevron")) return;
        var data = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { bearing: bearing },
              geometry: { type: "Point", coordinates: coords },
            },
          ],
        };
        var src = map.getSource("gps-puck");
        if (src) {
          src.setData(data);
        } else {
          map.addSource("gps-puck", { type: "geojson", data: data });
        }
        if (!map.getLayer("gps-puck")) {
          map.addLayer({
            id: "gps-puck",
            type: "symbol",
            source: "gps-puck",
            layout: {
              "icon-image": "gps-chevron",
              "icon-size": 1.22,
              "icon-anchor": "center",
              "icon-rotate": ["get", "bearing"],
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            },
          });
        } else {
          map.setLayoutProperty("gps-puck", "icon-image", "gps-chevron");
          map.setLayoutProperty("gps-puck", "icon-size", 1.22);
          map.setLayoutProperty("gps-puck", "icon-rotate", ["get", "bearing"]);
          map.setLayoutProperty("gps-puck", "icon-rotation-alignment", "map");
        }
        syncOfferPickupVisibility();
      });
    }

    /**
     * Draw the driver puck, from the same bearing the camera was given.
     *
     * courseUp is passed by the caller that actually oriented the camera to the route, never
     * read from a sticky flag: a viewport-aligned arrow with rotation 0 is only truthful while
     * the map itself faces that bearing, and trusting a leftover flag is what froze the arrow
     * pointing north on a north-up map.
     */
    function syncGpsPuck(coords, bearingOverride, courseUp) {
      if (!coords) return;
      window.__veLastGpsCoords = coords;
      var along = bearingAlongNavLine(coords);
      var bearing =
        typeof bearingOverride === "number"
          ? bearingOverride
          : along !== null
            ? along
            : gpsBearingAlongTrack(coords);
      if (window.__veUseCanvasGpsPuck) {
        hideHtmlGpsMarker();
        upsertGpsCanvasPuck(coords, bearing);
        return;
      }
      removeGpsCanvasPuck();
      const marker = ensureGpsArrowMarker();
      marker.setLngLat(coords);
      if (courseUp === true) {
        // The camera holds this very bearing, so screen-up is the route direction.
        marker.setRotationAlignment("viewport");
        marker.setRotation(0);
      } else {
        marker.setRotationAlignment("map");
        marker.setRotation(bearing);
      }
      if (!window.__veGpsMarkerAdded) {
        marker.addTo(map);
        window.__veGpsMarkerAdded = true;
      }
    }

    function postRouteProgress(coords, traveledMeters) {
      try {
        if (!window.ReactNativeWebView) return;
        const forced = typeof traveledMeters === "number";
        const now = Date.now();
        if (
          !forced &&
          window.__veLastProgressAt &&
          now - window.__veLastProgressAt < 2000
        ) {
          return;
        }
        window.__veLastProgressAt = now;
        const nav = window.__veNav;
        const line = nav.line;
        const meta = nav.meta;
        let distanceMeters = meta ? meta.distanceMeters || 0 : 0;
        let durationSeconds = meta ? meta.durationSeconds || 0 : 0;
        // Remaining distance is the sum of the geometry still ahead. It used to be the router's
        // total scaled by a nearest-vertex ratio, which is what kept the number from falling as
        // the car moved — and what made "distance remaining" a fraction of a number that was
        // never the distance to the end of the drawn line.
        let alongTrackMeters = null;
        if (line && line.length > 1 && coords) {
          let totalLine = 0;
          for (let i = 0; i < line.length - 1; i++) {
            totalLine += haversineMeters(line[i], line[i + 1]);
          }
          let remainingLine = 0;
          if (typeof traveledMeters === "number") {
            alongTrackMeters = Math.round(Math.max(0, traveledMeters));
            remainingLine = Math.max(0, totalLine - traveledMeters);
          } else {
            let nearestIdx = 0;
            let nearestDist = Infinity;
            for (let i = 0; i < line.length; i++) {
              const d = haversineMeters(coords, line[i]);
              if (d < nearestDist) {
                nearestDist = d;
                nearestIdx = i;
              }
            }
            for (let i = nearestIdx; i < line.length - 1; i++) {
              remainingLine += haversineMeters(line[i], line[i + 1]);
            }
          }
          const remaining = Math.max(0, remainingLine);
          if (nav.hasRoad && meta && meta.lineMeters > 0) {
            distanceMeters = Math.round(remaining);
            durationSeconds = Math.round(
              (meta.durationSeconds || 0) * (remaining / meta.lineMeters)
            );
          } else if (remaining > 0) {
            // Chord only: the drawn line is straight, so the sum is a lower bound on the road —
            // better to say too little on a dashed placeholder than to invent a road distance.
            distanceMeters = Math.round(remaining);
            durationSeconds = 0;
          }
          // A stale ratio must not report arrival while the drawn end is still far.
          var endPt = line[line.length - 1];
          var toEnd = haversineMeters(coords, endPt);
          if (distanceMeters < 30 && toEnd > 30) {
            distanceMeters = Math.round(Math.max(remaining, toEnd));
          }
        }

        // The next maneuver is picked on the app side, from the steps it fetched itself: the
        // rule exists once, in navProgress.ts, where a test can pin it.
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "routeInfo",
            distanceMeters: distanceMeters,
            durationSeconds: durationSeconds,
            alongTrackMeters: alongTrackMeters,
          })
        );
      } catch (e) {}
    }

    /* VE_OFF_ROUTE_GUARD_START */
    var OFF_ROUTE_METERS = 30;
    var OFF_ROUTE_MS = 2500;

    function clearOffRouteLatch() {
      window.__veNav.offRouteSince = null;
      window.__veNav.awaitingReroute = false;
    }

    function navLineIsRoad() {
      var line = window.__veNav.line;
      return !!(line && line.length > 2);
    }

    /**
     * True once the driver has stayed more than 30 m off a real road line for 2.5 s.
     *
     * Time, not a fix count: the display loop and the GPS watch do not share a clock, and a
     * streak of frames would latch in 50 ms. The now argument is injectable so a test can drive
     * the window without sleeping. A resume check latches immediately — the screen-off gap is
     * already the hysteresis.
     */
    function latchOffRoute(coords, dist, now) {
      if (!navLineIsRoad()) return false;
      const nav = window.__veNav;
      if (nav.awaitingReroute) return true;
      var t = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
      if (!(dist > OFF_ROUTE_METERS)) {
        nav.offRouteSince = null;
        return false;
      }
      if (nav.offRouteSince == null) {
        nav.offRouteSince = t;
        return false;
      }
      if (t - nav.offRouteSince < OFF_ROUTE_MS) return false;
      nav.awaitingReroute = true;
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: "offRoute",
              lng: coords[0],
              lat: coords[1],
            })
          );
        }
      } catch (e) {}
      return true;
    }
    /* VE_OFF_ROUTE_GUARD_END */

    /* VE_REROUTE_RESUME_START */
    /**
     * Re-measure the drift on demand, with the latch force-cleared first.
     *
     * Asked for when the app returns to the foreground. The fixes that accumulated while the
     * screen was off may never have arrived as ticks, so the streak is meaningless and the latch
     * may already have been spent on a line the driver has since left. The document is the only
     * side holding the line, so the decision stays here; the reason field lets the app skip the
     * anti-flap window it would otherwise apply to a signal that arrives in a burst.
     */
    function rerouteCheckNow() {
      const nav = window.__veNav;
      if (!nav || !navLineIsRoad()) return;
      const coords = window.__veLastRawGpsCoords || window.__veLastGpsCoords;
      if (!coords) return;
      const dist = distanceToNavLine(coords, nav.line);
      clearOffRouteLatch();
      if (!(dist > OFF_ROUTE_METERS)) return;
      // The driver is already off the drawn line: the screen-off gap is the hysteresis.
      // The latch is spent here too, so the following ticks stay quiet until the new line lands.
      nav.offRouteSince = Date.now() - OFF_ROUTE_MS;
      nav.awaitingReroute = true;
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: "offRoute",
              reason: "resume",
              lng: coords[0],
              lat: coords[1],
            })
          );
        }
      } catch (e) {}
    }
    /* VE_REROUTE_RESUME_END */

    function isNavMode(opts) {
      return !!(opts && opts.navigation === true);
    }

    /** Azimuth of the trace ahead of the driver, including a two-point chord. */
    function bearingAlongNavLine(coords) {
      const line = window.__veNav.line;
      if (!line || line.length < 2 || !coords) return null;
      const end = line[line.length - 1];
      if (line.length === 2) {
        if (haversineMeters(coords, end) < 1) return null;
        return bearingDegrees(coords, end);
      }
      const snap = snapToNavLine(coords, line, 60);
      if (snap) return snap.bearing;
      if (haversineMeters(coords, end) < 1) return null;
      return bearingDegrees(coords, end);
    }

    /**
     * Look-ahead framing, as a padding rather than a zoom.
     *
     * jumpTo places the given centre at the middle of the padding-inset viewport, so a bottom
     * padding lifts the target *up* the screen — the driver ends up around a third of the way
     * down, the first turn already behind the horizon. Padding the top instead pushes the centre
     * down: with 40% above and 10% below, the puck sits at 65% of the height and two thirds of
     * the screen show the road ahead, which is the framing the reference capture asks for.
     */
    function navLookaheadPadding(opts) {
      if (!opts || opts.navigation !== true) {
        return { top: 0, bottom: 0, left: 0, right: 0 };
      }
      var h = 0;
      try {
        h = map.getContainer().clientHeight || 0;
      } catch (e) {}
      return {
        top: Math.round(h * 0.4),
        bottom: Math.round(h * 0.1),
        left: 0,
        right: 0,
      };
    }

    function moveNavCamera(camera) {
      beginProgrammaticCamera(camera.duration || 400);
      try {
        map.easeTo(camera);
      } catch (e) {
        try {
          var plain = {
            center: camera.center,
            zoom: camera.zoom,
            bearing: camera.bearing,
            pitch: camera.pitch,
            duration: camera.duration || 0,
            essential: true,
          };
          map.easeTo(plain);
        } catch (e2) {}
      }
    }

    function jumpNavCamera(camera) {
      beginProgrammaticCamera(80);
      try {
        map.jumpTo(camera);
      } catch (e) {
        try {
          map.jumpTo({
            center: camera.center,
            zoom: camera.zoom,
            bearing: camera.bearing,
            pitch: camera.pitch,
          });
        } catch (e2) {}
      }
    }

    /* VE_NAV_DISPLAY_START */
    var NAV_DISPLAY_MIN_MS = 50;
    /** A look-ahead this short follows the road's curve without lagging the corner. */
    var NAV_PAINT_LOOKAHEAD_M = 15;
    /** A frame gap past this means the display clock stopped, not that the driver did. */
    var NAV_DISPLAY_STALL_MS = 600;

    function resetNavMotion() {
      const nav = window.__veNav;
      nav.progressM = null;
      nav.gpsProgressM = null;
      nav.vEst = 0;
      nav.speedSource = "none";
      nav.lastGpsProgressM = null;
      nav.lastGpsAtMs = null;
      nav.snapOk = false;
      nav.lastPaintAt = 0;
    }

    /**
     * Cumulative table for the current line, rebuilt only when the line array itself changes.
     *
     * The display loop paints every frame and used to walk the whole polyline twice per frame
     * (once for the point, once for the look-ahead bearing). The table is what lets both be a
     * binary search, and it is keyed by identity because the route geometry is never mutated in
     * place — a new line is a new array.
     */
    function navGeometry() {
      const nav = window.__veNav;
      const line = nav.line;
      if (!line || line.length < 2) {
        nav.cum = null;
        nav.cumLine = null;
        return null;
      }
      if (nav.cumLine === line && nav.cum && nav.cum.length === line.length) {
        return nav.cum;
      }
      nav.cum = navCumulativeLengths(line);
      nav.cumLine = line;
      return nav.cum;
    }

    /**
     * The road's direction under the driver, or null when the fix is too far to be that road.
     *
     * The tolerance is the off-route guard's own OFF_ROUTE_METERS: while the fix is within it
     * the driver is considered to be on this road, so the arrow points along it. Past that the
     * car is on another street and its own heading is the truth, not the route left behind.
     */
    function routeBearingNearFix(coords) {
      const nav = window.__veNav;
      const line = nav.line;
      var cum = navGeometry();
      if (!line || !cum || !coords) return null;
      var near = navBearingNearFix(coords, line, cum, NAV_PAINT_LOOKAHEAD_M);
      if (!near || near.distanceMeters > OFF_ROUTE_METERS) return null;
      return near.bearing;
    }

    /**
     * Point the arrow along the route the moment the route is known.
     *
     * Guidance starts with the driver parked at the pickup, often before a single fix has been
     * judged admissible. Without this seed there was no bearing at all in that window, so the
     * camera asked the last resort in planNavCamera — the map's own bearing — and the arrow
     * pointed north on a road going east. The first segment *is* the road ahead, so it is the
     * direction the arrow must show; from there the motion model slews it and never snaps.
     */
    function seedNavBearingFromLine() {
      const nav = window.__veNav;
      const line = nav.line;
      var cum = navGeometry();
      if (!line || !cum) return;
      var bearing = navBearingAtDistance(line, cum, 0, NAV_PAINT_LOOKAHEAD_M);
      if (typeof bearing === "number") nav.bearing = bearing;
    }

    /**
     * Restart the display clock if its frames stop arriving.
     *
     * A requestAnimationFrame callback that never fires — a backgrounded page, a swallowed
     * throw — left the arrow frozen while the map still looked alive, and nothing reported it.
     * Restarting is safe because the motion state lives on the nav object, not in the closure.
     */
    function ensureNavDisplayWatchdog() {
      if (window.__veNavDisplayWatchdog) return;
      window.__veNavDisplayWatchdog = setInterval(function () {
        const nav = window.__veNav;
        if (!nav || !nav.navigating) return;
        if (Date.now() - (nav.lastFrameAt || 0) < NAV_DISPLAY_STALL_MS) return;
        stopNavDisplayLoop();
        ensureNavDisplayLoop();
      }, 1000);
    }

    function postRerouteSettled() {
      try {
        if (!window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "rerouteSettled" })
        );
      } catch (e) {}
    }

    function stopNavDisplayLoop() {
      // Bumping the generation retires any callback already queued: a throttled rAF that fires
      // after a restart would otherwise re-arm a second loop alongside the new one.
      window.__veNavDisplayGen = (window.__veNavDisplayGen || 0) + 1;
      if (window.__veNavDisplayRaf) {
        try {
          cancelAnimationFrame(window.__veNavDisplayRaf);
        } catch (e) {}
        window.__veNavDisplayRaf = 0;
      }
    }

    function ensureNavDisplayLoop() {
      if (window.__veNavDisplayRaf) return;
      var gen = (window.__veNavDisplayGen || 0) + 1;
      window.__veNavDisplayGen = gen;
      function frame(ts) {
        if (window.__veNavDisplayGen !== gen) return;
        if (!window.__veNav || !window.__veNav.navigating) {
          window.__veNavDisplayRaf = 0;
          return;
        }
        window.__veNavDisplayRaf = requestAnimationFrame(frame);
        window.__veNav.lastFrameAt = Date.now();
        try {
          navDisplayTick(ts);
        } catch (error) {
          postNavDiag({
            error: navErrorMessage(error),
            source: "navDisplayTick",
          });
        }
      }
      window.__veNavDisplayRaf = requestAnimationFrame(frame);
      ensureNavDisplayWatchdog();
    }

    /**
     * Paint the puck and camera from the motion model, not from a GPS teleport.
     *
     * GPS only corrects: this clock (~20 Hz) integrates the position between the watch's 8 m
     * samples, so the arrow advances continuously instead of stepping from fix to fix. A 900 ms
     * easeTo on each fix is the thing this replaced — those overlapped, and the bearing belonged
     * to whichever glide had started last.
     */
    function navDisplayPaint(center, bearing, courseUp, followCamera) {
      const nav = window.__veNav;
      var now = Date.now();
      nav.courseUp = courseUp;
      nav.bearing = bearing;
      nav.coords = center;
      nav.displayFrames = (nav.displayFrames || 0) + 1;
      if (!nav.displayStartedAt) nav.displayStartedAt = now;
      var elapsed = now - nav.displayStartedAt;
      if (elapsed >= 1000) {
        nav.displayFps = Math.round(
          ((nav.displayFrames - (nav.displayFpsAt || 0)) * 1000) / elapsed
        );
        nav.displayFpsAt = nav.displayFrames;
        nav.displayStartedAt = now;
      }
      const zoom = nav.zoom || 19;
      const pitch = typeof nav.pitch === "number" ? nav.pitch : 50;
      if (followCamera) {
        jumpNavCamera({
          center: center,
          zoom: zoom,
          bearing: bearing,
          pitch: pitch,
          padding: navLookaheadPadding({ navigation: true }),
        });
      }
      syncGpsPuck(center, bearing, courseUp);
    }

    function navDisplayTick(ts) {
      const nav = window.__veNav;
      if (!nav || !nav.navigating) return;
      var last = nav.lastPaintAt || 0;
      if (last && ts - last < NAV_DISPLAY_MIN_MS) return;
      var dt = last ? (ts - last) / 1000 : 0;
      nav.lastPaintAt = ts;

      var raw = window.__veLastRawGpsCoords;
      var line = nav.line;
      if (raw && line) {
        latchOffRoute(raw, distanceToNavLine(raw, line));
      }

      // The arrow moves whenever there is a line and a seeded position. Whether the last fix
      // matched (snapOk) decides whether it may *correct* the arrow, never whether it may
      // move: gating the paint on the match is what made it alternate between the line and the
      // raw fix, and stop dead the moment a heading disagreed.
      var cum = navGeometry();
      var hasTrack = !!(line && cum && typeof nav.progressM === "number");
      if (hasTrack && !nav.awaitingReroute) {
        var beforeStep = nav.progressM;
        var next = stepNavMotion(nav, dt, Date.now());
        nav.progressM = next.progressM;
        nav.lastTickStalled = next.progressM - beforeStep < 0.001;
      }

      var center = raw;
      var bearing = nav.bearing;
      var courseUp = false;
      if (hasTrack) {
        var along = navPointAtDistance(line, cum, nav.progressM);
        var target = navBearingAtDistance(
          line,
          cum,
          nav.progressM,
          NAV_PAINT_LOOKAHEAD_M
        );
        if (along && typeof target === "number") {
          center = along;
          bearing = smoothNavBearing(nav.bearing, target, dt, nav.vEst);
          courseUp = true;
        }
      } else if (raw) {
        var plan = planNavCamera({
          // No track to paint from, but a road may still be known: the arrow follows it rather
          // than the device heading or the map's own north. Null past the off-route tolerance,
          // where the car is on a street this route does not know.
          traceBearing: routeBearingNearFix(raw),
          deviceHeading: nav.heading,
          mapBearing: map.getBearing(),
          lastBearing: nav.bearing,
        });
        center = raw;
        bearing = smoothNavBearing(nav.bearing, plan.bearing, dt, nav.vEst);
        courseUp = plan.courseUp;
      }
      if (!center) return;

      var prev = nav.coords;
      var moved = !prev || haversineMeters(prev, center) >= 0.02;
      var turned =
        typeof nav.bearing !== "number" ||
        headingDeltaDegrees(nav.bearing, bearing) > 0.2;
      if (moved || turned || !prev) {
        navDisplayPaint(center, bearing, courseUp, nav.followCamera !== false);
      }
      if (hasTrack) {
        syncNavRouteStart(center);
      }
    }
    /* VE_NAV_DISPLAY_END */

    /**
     * The single guidance entry point: one GPS fix in, one camera and puck decision out.
     *
     * There used to be two paths — an instant faceNavTrace and a 900 ms startNavGlide — plus
     * a heldBearing that decided between them, and the arrow's orientation depended on which
     * one had run last. One tick, one bearing, applied to the map and to the puck in the same
     * call, is what makes "the arrow points where the camera points" a property instead of a
     * coincidence.
     *
     * Guarded, and it reports. This used to run bare inside the message parser's own try/catch:
     * anything thrown here — a planner that failed to inject above all — left the camera exactly
     * where the last successful command had put it, wrote nothing anywhere, and was indis-
     * tinguishable from a camera that refuses to turn. The measured "it never rotates" symptom
     * had no other explanation available from the data.
     */
    function guideTick(coords, opts) {
      try {
        guideTickPlanned(coords, opts);
      } catch (error) {
        postNavDiag({ error: navErrorMessage(error), source: "guideTick" });
        try {
          guideTickFallback(coords, opts);
        } catch (e2) {}
      }
    }

    function guideTickPlanned(coords, opts) {
      const nav = window.__veNav;
      const line = nav.line;
      window.__veLastRawGpsCoords = coords;
      // The off-route guard measures before anything else runs. It must not sit behind a helper
      // that can throw: a hollow snapToNavLine used to swallow the guard entirely, which is how
      // the driver stayed unguided with zero reroutes recorded.
      const offRoute = latchOffRoute(
        coords,
        distanceToNavLine(coords, line)
      );
      const snapped =
        line && line.length > 1 ? snapToNavLine(coords, line, 60) : null;
      if (opts && typeof opts.zoom === "number") nav.zoom = opts.zoom;
      if (opts && typeof opts.pitch === "number") nav.pitch = opts.pitch;
      if (opts && typeof opts.speed === "number") nav.speed = opts.speed;
      if (opts && typeof opts.heading === "number") nav.heading = opts.heading;
      nav.followCamera = !(opts && opts.followCamera === false);

      const dist = snapped
        ? haversineMeters(coords, snapped.point)
        : Infinity;
      const speed =
        opts && typeof opts.speed === "number" ? opts.speed : nav.speed;
      // The snap guard reads the estimate, never the platform speed: on the devices measured
      // that field comes back null often enough that a guard keyed on it stops guarding.
      nav.snapOk = !!(
        snapped &&
        !offRoute &&
        canSnapToNavLine(dist, nav.heading, snapped.bearing, nav.vEst)
      );
      if (nav.snapOk) {
        var fixAt = Date.now();
        var estimate = estimateNavSpeed(
          nav,
          snapped.traveledMeters,
          fixAt,
          speed
        );
        nav.vEst = estimate.vEst;
        nav.speedSource = estimate.speedSource;
        nav.lastGpsProgressM = estimate.lastGpsProgressM;
        nav.lastGpsAtMs = estimate.lastGpsAtMs;
        if (typeof nav.progressM !== "number" || !Number.isFinite(nav.progressM)) {
          // The first match seeds the arrow; after that only the display clock moves it.
          nav.progressM = snapped.traveledMeters;
        } else if (shouldResyncNav(nav.progressM, snapped.traveledMeters)) {
          // Not a correction: a gap this wide can only be a reroute or a GPS teleport, both
          // moments where re-seating the arrow is expected rather than a jump to hide.
          nav.progressM = snapped.traveledMeters;
        }
        nav.gpsProgressM = snapped.traveledMeters;
      }

      const onLine = nav.snapOk;
      var cum = navGeometry();
      var paintPoint = coords;
      var paintBearing = nav.bearing;
      var paintCourseUp = false;
      // Painted from the track whenever one exists, matched or not: the display loop does the
      // same, and letting this one fix fall back to the raw position would paint a one-frame
      // teleport off the line and back, once per second.
      if (line && cum && typeof nav.progressM === "number") {
        var along = navPointAtDistance(line, cum, nav.progressM);
        var target = navBearingAtDistance(
          line,
          cum,
          nav.progressM,
          NAV_PAINT_LOOKAHEAD_M
        );
        if (along && typeof target === "number") {
          paintPoint = along;
          // Slew, never adopt: the fix must not be the frame that snaps the bearing.
          paintBearing = smoothNavBearing(nav.bearing, target, 0.05, nav.vEst);
          paintCourseUp = true;
        }
      } else {
        const plan = planNavCamera({
          // Same rule as the display loop: the road under the driver orients the arrow, and the
          // device heading only takes over once the fix is too far from this route to be it.
          traceBearing: routeBearingNearFix(coords),
          deviceHeading:
            opts && typeof opts.heading === "number"
              ? opts.heading
              : nav.heading,
          mapBearing: map.getBearing(),
          lastBearing: nav.bearing,
        });
        paintPoint = coords;
        paintBearing = smoothNavBearing(nav.bearing, plan.bearing, 0.05, nav.vEst);
        paintCourseUp = plan.courseUp;
      }

      navDisplayPaint(
        paintPoint,
        paintBearing,
        paintCourseUp,
        nav.followCamera
      );
      // The drawn line starts under the arrow: on an active trip the puck is the departure.
      const trimmed = syncNavRouteStart(onLine ? paintPoint : coords);
      postRouteProgress(
        paintPoint,
        onLine && typeof nav.progressM === "number"
          ? nav.progressM
          : undefined
      );
      if (nav.navigating) ensureNavDisplayLoop();
      postNavDiag({
        navigating: nav.navigating,
        follow: nav.followCamera,
        on_line: !!onLine,
        snap_ok: !!nav.snapOk,
        trace_bearing: bearingAlongNavLine(coords),
        bearing: paintBearing,
        course_up: paintCourseUp,
        zoom: nav.zoom || 19,
        pitch: typeof nav.pitch === "number" ? nav.pitch : 50,
        puck_y_ratio: navPuckYRatio(),
        distance_to_line_m: snapped
          ? Math.round(haversineMeters(coords, snapped.point))
          : null,
        progress_m:
          typeof nav.progressM === "number" ? Math.round(nav.progressM) : null,
        gps_m:
          typeof nav.gpsProgressM === "number"
            ? Math.round(nav.gpsProgressM)
            : null,
        // What the spring is actually working against, and how fast it thinks the car goes.
        offset_m:
          typeof nav.gpsProgressM === "number" &&
          typeof nav.progressM === "number"
            ? Math.round(nav.gpsProgressM - nav.progressM)
            : null,
        speed_source: nav.speedSource || "none",
        v_est_mps:
          typeof nav.vEst === "number" ? Math.round(nav.vEst * 10) / 10 : null,
        // The display clock's own evidence, so "the arrow jumps" can be split into "the loop
        // stopped", "the loop runs slow", or "the loop runs and the correction is the jerk".
        fps: nav.displayFps || 0,
        frames: nav.displayFrames || 0,
        stalled: !!nav.lastTickStalled,
        trimmed: trimmed,
      });
    }

    /**
     * Where the tick just placed the puck vertically, as a fraction of the viewport.
     *
     * Derived from the padding we asked for, not read back from the map: jumpTo puts the
     * centre at the middle of the padding-inset viewport, so this is the number the framing
     * decision implies — and the one a screenshot can be compared against.
     */
    function navPuckYRatio() {
      try {
        var h = map.getContainer().clientHeight || 0;
        if (!h) return null;
        var padding = navLookaheadPadding({ navigation: true });
        var ratio = (padding.top + (h - padding.bottom)) / 2 / h;
        return Math.round(ratio * 100) / 100;
      } catch (e) {
        return null;
      }
    }

    /**
     * Azimuth to the next drawn vertex ahead of the driver.
     *
     * Deliberately touches nothing injected: this is the branch that has to work when one of the
     * injected functions is precisely what threw.
     */
    function navVertexBearing(coords) {
      const line = window.__veNav.line;
      if (!line || line.length < 2 || !coords) return null;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < line.length; i++) {
        const d = haversineMeters(coords, line[i]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const to = line[Math.min(bestIdx + 1, line.length - 1)];
      if (haversineMeters(line[bestIdx], to) < 1) return null;
      return bearingDegrees(line[bestIdx], to);
    }

    /**
     * The tick minus the injected planner: orient the camera along the drawn vertices.
     *
     * A wrong zoom is a far smaller failure than a view that stays north-up while the trace runs
     * across the screen — that is exactly what "the camera does not turn" looked like.
     */
    function guideTickFallback(coords, opts) {
      const nav = window.__veNav;
      const bearing = navVertexBearing(coords);
      if (bearing === null) return;
      nav.courseUp = true;
      nav.bearing = bearing;
      nav.coords = coords;
      jumpNavCamera({
        center: coords,
        zoom: (opts && opts.zoom) || nav.zoom || 19,
        bearing: bearing,
        pitch:
          opts && typeof opts.pitch === "number"
            ? opts.pitch
            : typeof nav.pitch === "number"
              ? nav.pitch
              : 50,
        padding: navLookaheadPadding(opts),
      });
      syncGpsPuck(coords, bearing, true);
    }

    /**
     * North-up is the default here, and deliberately so: outside guidance this is the offer map
     * or a paused follow, where an unexpected camera rotation reads as a broken map. The bearing
     * is the device's own heading when it has one, never a leftover guidance bearing.
     */
    /**
     * The offer drawing is still on screen: orange dotted approach, overview camera.
     * Guidance updateRoute has not been applied (dropped or still the offer closure).
     * Swap to a solid route toward the pickup and drop late offer geometry.
     * The camera itself stays on guideTick (jump), same as every later fix.
     */
    function adoptGuidanceDrawing(coords) {
      const nav = window.__veNav;
      window.__veOfferFraming = false;
      nav.navigating = true;
      window.__veOfferPresentToken = (window.__veOfferPresentToken || 0) + 1;
      window.__veApproachLine = null;
      removeLayerSafe("approach-line-glow");
      removeLayerSafe("approach-line");
      removeLayerSafe("approach-casing");
      removeSourceSafe("approach");
      var pickup = window.__veOfferPickup;
      if (coords && pickup) {
        nav.line = [coords, pickup];
        nav.hasRoad = false;
        nav.pending = true;
        nav.steps = null;
        // The offer closure left the puck pointing along the approach; the adopted drawing is a
        // chord to the pickup, so that is the direction to show while the road line is fetched.
        seedNavBearingFromLine();
        setOrAddLine(
          "route",
          "route-casing",
          "route-line",
          lineFeature([coords, pickup]),
          routeLineStyle(),
        );
      }
      // Offer OSRM answers still hold the previous commit and would redraw the dots.
      window.__veRouteCommit = function () {};
    }

    function updateGps(coords, opts) {
      const nav = window.__veNav;
      window.__veLastRawGpsCoords = coords;
      // Accept posts navigation GPS before updateRoute can clear the offer lock. Without this,
      // every later tick hits the return below and the overview camera stays until the app
      // restarts. In-flight offer presentOnce already bails when nav.navigating is set.
      if (opts && opts.navigation === true) {
        if (window.__veOfferFraming) adoptGuidanceDrawing(coords);
        else nav.navigating = true;
      }
      // An offer overview owns the camera until the ride is accepted. A follow fix — the home
      // watch is still running — would put the driver back at street zoom, under the card.
      if (window.__veOfferFraming) {
        syncGpsPuck(coords);
        return;
      }
      const follow = !(opts && opts.followCamera === false);

      if (follow && isNavMode(opts)) {
        guideTick(coords, opts);
        return;
      }

      const offRoute = follow
        ? latchOffRoute(coords, distanceToNavLine(coords, nav.line))
        : false;
      const snapped =
        nav.line && nav.line.length > 1
          ? snapToNavLine(coords, nav.line, 60)
          : null;

      if (follow && snapped && !offRoute) {
        // On the line but not guiding: keep the puck on the line and leave the camera where
        // fitBounds put it.
        nav.coords = snapped.point;
        syncGpsPuck(snapped.point);
        postRouteProgress(snapped.point, snapped.traveledMeters);
        return;
      }

      nav.coords = null;
      syncGpsPuck(coords);
      if (!follow) return;

      const zoom = (opts && opts.zoom) || 16;
      const duration = (opts && opts.duration) || 800;
      const pitch =
        opts && typeof opts.pitch === "number" ? opts.pitch : map.getPitch();
      const heading =
        opts && typeof opts.heading === "number" && opts.heading >= 0
          ? opts.heading
          : null;
      moveNavCamera({
        center: coords,
        zoom: zoom,
        bearing: heading === null ? map.getBearing() : heading,
        pitch: pitch,
        padding: navLookaheadPadding(opts),
        duration: duration,
        essential: true,
      });

      postRouteProgress(coords, snapped ? snapped.traveledMeters : undefined);
    }

    // --- Routes OSRM: trip (pickup→dropoff) + dashed approach (driver→pickup) ---
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

    /** Marker drop shadow + the neon rim, sharing the route's blur radius. */
    function markerNeonFilter(glow) {
      return (
        "drop-shadow(0 2px 4px rgba(0,0,0,0.35)) " +
        "drop-shadow(0 0 ${NEON_BLUR} " + glow + ")"
      );
    }

    function clearAllRoutes() {
      window.__veOfferPresentToken = (window.__veOfferPresentToken || 0) + 1;
      offerRoutePresented = false;
      // Everything the guidance camera owns, in one place. The scattered globals this replaced
      // were the bug: a course-up flag left behind by the previous trip outlived the route and
      // kept the puck screen-up on a north-up map.
      const nav = window.__veNav;
      nav.line = null;
      nav.steps = null;
      nav.meta = null;
      nav.hasRoad = false;
      nav.pending = false;
      nav.failed = false;
      nav.generation = null;
      nav.navigating = false;
      window.__veOfferFraming = false;
      nav.courseUp = false;
      nav.bearing = null;
      nav.coords = null;
      nav.trimAnchor = null;
      nav.progressM = null;
      nav.gpsProgressM = null;
      nav.vEst = 0;
      nav.speedSource = "none";
      nav.lastGpsProgressM = null;
      nav.lastGpsAtMs = null;
      nav.cum = null;
      nav.cumLine = null;
      nav.snapOk = false;
      nav.lastPaintAt = 0;
      window.__veApproachLine = null;
      // Unset so nothing can commit into a document that has no route any more.
      window.__veRouteCommit = null;
      clearOffRouteLatch();
      stopNavDisplayLoop();
      [
        "route-line", "route-line-glow", "route-casing",
        "approach-line", "approach-line-glow", "approach-casing",
        "endpoint-pickup", "endpoint-dropoff", "endpoint-driver", "gps-puck",
      ].forEach(removeLayerSafe);
      ["route", "approach", "endpoints", "gps-puck"].forEach(removeSourceSafe);
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
      window.__veUseCanvasGpsPuck = false;
      window.__veOfferPickup = null;
      window.__veOfferDropoff = null;
      removeGpsCanvasPuck();
      if (window.__veLastGpsCoords) {
        syncGpsPuck(window.__veLastGpsCoords);
      }
    }

    function lineFeature(coords) {
      return {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      };
    }

    /** A re-cut is worth one setData; GPS jitter of a few metres is not. */
    var ROUTE_TRIM_MIN_METERS = 25;

    /**
     * The drawn route starts at the driver, not at the router's first vertex.
     *
     * On an active trip the puck *is* the departure — the pin used to be drawn under the arrow,
     * at the driver's own position — so a polyline anchored on the route's own start leaves a
     * stub behind the vehicle. Cutting geometrically avoids asking the router for a shortened
     * line at every turn, and nav.line stays whole: the bearing, the remaining distance and the
     * rendezvous all read the full geometry.
     */
    function trimNavLineFrom(coords) {
      const line = window.__veNav.line;
      if (!line || line.length < 2 || !coords) return null;
      const snap = snapToNavLine(coords, line, 0);
      if (!snap) return null;
      const rest = [snap.point];
      let walked = 0;
      for (let i = 0; i < line.length - 1; i++) {
        walked += haversineMeters(line[i], line[i + 1]);
        if (walked > snap.traveledMeters + 1) rest.push(line[i + 1]);
      }
      return rest.length > 1 ? rest : null;
    }

    /** Re-point the drawn route at the driver. Returns true when the data was replaced. */
    function syncNavRouteStart(coords) {
      const nav = window.__veNav;
      if (!nav.navigating || !nav.hasRoad) return false;
      const anchor = nav.trimAnchor;
      if (
        anchor &&
        anchor.generation === nav.generation &&
        haversineMeters(anchor.coords, coords) < ROUTE_TRIM_MIN_METERS
      ) {
        return false;
      }
      const trimmed = trimNavLineFrom(coords);
      if (!trimmed) return false;
      nav.trimAnchor = { coords: trimmed[0], generation: nav.generation };
      try {
        const source = map.getSource("route");
        // The casing and the glow share this source, so one setData moves all three layers.
        if (source) source.setData(lineFeature(trimmed));
      } catch (e) {}
      return true;
    }

    function svgDataUri(svg) {
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    // Blue departure pin at client pickup — contrasted outline, no white halo.
    var OFFER_PIN_SVG =
      '<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M14 1C7.373 1 2 6.373 2 13c0 8.25 10.2 20.4 11.2 21.55a1.2 1.2 0 0 0 1.6 0C15.8 33.4 26 21.25 26 13 26 6.373 20.627 1 14 1z" fill="${MAP_PALETTE.departure}" stroke="${MAP_PALETTE.departureEdge}" stroke-width="1.5"/>' +
      '<circle cx="14" cy="13" r="4.5" fill="#fff"/>' +
      '<circle cx="14" cy="13" r="2.2" fill="${MAP_PALETTE.departure}"/>' +
      "</svg>";

    // Green arrival flag — pole base marks the dropoff point, contrasted outline.
    function offerFlagSvg(color) {
      return '<svg width="31" height="40" viewBox="0 0 31 40" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M4.5 4v34" stroke="${MAP_PALETTE.arrivalEdge}" stroke-width="3.4" stroke-linecap="round"/>' +
        '<path d="M6.1 5h21.4l-5.2 8 5.2 8H6.1z" fill="' + color + '" stroke="${MAP_PALETTE.arrivalEdge}" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<circle cx="4.5" cy="4" r="2.5" fill="${MAP_PALETTE.arrivalEdge}"/>' +
        "</svg>";
    }

    window.__veOfferMarkerImagesReady = false;
    window.__veOfferMarkerImagesLoading = false;
    window.__veOfferMarkerImageWaiters = [];

    function ensureOfferMarkerImages(map, onReady) {
      function done() {
        window.__veOfferMarkerImagesReady = true;
        window.__veOfferMarkerImagesLoading = false;
        var waiters = window.__veOfferMarkerImageWaiters || [];
        window.__veOfferMarkerImageWaiters = [];
        waiters.forEach(function (fn) {
          try { fn(); } catch (_) {}
        });
        if (onReady) onReady();
      }

      if (window.__veOfferMarkerImagesReady) {
        if (!map.hasImage("gps-chevron")) {
          window.__veOfferMarkerImagesReady = false;
        } else {
          if (onReady) onReady();
          return;
        }
      }
      if (onReady) window.__veOfferMarkerImageWaiters.push(onReady);
      if (window.__veOfferMarkerImagesLoading) return;
      window.__veOfferMarkerImagesLoading = true;

      var pending = 0;
      function oneLoaded() {
        pending -= 1;
        if (pending <= 0) done();
      }

      function loadSvg(id, svg) {
        if (map.hasImage(id)) {
          oneLoaded();
          return;
        }
        pending += 1;
        var img = new Image();
        img.onload = function () {
          try {
            if (!map.hasImage(id)) {
              map.addImage(id, img, { pixelRatio: 2 });
            }
          } catch (_) {}
          oneLoaded();
        };
        img.onerror = oneLoaded;
        img.src = svgDataUri(svg);
      }

      loadSvg("pickup-depart", OFFER_PIN_SVG);
      loadSvg("dropoff-flag", offerFlagSvg("${MAP_PALETTE.arrival}"));
      loadSvg("gps-chevron", GPS_ARROW_SVG);
    }

    function routeLineStyle() {
      return {
        glow: {
          "line-color": "${MAP_PALETTE.routeGlow}",
          "line-width": 11,
          "line-blur": ${MAP_PALETTE.neonBlur},
        },
        casing: {
          "line-color": "${MAP_PALETTE.routeEdge}",
          "line-width": 7,
          "line-opacity": 0.9,
        },
        line: {
          "line-color": "${MAP_PALETTE.route}",
          "line-width": 5.5,
          "line-opacity": 0.95,
        },
      };
    }

    // Green dotted approach (driver → client). Same dash on the glow so the
    // halo follows the dots instead of bleeding into a solid band.
    function approachLineStyle() {
      return {
        glow: {
          "line-color": "${MAP_PALETTE.approachGlow}",
          "line-width": 8,
          "line-blur": ${MAP_PALETTE.neonBlur},
          "line-dasharray": [0, 1.75],
        },
        casing: null,
        line: {
          "line-color": "${MAP_PALETTE.approach}",
          "line-width": 4,
          "line-opacity": 0.95,
          "line-dasharray": [0, 1.75],
        },
      };
    }

    // Placeholder chord, while the app resolves the line. Dashed and dimmed on purpose: there
    // is no itinerary yet, and a solid straight line reads as one.
    function pendingRouteStyle() {
      return {
        glow: null,
        casing: null,
        line: {
          "line-color": "${MAP_PALETTE.routeEdge}",
          "line-width": 3,
          "line-opacity": 0.4,
          "line-dasharray": [0.6, 1.6],
        },
      };
    }

    // Placeholder chord after every endpoint failed. Still dashed — never a road — but in the
    // approach orange, so "not computed" is distinguishable at a glance from "being computed".
    function failedRouteStyle() {
      return {
        glow: null,
        casing: null,
        line: {
          "line-color": "${MAP_PALETTE.approach}",
          "line-width": 3.5,
          "line-opacity": 0.75,
          "line-dasharray": [0.6, 1.6],
        },
      };
    }

    // Slight geographic dezoom before fitBounds on live offer framing.
    function expandBounds(bounds, ratio) {
      if (!ratio || ratio <= 1) return bounds;
      var sw = bounds.getSouthWest();
      var ne = bounds.getNorthEast();
      var centerLng = (sw.lng + ne.lng) / 2;
      var centerLat = (sw.lat + ne.lat) / 2;
      var halfLng = ((ne.lng - sw.lng) / 2) * ratio;
      var halfLat = ((ne.lat - sw.lat) / 2) * ratio;
      return new maplibregl.LngLatBounds(
        [centerLng - halfLng, centerLat - halfLat],
        [centerLng + halfLng, centerLat + halfLat]
      );
    }

    function setOrAddLine(sourceId, casingId, lineId, feature, style) {
      const glowId = lineId + "-glow";
      removeLayerSafe(glowId);
      removeLayerSafe(lineId);
      removeLayerSafe(casingId);
      removeSourceSafe(sourceId);
      map.addSource(sourceId, { type: "geojson", data: feature });
      // Neon rim first so it renders under the casing and the line.
      if (style.glow) {
        map.addLayer({
          id: glowId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: style.glow,
        });
      }
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

    function upsertEndpoints(start, end, approachFrom, driverMarker) {
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

      function makePinEl() {
        const el = document.createElement("div");
        el.className = "route-marker";
        el.style.width = "28px";
        el.style.height = "36px";
        el.style.filter = markerNeonFilter("${MAP_PALETTE.departureGlow}");
        el.innerHTML = OFFER_PIN_SVG;
        return el;
      }

      function makeFlagEl() {
        const el = document.createElement("div");
        el.className = "route-marker";
        el.style.width = "31px";
        el.style.height = "40px";
        el.style.filter = markerNeonFilter("${MAP_PALETTE.arrivalGlow}");
        el.innerHTML = offerFlagSvg("${MAP_PALETTE.arrival}");
        return el;
      }

      // On an active trip the driver puck is the departure: the pin sat at the driver's own
      // position, under the arrow, and read as a second, contradicting start point.
      if (!window.__veNav.navigating) {
        window.__vePickupMarker = new maplibregl.Marker({
          element: makePinEl(),
          anchor: "bottom",
        })
          .setLngLat(start)
          .addTo(map);
      }

      window.__veDropoffMarker = new maplibregl.Marker({
        element: makeFlagEl(),
        anchor: "bottom-left",
      })
        .setLngLat(end)
        .addTo(map);

      // GPS puck (canvas in offer mode) is the current location.
    }

    /**
     * Fits camera to route coordinates. boundsExpandRatio > 1 dezooms before fitBounds.
     * fitPadding from RN (card-local padding translated to screen). durationMs: 0 = instant snap.
     * maxZoom: lower = cap zoom-in on short trips (see zoomCap in presentOnce).
     */
    function fitRouteBounds(coordLists, fitPadding, padBottomFallback, durationMs, maxZoom, boundsExpandRatio) {
      const all = [];
      coordLists.forEach((list) => {
        if (list && list.length) list.forEach((c) => all.push(c));
      });
      if (all.length < 1) return;
      const duration = durationMs == null ? 500 : Number(durationMs);
      let bounds = all.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(all[0], all[0])
      );
      const expand = Number(boundsExpandRatio);
      if (expand > 1) {
        bounds = expandBounds(bounds, expand);
      }
      beginProgrammaticCamera(Math.max(duration, 50));
      map.fitBounds(bounds, {
        padding: normalizeFitPadding(fitPadding, padBottomFallback),
        duration: duration,
        maxZoom: maxZoom == null ? 15 : Number(maxZoom),
      });
      try { map.resize(); } catch (e) {}
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

    // --- Trip route: the line is resolved by the app, never fetched here ---
    //
    // This document used to call the router itself: no deadline, one endpoint, and a failure
    // that only reached the console. The request now lives in src/services/routing.ts, which
    // adds a deadline, a fallback endpoint, and an error the app can report. What remains here
    // is the drawing, plus a placeholder chord that is deliberately dashed and dimmed — a
    // straight line must never be mistaken for an itinerary.

    function updateRoute(start, end, approachFrom, fitPadding, fitPaddingBottom, shouldFitBounds, presentation, offerOverview, driverMarker, routeGeneration, isNavigating) {
      const isOffer = presentation === "offer";
      const nav = window.__veNav;
      // Navigation already took the map. A late offer post must not restore the dotted approach
      // or the overview fit — that is the drawing that survived until the app was killed.
      if (isOffer && nav.navigating) return;
      window.__veOfferPickup = start;
      window.__veOfferDropoff = end;
      window.__veUseCanvasGpsPuck = Boolean(isOffer);
      // The new chord replaces the line *before* the puck is drawn: the puck's bearing is read
      // from the line, so drawing it first gave one frame of the previous route's direction —
      // the arrow pointing at the last road it knew instead of this one.
      nav.line = [start, end];
      syncGpsPuck(window.__veLastGpsCoords || driverMarker || null);

      nav.generation = routeGeneration == null ? 0 : routeGeneration;
      // The app names the route's purpose; the camera no longer infers it from fitBounds.
      nav.navigating = !isOffer && isNavigating === true;
      window.__veOfferFraming = isOffer;
      nav.trimAnchor = null;
      nav.failed = false;
      nav.pending = true;

      if (isOffer) {
        window.__veOfferPresentToken = (window.__veOfferPresentToken || 0) + 1;
        offerRoutePresented = false;
      }
      const routePresentToken = window.__veOfferPresentToken || 0;

      if (isOffer && offerOverview) {
        setOverviewWestEurope(0, fitPadding);
      }

      // Chord is enough to aim the camera and the arrow. Off-route stays
      // disarmed until the line has more than two points (navLineIsRoad).
      // (nav.line was already set to this chord, above, so the puck draw saw it.)
      clearOffRouteLatch();
      resetNavMotion();
      // Guidance only: an offer's chord runs pickup → drop-off, which is not the driver's own
      // heading and must never be the arrow's direction.
      if (!isOffer) seedNavBearingFromLine();
      if (!isOffer) {
        // Drop the offer polyline (often off-screen once the camera locks on
        // the driver) and draw driver → destination immediately.
        nav.hasRoad = false;
        nav.steps = null;
        var chordM = haversineMeters(start, end);
        nav.meta = {
          distanceMeters: Math.round(chordM),
          durationSeconds: 0,
          lineMeters: chordM,
        };
        setOrAddLine(
          "route",
          "route-casing",
          "route-line",
          lineFeature([start, end]),
          pendingRouteStyle(),
        );
        try {
          postRouteProgress(window.__veLastGpsCoords || start, 0);
        } catch (e) {}
      }
      if (nav.navigating && (window.__veLastRawGpsCoords || window.__veLastGpsCoords)) {
        // Lock the camera on the driver the moment the trip starts, before any line exists:
        // the acceptance must not leave the map in north-up overview. A fit is never what
        // guidance wants, so this no longer depends on the app having said fitBounds false.
        guideTick(window.__veLastRawGpsCoords || window.__veLastGpsCoords, {
          navigation: true,
          zoom: nav.zoom || 19,
          pitch: typeof nav.pitch === "number" ? nav.pitch : 50,
          followCamera: true,
        });
      }

      function paintApproachStraight() {
        if (!approachFrom) {
          window.__veApproachLine = null;
          removeLayerSafe("approach-line");
          removeLayerSafe("approach-casing");
          removeSourceSafe("approach");
          return;
        }
        window.__veApproachLine = [approachFrom, start];
        setOrAddLine(
          "approach",
          "approach-casing",
          "approach-line",
          lineFeature([approachFrom, start]),
          approachLineStyle(),
        );
      }

      function paintApproachGeometry(coordinates) {
        if (coordinates && coordinates.length > 1) {
          window.__veApproachLine = coordinates;
          setOrAddLine(
            "approach",
            "approach-casing",
            "approach-line",
            lineFeature(coordinates),
            approachLineStyle(),
          );
          return;
        }
        paintApproachStraight();
      }

      // Dotted approach + pins immediately. The trip line arrives on its own message now.
      paintApproachStraight();
      upsertEndpoints(start, end, approachFrom, driverMarker);
      // Snap off the follow camera now. The road geometry refines this fit when it arrives;
      // waiting for it left the driver at street zoom, with the trace under the card.
      if (isOffer) frameOfferCamera([start, end]);

      function scheduleOfferRoutePresented() {
        var notified = false;
        function notifyOnce() {
          if (notified) return;
          if (routePresentToken !== window.__veOfferPresentToken) return;
          notified = true;
          notifyRoutePresented();
        }
        try {
          map.once("moveend", function () {
            map.once("idle", notifyOnce);
          });
          map.triggerRepaint();
          setTimeout(notifyOnce, isOffer ? 1200 : 800);
        } catch (_) {
          notifyOnce();
        }
      }

      let presented = false;
      var offerApproachFitted = false;
      function tripFitLists(tripCoords) {
        if (tripCoords && tripCoords.length) return [tripCoords];
        return [[start, end]];
      }
      function buildOfferFitCoordLists(tripCoords) {
        var trip =
          tripCoords && tripCoords.length > 1 ? tripCoords : [start, end];
        var points = [];
        var driver = approachFrom || driverMarker || null;
        if (driver) points.push(driver);
        var approach = window.__veApproachLine;
        if (approach && approach.length) {
          approach.forEach(function (c) {
            points.push(c);
          });
        }
        trip.forEach(function (c) {
          points.push(c);
        });
        return [points];
      }
      /**
       * Offer only. The whole approach, the trip and both ends, in the padding above the card.
       *
       * Returns immediately while guiding: that camera is the tick's, and a fit here would
       * replace course-up with a north-up overview of the trip.
       */
      function frameOfferCamera(tripCoords) {
        if (!isOffer || nav.navigating) return;
        var lists = buildOfferFitCoordLists(
          tripCoords && tripCoords.length > 1 ? tripCoords : [start, end],
        );
        var spanKm = computeFitSpanKm(lists);
        var offerCamera = resolveOfferFitCamera(spanKm);
        fitRouteBounds(
          lists,
          fitPadding,
          fitPaddingBottom,
          0,
          offerCamera.maxZoom,
          offerCamera.boundsExpand,
        );
      }
      /**
       * The line just changed, so the tick is the authority again.
       *
       * It no longer consults shouldFitBounds: in guidance a fit is never the right answer, and
       * a route arriving while the map was fitted left the camera north-up with the trace running
       * sideways — the state the driver reported. Guiding is asked of nav.navigating, which the
       * app sets, not inferred from a flag computed on the other side of the bridge.
       */
      function recenterTripNavCamera() {
        if (!nav.navigating) return;
        clearOffRouteLatch();
        resetNavMotion();
        // The line just changed: re-point the arrow along the new first segment before the tick
        // reads it, so a reroute never shows the previous road's direction.
        seedNavBearingFromLine();
        const coords = window.__veLastRawGpsCoords || window.__veLastGpsCoords;
        if (!coords) return;
        guideTick(coords, {
          zoom: nav.zoom || 19,
          pitch: typeof nav.pitch === "number" ? nav.pitch : 50,
          speed: nav.speed,
          heading: nav.heading,
          navigation: true,
          followCamera: true,
        });
      }

      function presentOnce(coordLists, fitCoordLists) {
        if (presented) return;
        presented = true;
        // A fit while guiding is a bug, not a preference: it resets the camera to north-up and
        // dezooms to the whole trip. Guarded here as well as at the caller, because this is the
        // single place that can take the camera away from the tick.
        if (nav.navigating) return;
        const listsForFit =
          isOffer && fitCoordLists && fitCoordLists.length
            ? fitCoordLists
            : coordLists;
        const spanKm = isOffer ? computeFitSpanKm(listsForFit) : 0;
        const offerCamera = isOffer ? resolveOfferFitCamera(spanKm) : null;
        const zoomCap = isOffer ? offerCamera.maxZoom : 15;
        const boundsExpand = isOffer ? offerCamera.boundsExpand : 1;
        if (isOffer && offerRoutePresented) {
          if (shouldFitBounds || isOffer) {
            fitRouteBounds(
              listsForFit,
              fitPadding,
              fitPaddingBottom,
              450,
              zoomCap,
              boundsExpand,
            );
          }
          scheduleOfferRoutePresented();
          return;
        }
        if (shouldFitBounds || isOffer) {
          fitRouteBounds(
            listsForFit,
            fitPadding,
            fitPaddingBottom,
            isOffer ? 700 : 500,
            zoomCap,
            boundsExpand,
          );
        }
        if (isOffer) {
          offerRoutePresented = true;
          scheduleOfferRoutePresented();
        }
      }

      /**
       * Replace the pending chord with the road line the app resolved.
       */
      function applyTripGeometry(geometry) {
        const tripCoords = geometry.coordinates;
        nav.line = tripCoords.length > 2 ? tripCoords : [start, end];
        let lineMeters = 0;
        for (let i = 0; i < tripCoords.length - 1; i++) {
          lineMeters += haversineMeters(tripCoords[i], tripCoords[i + 1]);
        }
        nav.meta = {
          distanceMeters: Math.round(geometry.distanceMeters || lineMeters),
          durationSeconds: Math.round(geometry.durationSeconds || 0),
          lineMeters: lineMeters,
        };
        nav.steps =
          geometry.steps && geometry.steps.length ? geometry.steps : null;
        nav.hasRoad = tripCoords.length > 2;
        nav.pending = false;
        nav.failed = false;
        setOrAddLine(
          "route",
          "route-casing",
          "route-line",
          lineFeature(tripCoords),
          routeLineStyle(),
        );
        // A new road line: cut it at the driver before the first frame, rather than leaving the
        // full geometry on screen until the next tick decides to re-point it.
        nav.trimAnchor = null;
        syncNavRouteStart(window.__veLastRawGpsCoords || window.__veLastGpsCoords || start);
        try {
          postRouteProgress(window.__veLastRawGpsCoords || window.__veLastGpsCoords || start, 0);
        } catch (e) {}

        if (window.__veLastGpsCoords || driverMarker) {
          syncGpsPuck(window.__veLastGpsCoords || driverMarker);
        }
        upsertEndpoints(start, end, approachFrom, driverMarker);
        const approachCoords =
          window.__veApproachLine && window.__veApproachLine.length
            ? window.__veApproachLine
            : [];
        presentOnce(
          [approachCoords, tripCoords],
          isOffer ? buildOfferFitCoordLists(tripCoords) : tripFitLists(tripCoords),
        );
        recenterTripNavCamera();
        if (nav.navigating && nav.hasRoad) postRerouteSettled();
      }

      /**
       * No endpoint produced a line.
       *
       * The chord stays — the camera still needs something to point at — but it keeps its dash
       * and takes a distinct hue, because a failed route that looks like a road is worse than
       * no route at all: it is a road the driver would follow.
       */
      function markRouteFailed(reason) {
        nav.failed = true;
        nav.pending = false;
        nav.hasRoad = false;
        nav.steps = null;
        const chordM = haversineMeters(start, end);
        nav.meta = {
          distanceMeters: Math.round(chordM),
          durationSeconds: 0,
          lineMeters: chordM,
        };
        if (!isOffer) {
          setOrAddLine(
            "route",
            "route-casing",
            "route-line",
            lineFeature([start, end]),
            failedRouteStyle(),
          );
        }
        try {
          postRouteProgress(window.__veLastGpsCoords || start, 0);
        } catch (e) {}
        presentOnce(
          [approachFrom ? [approachFrom, start] : [], [start, end]],
          isOffer
            ? buildOfferFitCoordLists([start, end])
            : tripFitLists([start, end]),
        );
        recenterTripNavCamera();
        if (nav.navigating) postRerouteSettled();
        console.warn("[nav] route failed:", reason);
      }

      /**
       * One leg answered for this request.
       *
       * The generation check is what makes a late answer harmless: updateRoute bumps it, so a
       * response that outlived its request is dropped instead of redrawing a route the driver
       * has already left — including a reroute, where the new line must not be overwritten by
       * the old one landing after it.
       */
      function commitRouteMessage(msg) {
        if (msg.routeGeneration !== nav.generation) return;
        if (msg.legKind === "approach") {
          paintApproachGeometry(msg.coordinates);
          // The trip fit often lands first, on the chord of the approach. One extra fit, and
          // only once the trip has already framed itself, so this cannot consume that first fit
          // when the approach answer wins the race.
          if (isOffer && presented && !offerApproachFitted) {
            offerApproachFitted = true;
            presented = false;
            presentOnce(
              null,
              buildOfferFitCoordLists(
                nav.line && nav.line.length > 1 ? nav.line : [start, end],
              ),
            );
          }
          return;
        }
        if (offerTimeout) clearTimeout(offerTimeout);
        if (msg.type === "routeError") {
          markRouteFailed(msg.reason || "unknown");
          return;
        }
        applyTripGeometry(msg);
      }
      window.__veRouteCommit = commitRouteMessage;

      // The offer overview must not wait forever on a router: after this the pins and the chord
      // are presented as they are, which is the whole point of the overview.
      var offerTimeout = isOffer
        ? setTimeout(function () {
            if (routePresentToken !== window.__veOfferPresentToken) return;
            const tripOnly = [[start, end]];
            presentOnce(
              approachFrom ? [[approachFrom, start, end]] : tripOnly,
              buildOfferFitCoordLists([start, end]),
            );
          }, 2500)
        : null;
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
    }

    fetch("https://tiles.openfreemap.org/styles/liberty")
      .then(function (res) { return res.json(); })
      .then(function (style) {
        toneBasemapStyle(style);
        __veBoot(style);
      })
      .catch(function () {
        __veBoot("https://tiles.openfreemap.org/styles/liberty");
      });
  </script>
</body>
</html>
`;
}
