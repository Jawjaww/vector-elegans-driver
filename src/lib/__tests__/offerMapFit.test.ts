import { OFFER_MAP_EDGE_INSET } from '../utils/offerCardLayout';
import { computeFullscreenOfferFitPadding } from '../utils/offerMapFit';

describe('computeFullscreenOfferFitPadding', () => {
  it('uses top inset and overlay band so the route sits above the card', () => {
    const pad = computeFullscreenOfferFitPadding(
      { width: 390, height: 844 },
      { edgeInset: 44, topInset: 92, bottomSheetBand: 280 },
    );
    expect(pad.top).toBe(104);
    expect(pad.left).toBe(56);
    expect(pad.right).toBe(56);
    expect(pad.bottom).toBe(336);
  });

  it('defaults side insets from the offer map edge constant', () => {
    const pad = computeFullscreenOfferFitPadding(
      { width: 390, height: 844 },
      { topInset: 80, bottomSheetBand: 200 },
    );
    expect(pad.left).toBe(OFFER_MAP_EDGE_INSET + 12);
    expect(pad.right).toBe(OFFER_MAP_EDGE_INSET + 12);
    expect(pad.bottom).toBe(200 + OFFER_MAP_EDGE_INSET + 12);
  });
});
