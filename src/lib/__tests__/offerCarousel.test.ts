import {
  clampOfferCarouselIndex,
  OFFER_STACK_LIFT_CAP,
  offerStackDragLift,
  offerStackExtraHeight,
  offerStackPeekX,
  offerStackPeekY,
  offerStackRestStyle,
  offerStackScale,
  visibleOfferStack,
} from '../utils/offerCarousel';

describe('clampOfferCarouselIndex', () => {
  it('clamps index within ride count', () => {
    expect(clampOfferCarouselIndex(2, 3)).toBe(2);
    expect(clampOfferCarouselIndex(4, 3)).toBe(2);
    expect(clampOfferCarouselIndex(-1, 3)).toBe(0);
  });

  it('returns 0 when there are no rides', () => {
    expect(clampOfferCarouselIndex(2, 0)).toBe(0);
  });
});

describe('visibleOfferStack', () => {
  it('keeps at most four items from the front of the queue', () => {
    expect(visibleOfferStack([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4]);
    expect(visibleOfferStack(['a'])).toEqual(['a']);
    expect(visibleOfferStack([])).toEqual([]);
  });

  it('respects a custom max', () => {
    expect(visibleOfferStack([1, 2, 3], 2)).toEqual([1, 2]);
    expect(visibleOfferStack([1, 2], 0)).toEqual([]);
  });
});

describe('offer stack peek', () => {
  it('leaves no extra height for a single card', () => {
    expect(offerStackExtraHeight(1)).toBe(0);
  });

  it('adds peek offset for stacked cards', () => {
    expect(offerStackExtraHeight(3)).toBeGreaterThan(0);
    expect(offerStackExtraHeight(4)).toBeGreaterThan(offerStackExtraHeight(3));
  });

  it('offsets each depth down and right with slight 3D scale', () => {
    expect(offerStackPeekY(0)).toBe(0);
    expect(offerStackPeekX(0)).toBe(0);
    expect(offerStackScale(0)).toBe(1);
    expect(offerStackPeekY(1)).toBeGreaterThan(0);
    expect(offerStackPeekX(1)).toBeGreaterThan(0);
    expect(offerStackPeekY(3)).toBeGreaterThan(offerStackPeekY(2));
    expect(offerStackPeekX(3)).toBeGreaterThan(offerStackPeekX(2));
    expect(offerStackScale(1)).toBeLessThan(1);
    expect(offerStackScale(1)).toBeGreaterThan(0.95);
    expect(offerStackScale(3)).toBeLessThan(offerStackScale(2));
  });
});

describe('offerStackRestStyle', () => {
  it('places depth 0 at the stack origin', () => {
    const rest = offerStackRestStyle(0, 40);
    expect(rest.top).toBe(0);
    expect(rest.left).toBe(40);
    expect(rest.zIndex).toBe(20);
  });

  it('places depth 1 down and right of the front', () => {
    const front = offerStackRestStyle(0, 40);
    const behind = offerStackRestStyle(1, 40);
    expect(behind.top).toBeGreaterThan(front.top as number);
    expect(behind.left).toBeGreaterThan(front.left as number);
    expect(behind.zIndex).toBeLessThan(front.zIndex as number);
  });
});

describe('offerStackDragLift', () => {
  it('caps peek cancel at 35% even at progress 1', () => {
    const lift = offerStackDragLift(2, 1);
    expect(Math.abs(lift.translateX)).toBeCloseTo(offerStackPeekX(2) * OFFER_STACK_LIFT_CAP);
    expect(Math.abs(lift.translateY)).toBeCloseTo(offerStackPeekY(2) * OFFER_STACK_LIFT_CAP);
    expect(Math.abs(lift.translateX)).toBeLessThan(offerStackPeekX(2));
    expect(Math.abs(lift.translateY)).toBeLessThan(offerStackPeekY(2));
  });

  it('does not lift at progress 0', () => {
    expect(offerStackDragLift(2, 0)).toEqual({ translateX: 0, translateY: 0 });
  });
});
