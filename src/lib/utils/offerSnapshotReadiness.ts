/** Mean luma below this → empty / unloaded tiles (Liberty style is light). */
export const OFFER_SNAPSHOT_DARK_LUMA = 32;

export const OFFER_SNAPSHOT_COVER_TIMEOUT_MS = 1500;

/** Pipeline waits slightly longer than the card onLoad fallback. */
export const OFFER_SNAPSHOT_PIPELINE_COVER_TIMEOUT_MS = 1800;

export const OFFER_SNAPSHOT_CAPTURE_RETRIES = 3;

export const OFFER_OSRM_TIMEOUT_MS = 12_000;

export function isOsrmTripReady(
  drewFromOsrm: boolean,
  coordinateCount = 0,
): boolean {
  return drewFromOsrm && coordinateCount > 2;
}

export function shouldAcceptCapturedJpeg(
  dataUrl: string | null | undefined,
): boolean {
  return Boolean(dataUrl && dataUrl.length > 32);
}

export function meanLumaFromRgba(data: ArrayLike<number>): number {
  if (data.length < 4) return 255;
  let sum = 0;
  let pixels = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    pixels += 1;
  }
  return pixels > 0 ? sum / pixels : 255;
}

export function isCanvasSampleTooDark(
  meanLuma: number,
  threshold = OFFER_SNAPSHOT_DARK_LUMA,
): boolean {
  return meanLuma < threshold;
}

export function canCaptureOfferSnapshot(input: {
  osrmTrip: boolean;
  routeLayer: boolean;
  tilesLoaded: boolean;
  cameraMoving: boolean;
}): boolean {
  return (
    input.osrmTrip &&
    input.routeLayer &&
    input.tilesLoaded &&
    !input.cameraMoving
  );
}
