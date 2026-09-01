export type Size = { width: number; height: number };

export type CropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

/** Map the visible crop window back onto image pixels after pinch/pan (contain + center origin). */
export function visibleImageCropRect(params: {
  viewport: Size;
  image: Size;
  scale: number;
  translateX: number;
  translateY: number;
  cropWindow?: CropRect;
}): CropRect | null {
  const { viewport, image, scale, translateX, translateY } = params;
  const cropWindow = params.cropWindow ?? {
    originX: 0,
    originY: 0,
    width: viewport.width,
    height: viewport.height,
  };

  if (image.width <= 0 || image.height <= 0 || scale <= 0) return null;
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  if (cropWindow.width <= 0 || cropWindow.height <= 0) return null;

  const fit = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  const displayedW = image.width * fit;
  const displayedH = image.height * fit;
  const offsetX = (viewport.width - displayedW) / 2;
  const offsetY = (viewport.height - displayedH) / 2;

  const toImage = (vx: number, vy: number) => {
    const dx =
      viewport.width / 2 + (vx - viewport.width / 2 - translateX) / scale;
    const dy =
      viewport.height / 2 + (vy - viewport.height / 2 - translateY) / scale;
    return {
      x: (dx - offsetX) / fit,
      y: (dy - offsetY) / fit,
    };
  };

  const left = cropWindow.originX;
  const top = cropWindow.originY;
  const right = cropWindow.originX + cropWindow.width;
  const bottom = cropWindow.originY + cropWindow.height;

  const a = toImage(left, top);
  const b = toImage(right, bottom);
  const imageLeft = Math.min(a.x, b.x);
  const imageRight = Math.max(a.x, b.x);
  const imageTop = Math.min(a.y, b.y);
  const imageBottom = Math.max(a.y, b.y);

  const originX = Math.max(0, imageLeft);
  const originY = Math.max(0, imageTop);
  const maxX = Math.min(image.width, imageRight);
  const maxY = Math.min(image.height, imageBottom);
  const width = maxX - originX;
  const height = maxY - originY;
  if (width < 8 || height < 8) return null;

  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function isNearlyFullImage(crop: CropRect, image: Size): boolean {
  const coverage = (crop.width * crop.height) / (image.width * image.height);
  return coverage >= 0.97;
}

/** Centered crop window (~90% width, 4:3) inside a viewport. */
export function defaultDocumentCropWindow(viewport: Size): CropRect {
  const width = viewport.width * 0.9;
  const height = Math.min(viewport.height * 0.55, width * 0.75);
  return {
    originX: (viewport.width - width) / 2,
    originY: (viewport.height - height) / 2,
    width,
    height,
  };
}
