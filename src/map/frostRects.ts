import type { ComponentRef } from 'react';
import type { View } from 'react-native';

/**
 * Layout-space frames of the glass cards, relative to the map scene.
 *
 * The blur cannot live in a native view: the map is a hardware WebView, and a blur view
 * samples the chrome behind that surface. Each card publishes its frame in the scene that
 * also owns the WebView, so the document can place the frost on that same rectangle.
 * Window coordinates are the wrong space here: a `bottom`-anchored card and the WebView
 * do not agree about the status bar, and the frost then sits below the hairline.
 */

/** Host ref of the scene that contains both the map WebView and the glass cards. */
export type FrostScene = ComponentRef<typeof View>;

/** The scene that contains both the map WebView and the glass cards. */
let scene: FrostScene | null = null;

export function setFrostScene(next: FrostScene | null): void {
  scene = next;
}

export function getFrostScene(): FrostScene | null {
  return scene;
}

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

function sameRect(a: FrostRect, b: FrostRect): boolean {
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5 &&
    a.radius === b.radius
  );
}

export function publishFrostRect(rect: FrostRect): void {
  const prev = rects.get(rect.id);
  if (prev && sameRect(prev, rect)) return;
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
