import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PushRegisterResult } from './pushRegistration';

const STORAGE_KEY = 've.pushRegisterResult.v1';

let lastResult: PushRegisterResult | null = null;
const listeners = new Set<(result: PushRegisterResult | null) => void>();

export function getLastPushRegisterResult(): PushRegisterResult | null {
  return lastResult;
}

export function subscribePushRegisterResult(
  listener: (result: PushRegisterResult | null) => void,
): () => void {
  listeners.add(listener);
  listener(lastResult);
  return () => {
    listeners.delete(listener);
  };
}

function notify(result: PushRegisterResult | null): void {
  lastResult = result;
  listeners.forEach((listener) => listener(result));
}

export function publishPushRegisterResult(result: PushRegisterResult): void {
  notify(result);
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result)).catch(() => {
    /* ignore storage failures */
  });
}

export async function hydratePushRegisterResult(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PushRegisterResult;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
      return;
    }
    notify(parsed);
  } catch {
    /* ignore corrupt cache */
  }
}
