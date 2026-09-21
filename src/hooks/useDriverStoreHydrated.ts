import { useEffect, useState } from 'react';

import { useDriverStore } from '../lib/stores/driverStore';

/**
 * Whether the persisted driver store has finished rehydrating from AsyncStorage.
 *
 * The dashboard must not decide anything about an offer from the pre-hydration snapshot.
 * `activeRide` is persisted and comes back asynchronously, so before hydration it reads
 * `null` — and `null` is exactly what `canDisplayOffers` interprets as "this driver has no
 * ride in progress". Acting early would therefore hand an offer to a driver already on a
 * trip and let them accept a second one.
 */
export function useDriverStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useDriverStore.persist.hasHydrated(),
  );

  useEffect(() => {
    // Re-check first: hydration can complete between the initial render and this effect,
    // and `onFinishHydration` only fires for a completion that has not happened yet.
    if (useDriverStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useDriverStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  return hydrated;
}
