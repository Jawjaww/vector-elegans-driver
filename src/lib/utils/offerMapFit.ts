import {
  OFFER_MAP_EDGE_INSET,
  OFFER_MAP_FIT_DEZOOM_INSET,
} from './offerCardLayout';

export type FitPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * fitBounds padding so the offer route sits in the map band above the overlay card.
 * `bottomSheetBand` is the measured stack height (card + peek + sheet clearance).
 */
export function computeFullscreenOfferFitPadding(
  screen: { width: number; height: number },
  opts?: {
    edgeInset?: number;
    topInset?: number;
    bottomSheetBand?: number;
  },
): FitPadding {
  const edge = opts?.edgeInset ?? OFFER_MAP_EDGE_INSET;
  const topInset = opts?.topInset ?? edge + 48;
  const bottomSheet = opts?.bottomSheetBand ?? 280;
  const dezoom = OFFER_MAP_FIT_DEZOOM_INSET;

  return {
    top: Math.max(8, Math.round(topInset + dezoom)),
    left: Math.max(8, Math.round(edge + dezoom)),
    right: Math.max(8, Math.round(edge + dezoom)),
    bottom: Math.max(8, Math.round(bottomSheet + edge + dezoom)),
  };
}
