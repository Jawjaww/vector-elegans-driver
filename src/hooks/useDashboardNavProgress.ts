import { useCallback, useEffect, useRef, useState } from 'react';

import {
  optimisticEtaMinutes,
  type NavProgress,
} from '../lib/utils/navProgress';
import { useDriverStore } from '../lib/stores/driverStore';
import { logOfferStage } from '../lib/notifications/offerPipelineDiag';
import { supabase } from '../lib/supabase';

export function useDashboardNavProgress(activeRideId: string | undefined) {
  const [navProgress, setNavProgress] = useState<NavProgress | null>(null);
  const lastNavRpcAt = useRef(0);

  useEffect(() => {
    if (!activeRideId) {
      setNavProgress(null);
      lastNavRpcAt.current = 0;
    }
  }, [activeRideId]);

  const pushNavProgress = useCallback((progress: NavProgress) => {
    setNavProgress(progress);
    const rideId = useDriverStore.getState().activeRide?.id;
    if (!rideId) return;
    const now = Date.now();
    if (now - lastNavRpcAt.current < 12_000) return;
    lastNavRpcAt.current = now;
    const eta = optimisticEtaMinutes(
      progress.durationSeconds,
      progress.distanceMeters,
    );
    const remaining = Math.round(progress.distanceMeters);
    void supabase
      .rpc('update_ride_nav_progress', {
        p_ride_id: rideId,
        p_eta_minutes: eta,
        p_remaining_m: remaining,
      })
      .then(({ data, error }) => {
        // Read the answer. The function reports a refusal in its body (`{success: false}`), which
        // the client treats as a fulfilled request — a call rejected by its own guards was
        // therefore indistinguishable from a successful one, and `rides.nav_updated_at` stayed
        // NULL with nothing to say why.
        const payload = data as { success?: boolean; error?: string } | null;
        if (error) {
          logOfferStage('nav_progress_error', { error: error.message }, rideId);
          return;
        }
        if (payload?.success === false) {
          logOfferStage(
            'nav_progress_error',
            { error: payload.error ?? 'unknown' },
            rideId,
          );
          return;
        }
        logOfferStage(
          'nav_progress_ok',
          { eta_minutes: eta, remaining_m: remaining },
          rideId,
        );
      });
  }, []);

  return { navProgress, pushNavProgress };
}
