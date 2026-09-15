import type { GestureType } from 'react-native-gesture-handler';

let tabBarPanGesture: GestureType | null = null;
const listeners = new Set<() => void>();

/** Home tab bar upward drag — registered while BottomSheet is mounted. */
export function setBottomSheetTabBarPanGesture(
  gesture: GestureType | null,
): void {
  tabBarPanGesture = gesture;
  listeners.forEach((listener) => listener());
}

export function getBottomSheetTabBarPanGesture(): GestureType | null {
  return tabBarPanGesture;
}

export function subscribeBottomSheetTabBarPan(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
