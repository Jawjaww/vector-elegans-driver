/** Geometry helpers for swipe-to-cycle (see useOfferDismissGesture). */
export type Rect = { x: number; y: number; w: number; h: number };

export function pointInRect(x: number, y: number, rect: Rect | null): boolean {
  if (!rect) return false;
  return (
    x >= rect.x &&
    x <= rect.x + rect.w &&
    y >= rect.y &&
    y <= rect.y + rect.h
  );
}

/** Dismiss pan may start on chrome or handle band, not inside the map preview. */
export function shouldActivateDismiss(
  x: number,
  y: number,
  mapRect: Rect | null,
  handleBand: Rect | null,
): boolean {
  if (handleBand && pointInRect(x, y, handleBand)) return true;
  if (mapRect && pointInRect(x, y, mapRect)) return false;
  return true;
}

export function shouldCompleteDismiss(
  translationX: number,
  translationY: number,
  velocityX: number,
  velocityY: number,
  screenWidth: number,
  screenHeight: number,
): boolean {
  'worklet';
  const distance = Math.hypot(translationX, translationY);
  const screenDiagonal = Math.hypot(screenWidth, screenHeight);
  return (
    distance > screenDiagonal * 0.2 ||
    Math.abs(velocityX) > 800 ||
    Math.abs(velocityY) > 800
  );
}

export function computeDismissExitTarget(
  translationX: number,
  translationY: number,
  velocityX: number,
  velocityY: number,
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number } {
  'worklet';
  const exitDistance = Math.hypot(screenWidth, screenHeight) * 1.5;
  const magnitude = Math.hypot(translationX, translationY) || 1;

  if (
    magnitude < 10 &&
    (Math.abs(velocityX) > 100 || Math.abs(velocityY) > 100)
  ) {
    const vMag = Math.hypot(velocityX, velocityY) || 1;
    return {
      x: (velocityX / vMag) * exitDistance,
      y: (velocityY / vMag) * exitDistance,
    };
  }

  return {
    x: (translationX / magnitude) * exitDistance,
    y: (translationY / magnitude) * exitDistance,
  };
}
