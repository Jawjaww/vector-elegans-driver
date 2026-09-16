import {
  computeOfferCardLayout,
  OFFER_CARD_SHEET_GAP,
  offerDeckClearance,
} from '../utils/offerCardLayout';
import {
  offerStackExtraHeight,
  offerStackRestStyle,
} from '../utils/offerCarousel';

describe('computeOfferCardLayout', () => {
  it('keeps a compact overlay so the home map stays visible above', () => {
    const layout = computeOfferCardLayout(844, { top: 47, bottom: 34 });
    expect(layout.maxCardHeight).toBeGreaterThanOrEqual(280);
    expect(layout.maxCardHeight).toBeLessThanOrEqual(380);
    expect(layout.contentPadding).toBeGreaterThanOrEqual(12);
  });

  it('shrinks further on small screens', () => {
    const layout = computeOfferCardLayout(568, { top: 20, bottom: 20 });
    const usable = 568 - 20 - 20 - 32;
    expect(layout.maxCardHeight).toBeLessThanOrEqual(usable * 0.52 + 1);
    expect(layout.contentPadding).toBeLessThanOrEqual(14);
  });
});

describe('offerDeckClearance', () => {
  // Any sheet visible height works: only the delta to the deck matters here.
  const sheetTop = 14;

  it('leaves the same gap above the sheet for every deck size', () => {
    for (const count of [1, 2, 3, 4]) {
      const clearance = offerDeckClearance(sheetTop, count);
      const stackExtra = offerStackExtraHeight(count);
      const deckBottom = offerStackRestStyle(count - 1, 0, stackExtra)
        .bottom as number;
      expect(clearance + deckBottom - sheetTop).toBe(OFFER_CARD_SHEET_GAP);
    }
  });
});
