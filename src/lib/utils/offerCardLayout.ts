import { offerStackTailSlack } from './offerCarousel';

export type OfferCardLayout = {
  maxCardHeight: number;
  contentPadding: number;
  contentGap: number;
};

/** Pin/marker clearance at visible map edges (fitBounds). */
export const OFFER_MAP_EDGE_INSET = 26;

/** Max MapLibre zoom for offer live framing (short trips). */
export const OFFER_MAP_ZOOM_CAP = 10;

/** Slight dezoom on live offer framing (route + approach in the top map band). */
export const OFFER_MAP_LIVE_BOUNDS_EXPAND = 1.38;

/** Extra fitBounds padding on all sides — breathes around the route. */
export const OFFER_MAP_FIT_DEZOOM_INSET = 20;

/**
 * Constant clearance between the bottomsheet's visible top and the bottom of
 * the offer deck, whatever the height of the cards' content.
 */
export const OFFER_CARD_SHEET_GAP = 10;

/**
 * Distance from the screen bottom to the bottom of the offer deck
 * (`paddingBottom` of the carousel). It subtracts the slack the deck keeps
 * below its deepest rear peek, so that the whole deck — peeks included — ends
 * up exactly `OFFER_CARD_SHEET_GAP` above the sheet's visible top.
 *
 * The deck is anchored by the bottom, so a tall card grows upwards instead of
 * reaching the bottomsheet.
 */
export function offerDeckClearance(
  sheetVisibleHeight: number,
  visibleCount: number,
): number {
  return (
    sheetVisibleHeight + OFFER_CARD_SHEET_GAP - offerStackTailSlack(visibleCount)
  );
}

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
