import {
  isNearlyFullImage,
  visibleImageCropRect,
} from '../visibleImageCrop';

describe('visibleImageCropRect', () => {
  it('returns the full image when untransformed and contained', () => {
    const crop = visibleImageCropRect({
      viewport: { width: 400, height: 800 },
      image: { width: 400, height: 800 },
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
    expect(crop).toEqual({
      originX: 0,
      originY: 0,
      width: 400,
      height: 800,
    });
  });

  it('crops when zoomed in at the center', () => {
    const crop = visibleImageCropRect({
      viewport: { width: 400, height: 400 },
      image: { width: 400, height: 400 },
      scale: 2,
      translateX: 0,
      translateY: 0,
    });
    expect(crop).not.toBeNull();
    expect(crop?.width).toBe(200);
    expect(crop?.height).toBe(200);
    expect(crop?.originX).toBe(100);
    expect(crop?.originY).toBe(100);
  });

  it('detects nearly full coverage', () => {
    expect(
      isNearlyFullImage(
        { originX: 0, originY: 0, width: 990, height: 990 },
        { width: 1000, height: 1000 },
      ),
    ).toBe(true);
  });

  it('crops using a centered window smaller than the viewport', () => {
    const viewport = { width: 400, height: 800 };
    const cropWindow = {
      originX: 20,
      originY: 200,
      width: 360,
      height: 270,
    };
    const crop = visibleImageCropRect({
      viewport,
      image: { width: 400, height: 800 },
      scale: 1,
      translateX: 0,
      translateY: 0,
      cropWindow,
    });
    expect(crop).not.toBeNull();
    expect(crop?.width).toBeLessThan(400);
    expect(crop?.height).toBeLessThan(800);
    expect(crop?.originX).toBeGreaterThanOrEqual(0);
    expect(crop?.originY).toBeGreaterThanOrEqual(0);
  });
});
