jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import. These tests read the dashboard's source to pin
// invariants that no unit-level behaviour can express — where the boot stops waiting.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import {
  OFFER_ARRIVAL_INSTANT_WINDOW_MS,
  isNotificationArrival,
  previewFromPushData,
} from '../notifications/offerPreview';
import { queueOfferOpen } from '../notifications/pushOpen';
import { OFFER_PIPELINE_STAGES } from '../notifications/offerPipelineDiag';
import { useDriverStore, type Ride } from '../stores/driverStore';

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function makeRide(id: string): Ride {
  return {
    id,
    user_id: 'user-1',
    status: 'pending',
    pickup_address: '1 rue de la Paix',
    pickup_lat: 48.86,
    pickup_lon: 2.33,
    dropoff_address: '2 avenue Foch',
    dropoff_lat: 48.87,
    dropoff_lon: 2.34,
    pickup_time: '2026-09-21T13:00:00.000Z',
    distance: 3,
    duration: 12,
    vehicle_type: 'berline',
    estimated_price: 25,
    final_price: null,
    created_at: '2026-09-21T12:00:00.000Z',
    updated_at: '2026-09-21T12:00:00.000Z',
  };
}

describe('isNotificationArrival', () => {
  const TAP_AT = 1_000_000;

  it('is false when no notification was tapped', () => {
    expect(isNotificationArrival(null, TAP_AT)).toBe(false);
  });

  it('holds right after the tap', () => {
    expect(isNotificationArrival(TAP_AT, TAP_AT)).toBe(true);
    expect(isNotificationArrival(TAP_AT, TAP_AT + 250)).toBe(true);
    expect(
      isNotificationArrival(TAP_AT, TAP_AT + OFFER_ARRIVAL_INSTANT_WINDOW_MS - 1),
    ).toBe(true);
  });

  it('releases once the window has elapsed', () => {
    expect(
      isNotificationArrival(TAP_AT, TAP_AT + OFFER_ARRIVAL_INSTANT_WINDOW_MS),
    ).toBe(false);
    expect(isNotificationArrival(TAP_AT, TAP_AT + 120_000)).toBe(false);
  });

  // A device clock that steps backwards must not freeze the arrival window open forever.
  it('treats a backwards clock as a fresh arrival', () => {
    expect(isNotificationArrival(TAP_AT, TAP_AT - 5_000)).toBe(true);
  });
});

describe('previewFromPushData: the payload is all the provisional card has', () => {
  it('reads the pickup, the dropoff and the price the notification displayed', () => {
    expect(
      previewFromPushData(
        {
          pickup_address: '12 rue Oberkampf, Paris',
          dropoff_address: 'Aéroport CDG, Terminal 2E',
          price_label: '38,50 €',
        },
        'ride-1',
      ),
    ).toEqual({
      rideId: 'ride-1',
      pickupAddress: '12 rue Oberkampf, Paris',
      dropoffAddress: 'Aéroport CDG, Terminal 2E',
      priceLabel: '38,50 €',
    });
  });

  it('falls back to the numeric estimate when no label was sent', () => {
    expect(previewFromPushData({ estimated_price: 25 }, 'ride-2')?.priceLabel).toBe(
      '25.00 €',
    );
    expect(
      previewFromPushData({ estimated_price: '31.5' }, 'ride-3')?.priceLabel,
    ).toBe('31.50 €');
  });

  it('treats blank and whitespace-only fields as absent', () => {
    const preview = previewFromPushData(
      { pickup_address: '   ', dropoff_address: '', price_label: ' 12 € ' },
      'ride-4',
    );
    expect(preview).toEqual({
      rideId: 'ride-4',
      pickupAddress: null,
      dropoffAddress: null,
      priceLabel: '12 €',
    });
  });

  it('ignores non-string fields instead of coercing them', () => {
    const preview = previewFromPushData(
      { pickup_address: 42, dropoff_address: { city: 'Paris' }, price_label: '9 €' },
      'ride-5',
    );
    expect(preview).toEqual({
      rideId: 'ride-5',
      pickupAddress: null,
      dropoffAddress: null,
      priceLabel: '9 €',
    });
  });

  // An empty card would be worse than the ordinary path, which ends in an explainable notice.
  it('refuses to build a card with nothing to show', () => {
    expect(previewFromPushData({}, 'ride-6')).toBeNull();
    expect(previewFromPushData({ ride_id: 'ride-6' }, 'ride-6')).toBeNull();
    expect(
      previewFromPushData({ pickup_address: null, estimated_price: 'abc' }, 'ride-6'),
    ).toBeNull();
  });
});

describe('queueOfferOpen: the arrival is written before any network', () => {
  beforeEach(() => {
    useDriverStore.setState({
      pendingOfferOpen: null,
      provisionalOffer: null,
      offerArrivalAt: null,
      availableRides: [],
      deferredRides: [],
      activeRide: null,
    });
  });

  const preview = {
    rideId: 'ride-1',
    pickupAddress: '12 rue Oberkampf',
    dropoffAddress: 'CDG 2E',
    priceLabel: '38,50 €',
  };

  it('queues the ride, marks the arrival and keeps the payload contents', () => {
    const before = Date.now();
    queueOfferOpen('ride-1', 'accept', preview);

    const state = useDriverStore.getState();
    expect(state.pendingOfferOpen).toEqual({ rideId: 'ride-1', action: 'accept' });
    expect(state.provisionalOffer).toEqual(preview);
    expect(state.offerArrivalAt).toBeGreaterThanOrEqual(before);
    expect(isNotificationArrival(state.offerArrivalAt)).toBe(true);
  });

  // A tracked ride carries coordinates, distance and approach time; the payload carries none
  // of them, so the provisional card could only downgrade what is already on screen.
  it('skips the provisional card when the ride is already in the stack', () => {
    useDriverStore.setState({ availableRides: [makeRide('ride-1')] });
    queueOfferOpen('ride-1', null, preview);
    expect(useDriverStore.getState().provisionalOffer).toBeNull();
  });

  it('skips the provisional card when the ride is already the active ride', () => {
    useDriverStore.setState({ activeRide: makeRide('ride-1') });
    queueOfferOpen('ride-1', null, preview);
    expect(useDriverStore.getState().provisionalOffer).toBeNull();
  });

  it('skips the provisional card when the ride is only deferred', () => {
    useDriverStore.setState({ deferredRides: [makeRide('ride-1')] });
    queueOfferOpen('ride-1', null, preview);
    expect(useDriverStore.getState().provisionalOffer).toBeNull();
  });

  it('clears a provisional card only while it still describes the same ride', () => {
    useDriverStore.setState({ provisionalOffer: preview });
    useDriverStore.getState().clearProvisionalOffer('ride-other');
    expect(useDriverStore.getState().provisionalOffer).toEqual(preview);

    useDriverStore.getState().clearProvisionalOffer('ride-1');
    expect(useDriverStore.getState().provisionalOffer).toBeNull();
  });

  // Both fields describe a single tap. Persisting them would replay a stale arrival, and the
  // entry-animation window, on the next cold start.
  it('never persists the arrival markers', () => {
    queueOfferOpen('ride-1', null, preview);
    const partialize = useDriverStore.persist.getOptions().partialize;
    const persisted = partialize?.(useDriverStore.getState()) as Record<string, unknown>;
    expect(persisted).toBeTruthy();
    expect(persisted).not.toHaveProperty('provisionalOffer');
    expect(persisted).not.toHaveProperty('offerArrivalAt');
    expect(persisted).not.toHaveProperty('pendingOfferOpen');
  });
});

describe('the diagnostic vocabulary covers the boot and the paint', () => {
  // Without these two the reported latency is unmeasurable: `boot_ready` cannot say which
  // round-trip cost the time, and nothing says when the card actually reached the screen.
  it('declares boot_step and offer_painted', () => {
    expect(OFFER_PIPELINE_STAGES).toContain('boot_step');
    expect(OFFER_PIPELINE_STAGES).toContain('offer_painted');
  });
});

describe('the boot no longer stands between the tap and the ride', () => {
  const dashboard = readSource(join('app', '(tabs)', 'index.tsx'));

  function bootBody(): string {
    const start = dashboard.indexOf('const fetchDriverStatus = useCallback');
    const end = dashboard.indexOf('}, [applyDriverStatus, router]);');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return dashboard.slice(start, end);
  }

  it('times every step it still waits for', () => {
    expect(bootBody()).toContain('timedBootStep("auth"');
    expect(bootBody()).toContain('timedBootStep("drivers"');
  });

  // The regression this pins: `loading` fell only after four serial round-trips, and the whole
  // screen sat behind `if (loading)`. Deleting the detachment below puts the two secondary
  // reads back on the critical path, and this test fails.
  it('keeps the online switch and the trip sheet off the critical path', () => {
    const body = bootBody();
    expect(body).toContain('void hydrateSecondaryDriverState(');
    expect(body).not.toContain('.from("driver_locations")');
    expect(body).not.toContain('timedBootStep("locations"');
    expect(body).not.toContain('timedBootStep("assigned_ride"');
  });

  it('still performs both secondary reads, detached', () => {
    const start = dashboard.indexOf('async function hydrateSecondaryDriverState');
    const end = dashboard.indexOf('async function toggleDriverOnlineState');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const detached = dashboard.slice(start, end);
    expect(detached).toContain('.from("driver_locations")');
    expect(detached).toContain('timedBootStep("assigned_ride"');
  });

  it('paints a provisional card through the boot gate', () => {
    expect(dashboard).toContain('shouldBypassBootGate({');
    expect(dashboard).toContain('provisional={provisionalOffer}');
    // One shared element, rendered by the boot branch and by the dashboard tree.
    expect(dashboard).toContain('<DashboardOfferOverlay');
    expect(dashboard).toContain('canShowOffers={showOfferCarousel}');
    expect(dashboard).toContain('booting={loading}');
    // The boot gate and the display gate must stay composed: a provisional card is shown
    // through the boot, real cards keep the display gate.
    expect(dashboard).toContain('rides={canShowOffers ? rides : []}');
  });

  it('decides nothing about an offer before the persisted store is back', () => {
    expect(dashboard).toContain('useDriverStoreHydrated()');
    expect(dashboard).toMatch(/const canDisplay =\s*storeHydrated &&/);
    expect(dashboard).toMatch(/takeReadyOfferOpen\(\{[^}]*storeHydrated/);
  });

  it('presents the arrival without entry motion', () => {
    expect(dashboard).toContain('<AnimatedPage instant={notificationArrival}>');
  });
});

describe('the entry animations can be skipped on arrival', () => {
  it('AnimatedPage starts at its resting position when instant', () => {
    const source = readSource(join('src', 'components', 'AnimatedPage.tsx'));
    expect(source).toContain('instant');
    expect(source).toContain('useSharedValue(instant ? 1 : 0)');
    expect(source).toContain('useSharedValue(instant ? 0 : 15)');
    // The fade must not merely be shortened: an eager `withTiming` on mount would still paint
    // the page invisible for its duration.
    expect(source).toContain('if (instant) return undefined;');
  });

  it('OfferRideCard drops its four-staged cascade when asked to', () => {
    const source = readSource(join('src', 'components', 'OfferRideCard.tsx'));
    const skips = source.match(/entering=\{instantEntry \? undefined :/g) ?? [];
    // Approach, price header, trip details and the actions block: all four, or the Accept
    // button keeps its ~420 ms delayed cascade.
    expect(skips).toHaveLength(4);
  });

  it('the carousel renders the provisional card in front and records its paint', () => {
    const source = readSource(join('src', 'components', 'OfferRideCarousel.tsx'));
    expect(source).toContain('ProvisionalOfferCard');
    expect(source).toMatch(/logOfferStage\(\s*'offer_painted'/);
    expect(source).toContain('offerStackRestStyle(0, stackCardLeft, stackExtra)');
  });

  it('clears a provisional card that never resolves', () => {
    const dashboard = readSource(join('app', '(tabs)', 'index.tsx'));
    expect(dashboard).toContain('PROVISIONAL_OFFER_TTL_MS');
    expect(dashboard).toContain('clearProvisionalOffer(rideId)');
  });
});
