export type MapViewportHole = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type FitPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** Inset so markers (≈36px) stay inside the offer map hole. */
export const OFFER_MAP_FIT_INSET = 44;
/** Room for address / time pills overlaid at the bottom of the hole. */
export const OFFER_MAP_ADDRESS_BAND = 118;

/**
 * Asymmetric fitBounds padding so the home WebView (fullscreen) frames the
 * route inside the modal map viewport hole — not the full device screen.
 */
export function computeOfferMapFitPadding(
  hole: MapViewportHole,
  screen: { width: number; height: number },
  opts?: { inset?: number; addressBand?: number },
): FitPadding {
  const inset = opts?.inset ?? OFFER_MAP_FIT_INSET;
  const addressBand = opts?.addressBand ?? OFFER_MAP_ADDRESS_BAND;
  return {
    top: Math.max(8, Math.round(hole.y + inset)),
    left: Math.max(8, Math.round(hole.x + inset)),
    right: Math.max(8, Math.round(screen.width - hole.x - hole.w + inset)),
    bottom: Math.max(
      8,
      Math.round(screen.height - hole.y - hole.h + inset + addressBand),
    ),
  };
}
