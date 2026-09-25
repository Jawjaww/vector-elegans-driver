/**
 * Window-space frames of the glass cards drawn above the map.
 *
 * The blur cannot live in a native view: the map is a hardware WebView, and a blur view
 * samples the chrome behind that surface. Each card publishes its frame; the map document
 * copies the canvas under it.
 */

export type FrostRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

const rects = new Map<string, FrostRect>();
const listeners = new Set<(list: FrostRect[]) => void>();

function emit(): void {
  const list = [...rects.values()];
  listeners.forEach((listener) => listener(list));
}

export function publishFrostRect(rect: FrostRect): void {
  rects.set(rect.id, rect);
  emit();
}

export function clearFrostRect(id: string): void {
  if (rects.delete(id)) emit();
}

export function getFrostRects(): FrostRect[] {
  return [...rects.values()];
}

export function subscribeFrostRects(
  listener: (list: FrostRect[]) => void,
): () => void {
  listeners.add(listener);
  listener(getFrostRects());
  return () => {
    listeners.delete(listener);
  };
}
