import * as Updates from 'expo-updates';

import type { OtaActionResult } from './otaUpdateStatus';

export async function runOtaCheck(): Promise<
  OtaActionResult & { isAvailable?: boolean }
> {
  if (!Updates.isEnabled) {
    return { ok: false, message: 'OTA_DISABLED' };
  }
  try {
    const result = await Updates.checkForUpdateAsync();
    return { ok: true, isAvailable: result.isAvailable };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runOtaFetch(): Promise<OtaActionResult> {
  if (!Updates.isEnabled) {
    return { ok: false, message: 'OTA_DISABLED' };
  }
  try {
    const result = await Updates.fetchUpdateAsync();
    if (!result.isNew) {
      return { ok: false, message: 'NO_UPDATE_FETCHED' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runOtaReload(): Promise<OtaActionResult> {
  if (!Updates.isEnabled) {
    return { ok: false, message: 'OTA_DISABLED' };
  }
  try {
    await Updates.reloadAsync();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
