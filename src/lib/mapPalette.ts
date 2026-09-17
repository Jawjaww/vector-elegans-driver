/**
 * Map palette — single source of truth for every colour drawn on the driver map.
 *
 * The driver map lives inside a WebView: a separate document that NativeWind's
 * `global.css` never reaches (that file is compiled for React Native and is
 * explicitly web-excluded). This module is therefore the Expo counterpart of
 * the `--ve-map-*` block declared in the Next.js `globals.css` —
 * `mapHtmlTemplate` interpolates it into the WebView, so a colour is edited
 * here only.
 *
 * `*-edge` is the contrasted outline (never a white halo), `*-glow` is the
 * subtle neon rim shared by every outline; `neonBlur` is its blur radius.
 */
export const MAP_PALETTE = {
  /** Departure — client pickup. */
  departure: "#3b82f6",
  departureEdge: "#1d4ed8",
  departureGlow: "rgba(59, 130, 246, 0.4)",

  /** Arrival — dropoff flag (pole base marks the point). */
  arrival: "#10b981",
  arrivalEdge: "#047857",
  arrivalGlow: "rgba(16, 185, 129, 0.4)",

  /** Driver live position.
   *  `driverRing` is a plain white outline painted under the puck. The puck
   *  deliberately shares the trip route's blue (the driver belongs to the trip),
   *  so the ring — not the hue — is what detaches it wherever the two overlap. */
  driver: "#3b82f6",
  driverEdge: "#1d4ed8",
  driverGlow: "rgba(59, 130, 246, 0.4)",
  driverRing: "#ffffff",

  /** Trip route (departure → arrival). */
  route: "#3b82f6",
  routeEdge: "#1d4ed8",
  routeGlow: "rgba(59, 130, 246, 0.32)",

  /** Driver → departure approach — dotted orange, distinct from the blue trip
   *  route and the green arrival flag. */
  approach: "#f97316",
  approachGlow: "rgba(249, 115, 22, 0.35)",

  /** Blur radius (px) shared by every neon rim. */
  neonBlur: 3,
} as const;
