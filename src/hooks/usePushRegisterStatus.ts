import { useEffect, useState } from 'react';
import type { PushRegisterResult } from '../lib/notifications/pushRegistration';
import {
  getLastPushRegisterResult,
  hydratePushRegisterResult,
  subscribePushRegisterResult,
} from '../lib/notifications/pushStatusStore';

export function usePushRegisterStatus(): PushRegisterResult | null {
  const [result, setResult] = useState<PushRegisterResult | null>(
    getLastPushRegisterResult,
  );

  useEffect(() => {
    void hydratePushRegisterResult();
    return subscribePushRegisterResult(setResult);
  }, []);

  return result;
}
