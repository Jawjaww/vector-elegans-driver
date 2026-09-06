import { useCallback, useEffect, useRef, useState } from 'react';

import {
  optimisticEtaMinutes,
  type NavProgress,
} from '../lib/utils/navProgress';
import { useDriverStore } from '../lib/stores/driverStore';
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
    void supabase.rpc('update_ride_nav_progress', {
      p_ride_id: rideId,
      p_eta_minutes: eta,
      p_remaining_m: Math.round(progress.distanceMeters),
    });
  }, []);

  return { navProgress, pushNavProgress };
}
