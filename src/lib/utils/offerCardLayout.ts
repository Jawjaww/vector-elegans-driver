export type OfferCardLayout = {
  maxCardHeight: number;
  contentPadding: number;
  contentGap: number;
};

/** Pin/marker clearance at visible map edges (fitBounds). */
export const OFFER_MAP_EDGE_INSET = 26;

/** Max MapLibre zoom for offer live framing (short trips). */
export const OFFER_MAP_ZOOM_CAP = 11;

/** Slight dezoom on live offer framing (route + approach in the top map band). */
export const OFFER_MAP_LIVE_BOUNDS_EXPAND = 1.14;

/** Extra fitBounds padding on all sides — breathes around the route. */
export const OFFER_MAP_FIT_DEZOOM_INSET = 12;

/** Gap between the offer stack and the nav bottomsheet handle. */
export const OFFER_CARD_SHEET_GAP = 4;

/** Pulls the offer stack closer to the bottomsheet / tab bar (px). */
export const OFFER_CARD_BOTTOM_NUDGE = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compact Uber/Bolt overlay: chrome only (no map preview inside the card).
 * Height is capped so the home map keeps a usable band above the stack.
 */
export function computeOfferCardLayout(
  screenHeight: number,
  insets: { top: number; bottom: number },
): OfferCardLayout {
  const usableHeight = Math.max(
    0,
    screenHeight - insets.top - insets.bottom - 32,
  );
  const isCompact = usableHeight < 560;
  const maxCardHeight = clamp(
    isCompact ? 340 : 380,
    280,
    Math.round(usableHeight * 0.52),
  );

  return {
    maxCardHeight,
    contentPadding: isCompact ? 12 : 14,
    contentGap: isCompact ? 6 : 8,
  };
}
