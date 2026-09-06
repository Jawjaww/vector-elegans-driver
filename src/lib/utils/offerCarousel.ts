import type { ViewStyle } from 'react-native';

/** Keeps carousel index valid when the offer queue shrinks after decline. */
export function clampOfferCarouselIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, index), total - 1);
}

/** Front + up to 3 rear cards (4 rides max) — always mount the visible deck. */
export const OFFER_STACK_VISIBLE_MAX = 4;

/**
 * Deck rest pose: same visual size, peek down + right so a glass band stays
 * readable. Scale is only a slight 3D thickness, not a miniature.
 */
export const OFFER_STACK_PEEK_Y = [0, 10, 20, 30] as const;
export const OFFER_STACK_PEEK_X = [0, 8, 16, 24] as const;
export const OFFER_STACK_SCALE = [1, 0.985, 0.97, 0.955] as const;
export const OFFER_STACK_OPACITY = [1, 0.98, 0.96, 0.94] as const;

/** Max peek cancelled during a front drag — never fully stack into one card. */
export const OFFER_STACK_LIFT_CAP = 0.35;

export function visibleOfferStack<T>(rides: T[], max = OFFER_STACK_VISIBLE_MAX): T[] {
  if (max <= 0) return [];
  return rides.slice(0, max);
}

function clampDepth(depth: number, last: number): number {
  return Math.min(Math.max(depth, 0), last);
}

export function offerStackPeekY(depth: number): number {
  return OFFER_STACK_PEEK_Y[clampDepth(depth, OFFER_STACK_PEEK_Y.length - 1)];
}

export function offerStackPeekX(depth: number): number {
  return OFFER_STACK_PEEK_X[clampDepth(depth, OFFER_STACK_PEEK_X.length - 1)];
}

export function offerStackScale(depth: number): number {
  return OFFER_STACK_SCALE[clampDepth(depth, OFFER_STACK_SCALE.length - 1)];
}

export function offerStackOpacity(depth: number): number {
  return OFFER_STACK_OPACITY[clampDepth(depth, OFFER_STACK_OPACITY.length - 1)];
}

/** Static rest layout — immune to Reanimated freeze on AppState resume. */
export function offerStackRestStyle(
  depth: number,
  stackCardLeft: number,
): ViewStyle {
  return {
    top: offerStackPeekY(depth),
    left: stackCardLeft + offerStackPeekX(depth),
    zIndex: 20 - depth,
    opacity: offerStackOpacity(depth),
    transform: [{ scale: offerStackScale(depth) }],
  };
}

/**
 * During a front-card drag, rear cards lift slightly toward the front.
 * progress 0 = rest peek; progress 1 = at most LIFT_CAP of the peek cancelled.
 */
export function offerStackDragLift(
  depth: number,
  progress: number,
): { translateX: number; translateY: number } {
  const p = Math.min(1, Math.max(0, progress)) * OFFER_STACK_LIFT_CAP;
  if (p < 1e-6) return { translateX: 0, translateY: 0 };
  return {
    translateX: -offerStackPeekX(depth) * p,
    translateY: -offerStackPeekY(depth) * p,
  };
}

/** Extra stack height so offset silhouettes are not clipped. */
export function offerStackExtraHeight(visibleCount: number): number {
  if (visibleCount <= 1) return 0;
  const depth = Math.min(visibleCount - 1, OFFER_STACK_PEEK_Y.length - 1);
  return OFFER_STACK_PEEK_Y[depth] + 8;
}
