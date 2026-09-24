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
import { visibleProvisionalOffer } from '../utils/homeSheetSnap';

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
      offerArrivalSource: null,
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

  // The ring's whole decision rests on this, and it is not recoverable later: both paths end in
  // the same queued open, so an unwritten source would be read as "no arrival" and the offer
  // would arrive in silence.
  it('records which path brought the arrival', () => {
    queueOfferOpen('ride-1', null, preview, 'silent_wake');
    expect(useDriverStore.getState().offerArrivalSource).toBe('wake');

    queueOfferOpen('ride-2', null, preview, 'tap_received');
    expect(useDriverStore.getState().offerArrivalSource).toBe('tap');

    // Defaulted rather than left unset: a caller that forgets the argument must not silently
    // claim a wake, because that is the one value that arms a sound.
    queueOfferOpen('ride-3', null, preview);
    expect(useDriverStore.getState().offerArrivalSource).toBe('tap');
  });

  // The regression this pins: a ride already present in the store was treated as a ride
  // already on screen, and the placeholder was skipped. "Tracked" only means a copy exists —
  // the boot, the hydration gate and the display gate still stand between that copy and the
  // driver, and that is exactly the case the placeholder exists for. Yielding to the real card
  // is the overlay's job, keyed on the deck actually holding that ride.
  it('keeps the provisional card when the ride is already in the stack', () => {
    useDriverStore.setState({ availableRides: [makeRide('ride-1')] });
    queueOfferOpen('ride-1', null, preview);
    expect(useDriverStore.getState().provisionalOffer).toEqual(preview);
  });

  it('keeps the provisional card when the ride is already the active ride', () => {
    useDriverStore.setState({ activeRide: makeRide('ride-1') });
    queueOfferOpen('ride-1', null, preview);
    expect(useDriverStore.getState().provisionalOffer).toEqual(preview);
  });

  it('keeps the provisional card when the ride is only deferred', () => {
    useDriverStore.setState({ deferredRides: [makeRide('ride-1')] });
    queueOfferOpen('ride-1', null, preview);
    expect(useDriverStore.getState().provisionalOffer).toEqual(preview);
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

  // The other half of the delay happens before JS exists, and neither entry point had any
  // vocabulary: a silent wake was indistinguishable from a tap, and the native decision log
  // had nowhere to land.
  it('declares silent_wake and native_diag', () => {
    expect(OFFER_PIPELINE_STAGES).toContain('silent_wake');
    expect(OFFER_PIPELINE_STAGES).toContain('native_diag');
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
    expect(dashboard).toContain('provisional={visibleProvisional}');
    // One shared element, rendered by the boot branch and by the dashboard tree.
    expect(dashboard).toContain('<DashboardOfferOverlay');
    expect(dashboard).toContain('canShowOffers={showOfferCarousel}');
    expect(dashboard).toContain('booting={loading}');
    // The boot gate and the display gate stay composed: the placeholder is shown through the
    // boot, and it yields only once the deck holds that same ride (pinned separately below).
    expect(dashboard).toContain('const deckRides = canShowOffers ? rides : [];');
  });

  it('drops the placeholder as soon as the deck holds the same ride', () => {
    // The real card carries coordinates, distance and approach time; the payload carries none
    // of them, so the placeholder must never stay in front of it. Keyed on the ride rather than
    // on `canShowOffers` alone: a deck showing some other offer is no reason to drop the only
    // thing describing this one.
    //
    // The rule moved into `visibleProvisionalOffer` when the sheet needed to read the same
    // answer; asserting the behaviour there is stronger than asserting the shape of the
    // expression that happened to hold it.
    const preview = {
      rideId: 'ride-1',
      pickupAddress: '12 rue Oberkampf',
      dropoffAddress: 'CDG 2E',
      priceLabel: '38,50 €',
    };
    expect(visibleProvisionalOffer(preview, ['other-ride'])).toEqual(preview);
    expect(visibleProvisionalOffer(preview, [preview.rideId])).toBeNull();
    expect(visibleProvisionalOffer(null, [preview.rideId])).toBeNull();

    // The second way it yields, and the one the deck cannot express: an accepted ride leaves
    // `availableRides`, so its id is no longer in the deck and the card used to be read as
    // still worth showing — over the ride it had just been accepted for. Measured at
    // 22:01:05.970, two and a half seconds after the accept, dropped by its TTL rather than by
    // the answer.
    expect(visibleProvisionalOffer(preview, [], preview.rideId)).toBeNull();
    // A deck for some *other* ride is still no reason to drop it.
    expect(visibleProvisionalOffer(preview, [preview.rideId], 'other-ride')).toBeNull();

    // And the dashboard resolves it once, for the overlay and for the sheet alike, with the
    // active ride passed in so the two cannot disagree.
    expect(dashboard).toContain(
      'visibleProvisionalOffer(provisionalOffer, deckOfferIds, activeRide?.id ?? null)',
    );
    expect(dashboard).toContain('provisional={visibleProvisional}');
    expect(dashboard).toContain(
      'hasProvisionalOffer: visibleProvisional !== null',
    );
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

describe('the silent wake hands the ride to JS', () => {
  const notifications = readSource(join('src', 'hooks', 'useNotifications.ts'));
  const overlay = readSource(join('src', 'lib', 'overlay', 'overlayService.ts'));

  // A silent wake resumes the launcher activity: no extras, no NotificationResponse, nothing
  // for the tap path to read. Without this read the offer goes back to being rediscovered by
  // the boot — the very latency the wake was built to remove.
  it('reads the payload the native side kept', () => {
    expect(notifications).toContain('consumeNativeOfferPush()');
    expect(notifications).toContain(
      "handleNotificationOpen(payload, null, 'silent_wake')",
    );
    expect(overlay).toContain('consumePendingOfferPush');
  });

  it('reads it on mount and on every return to the foreground', () => {
    // Declared once, called from the effect that reads it at mount and from the AppState
    // listener: both are needed, since the payload can land before JS exists or while it is
    // merely in the background.
    const calls = notifications.match(/consumeSilentWake\(\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  // The hook's synchronous read returns null when the native modules were not yet initialised
  // at the first layout effect, and nothing re-read it afterwards: a cold-start tap could be
  // dropped for good.
  it('re-reads the pending response beyond the hook first render', () => {
    expect(notifications).toContain('Notifications.getLastNotificationResponse()');
  });

  // That read replaces `getLastNotificationResponseAsync`, which was a bare promise wrapper
  // around this very call. Keeping the deprecated one would work but hides the trap below.
  it('does not use the deprecated async form', () => {
    expect(notifications).not.toContain('getLastNotificationResponseAsync');
  });

  // The async form turned an unavailable native module into a rejection that `void` dropped; the
  // synchronous one *throws*, on the cold-start path. Uncaught, it would break the very start it
  // was meant to observe.
  it('catches the synchronous read, which throws where the async form rejected', () => {
    const call = notifications.indexOf('Notifications.getLastNotificationResponse()');
    expect(call).toBeGreaterThan(-1);
    const tryAt = notifications.lastIndexOf('try {', call);
    const catchAt = notifications.indexOf('catch', call);
    expect(tryAt).toBeGreaterThan(-1);
    expect(catchAt).toBeGreaterThan(call);
  });

  // The native side keeps a copy of every offer payload it was woken by, and the tray path
  // carries the same ride plus the tray action: without the window, the actionless copy could
  // queue the ride again and overwrite an Accept with a plain open.
  it('cannot queue the same push twice', () => {
    expect(notifications).toContain('DOUBLE_QUEUE_WINDOW_MS');
    expect(notifications).toMatch(/queuedRideIds\.current\.get\(rideId\)/);
    expect(notifications).toMatch(
      /queuedRideIds\.current\.set\(rideId, Date\.now\(\)\)/,
    );
  });

  // The native log is the only trace of the part of the delay that happens before JS exists.
  it('forwards the native decision log to the pipeline', () => {
    expect(notifications).toContain('drainOverlayDiagnostics()');
    expect(notifications).toMatch(/logOfferStage\('native_diag'/);
    expect(notifications).toContain('native_at');
  });
});
