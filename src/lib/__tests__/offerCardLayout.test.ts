import { computeOfferCardLayout } from '../utils/offerCardLayout';

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
