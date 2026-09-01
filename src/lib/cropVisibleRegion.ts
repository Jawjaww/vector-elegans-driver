import {
  isNearlyFullImage,
  visibleImageCropRect,
  type CropRect,
  type Size,
} from './visibleImageCrop';
import type { PinchZoomTransform } from '../components/PinchZoomImage';

export async function cropVisibleRegion(
  uri: string,
  viewport: Size,
  image: Size,
  transform: PinchZoomTransform,
  cropWindow?: CropRect,
): Promise<string> {
  const crop = visibleImageCropRect({
    viewport,
    image,
    scale: transform.scale,
    translateX: transform.translateX,
    translateY: transform.translateY,
    cropWindow,
  });
  if (!crop || isNearlyFullImage(crop, image)) return uri;

  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(uri, [{ crop }], {
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  } catch (error) {
    console.warn('[cropVisibleRegion] using original image', error);
    return uri;
  }
}
