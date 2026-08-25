import {
  computeOfferMapFitPadding,
  OFFER_MAP_ADDRESS_BAND,
  OFFER_MAP_FIT_INSET,
} from '../utils/offerMapFit';

describe('computeOfferMapFitPadding', () => {
  it('pads so fitBounds targets the modal hole, not the full screen', () => {
    const hole = { x: 40, y: 120, w: 300, h: 410 };
    const screen = { width: 390, height: 844 };
    const pad = computeOfferMapFitPadding(hole, screen);

    expect(pad.top).toBe(120 + OFFER_MAP_FIT_INSET);
    expect(pad.left).toBe(40 + OFFER_MAP_FIT_INSET);
    expect(pad.right).toBe(390 - 40 - 300 + OFFER_MAP_FIT_INSET);
    expect(pad.bottom).toBe(
      844 - 120 - 410 + OFFER_MAP_FIT_INSET + OFFER_MAP_ADDRESS_BAND,
    );
  });

  it('never returns padding below 8px', () => {
    const pad = computeOfferMapFitPadding(
      { x: 0, y: 0, w: 100, h: 100 },
      { width: 100, height: 100 },
      { inset: 0, addressBand: 0 },
    );
    expect(pad.top).toBe(8);
    expect(pad.left).toBe(8);
    expect(pad.right).toBe(8);
    expect(pad.bottom).toBe(8);
  });
});
