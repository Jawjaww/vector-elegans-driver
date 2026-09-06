import {
  pointInRect,
  shouldActivateDismiss,
  shouldCompleteDismiss,
} from '../utils/offerDismissGesture';

describe('offerDismissGesture helpers', () => {
  const mapHole = { x: 40, y: 200, w: 300, h: 410 };
  const handleBand = { x: 0, y: 80, w: 390, h: 40 };

  describe('pointInRect', () => {
    it('returns true inside rect', () => {
      expect(pointInRect(50, 210, mapHole)).toBe(true);
    });

    it('returns false outside rect', () => {
      expect(pointInRect(10, 10, mapHole)).toBe(false);
    });

    it('returns false for null rect', () => {
      expect(pointInRect(10, 10, null)).toBe(false);
    });
  });

  describe('shouldActivateDismiss', () => {
    it('activates on handle band', () => {
      expect(shouldActivateDismiss(195, 95, mapHole, handleBand)).toBe(true);
    });

    it('does not activate inside map hole', () => {
      expect(shouldActivateDismiss(150, 300, mapHole, handleBand)).toBe(false);
    });

    it('activates on chrome outside hole', () => {
      expect(shouldActivateDismiss(20, 150, mapHole, handleBand)).toBe(true);
    });
  });

  describe('shouldCompleteDismiss', () => {
    it('completes on long swipe', () => {
      expect(
        shouldCompleteDismiss(200, 0, 0, 0, 390, 844),
      ).toBe(true);
    });

    it('completes on high velocity', () => {
      expect(
        shouldCompleteDismiss(30, 0, 900, 0, 390, 844),
      ).toBe(true);
    });

    it('does not complete on short slow swipe', () => {
      expect(
        shouldCompleteDismiss(20, 5, 100, 50, 390, 844),
      ).toBe(false);
    });
  });
});
