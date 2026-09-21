jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The diagnostic sink is mocked, not stubbed away: the timeline's first two stages are exactly
// what a regression would silently drop (they were declared for a while without ever being
// emitted), and a timeline missing its start cannot measure anything.
jest.mock('../notifications/offerPipelineDiag', () => ({
  logOfferStage: jest.fn(),
}));

import {
  consumePendingOfferOpen,
  notificationResponseEventKey,
  offerActionFromIdentifier,
  queueOfferOpen,
  rideIdFromPushData,
  shouldOpenHomeFromPushData,
} from '../notifications/pushOpen';
import { logOfferStage } from '../notifications/offerPipelineDiag';
import { presentationForIncomingPush } from '../notifications/pushPresentation';
import { pushRegisterFailureI18n } from '../notifications/pushStatusCopy';
import {
  getAuthRefreshKeepAlive,
  sessionAccessTokenIsExpiring,
  setAuthRefreshKeepAlive,
  shouldKeepAuthRefresh,
} from '../authRefreshGate';

describe('shouldOpenHomeFromPushData', () => {
  it('opens home for a ride_offer payload', () => {
    expect(
      shouldOpenHomeFromPushData({ type: 'ride_offer', ride_id: 'abc' }),
    ).toBe(true);
  });

  it('opens home when only ride_id is present', () => {
    expect(shouldOpenHomeFromPushData({ ride_id: 'abc' })).toBe(true);
  });

  it('ignores unrelated notifications', () => {
    expect(shouldOpenHomeFromPushData({ type: 'promo' })).toBe(false);
    expect(shouldOpenHomeFromPushData({})).toBe(false);
  });
});

describe('offer opened from a push', () => {
  afterEach(() => {
    consumePendingOfferOpen();
  });

  it('reads ride_id only from a non-empty string', () => {
    expect(rideIdFromPushData({ ride_id: 'abc' })).toBe('abc');
    expect(rideIdFromPushData({ ride_id: '' })).toBeNull();
    expect(rideIdFromPushData({ ride_id: 42 })).toBeNull();
    expect(rideIdFromPushData({})).toBeNull();
  });

  it('keeps the opened ride and action until consumed once', () => {
    queueOfferOpen('ride-1', 'accept');
    expect(consumePendingOfferOpen()).toEqual({
      rideId: 'ride-1',
      action: 'accept',
    });
    expect(consumePendingOfferOpen()).toBeNull();
  });

  it('queues a plain tap without a tray action', () => {
    queueOfferOpen('ride-2', null);
    expect(consumePendingOfferOpen()).toEqual({
      rideId: 'ride-2',
      action: null,
    });
  });

  it('records the queued stage, so a tap timeline has a start', () => {
    queueOfferOpen('ride-3', 'decline');
    expect(logOfferStage).toHaveBeenCalledWith(
      'pending_queued',
      { action: 'decline', provisional: false },
      'ride-3',
    );
  });

  it('records a plain tap as an open, not as a missing action', () => {
    queueOfferOpen('ride-4', null);
    expect(logOfferStage).toHaveBeenCalledWith(
      'pending_queued',
      { action: 'open', provisional: false },
      'ride-4',
    );
  });

  it('maps tray buttons to actions and a plain tap to none', () => {
    expect(offerActionFromIdentifier('accept')).toBe('accept');
    expect(offerActionFromIdentifier('decline')).toBe('decline');
    expect(
      offerActionFromIdentifier('expo.modules.notifications.actions.DEFAULT'),
    ).toBeNull();
  });

  it('keys a tap by event so a re-offer of the same ride is not swallowed', () => {
    const identifier = 'ride-offer-r1';
    const firstTap = { notification: { date: 1000, request: { identifier } } };
    const reOfferTap = { notification: { date: 2000, request: { identifier } } };

    expect(notificationResponseEventKey(firstTap)).not.toBe(
      notificationResponseEventKey(reOfferTap),
    );
    // Both delivery paths of the same event must still collapse to one key.
    expect(notificationResponseEventKey(firstTap)).toBe(
      notificationResponseEventKey({
        notification: { date: 1000, request: { identifier } },
      }),
    );
  });
});

describe('pushRegisterFailureI18n', () => {
  it('maps every failure reason to a dashboard copy key', () => {
    expect(pushRegisterFailureI18n('permission_denied').bodyKey).toBe(
      'dashboard.pushFailedPermission',
    );
    expect(pushRegisterFailureI18n('token_failed').bodyKey).toBe(
      'dashboard.pushFailedToken',
    );
    expect(pushRegisterFailureI18n('upsert_failed').bodyKey).toBe(
      'dashboard.pushFailedUpsert',
    );
    expect(pushRegisterFailureI18n('not_authenticated').bodyKey).toBe(
      'dashboard.pushFailedAuth',
    );
    expect(pushRegisterFailureI18n('no_project_id').bodyKey).toBe(
      'dashboard.pushFailedProject',
    );
  });
});

describe('presentationForIncomingPush', () => {
  it('always shows ride_offer heads-up even in the foreground', () => {
    const shown = presentationForIncomingPush('active', { type: 'ride_offer' });
    expect(shown.shouldShowBanner).toBe(true);
    expect(shown.shouldPlaySound).toBe(true);
  });

  it('hides unrelated alerts while the app is active', () => {
    const hidden = presentationForIncomingPush('active', { type: 'promo' });
    expect(hidden.shouldShowBanner).toBe(false);
    expect(hidden.shouldPlaySound).toBe(false);
  });

  it('shows unrelated alerts when backgrounded', () => {
    expect(
      presentationForIncomingPush('background', { type: 'promo' }).shouldShowBanner,
    ).toBe(true);
  });
});

describe('authRefreshGate', () => {
  afterEach(() => {
    setAuthRefreshKeepAlive(false);
  });

  it('keeps refresh while the location FGS flag is on', () => {
    setAuthRefreshKeepAlive(true);
    expect(getAuthRefreshKeepAlive()).toBe(true);
    expect(shouldKeepAuthRefresh('background')).toBe(true);
    setAuthRefreshKeepAlive(false);
    expect(shouldKeepAuthRefresh('background')).toBe(false);
    expect(shouldKeepAuthRefresh('active')).toBe(true);
  });

  it('treats missing or soon-expiring tokens as stale', () => {
    expect(sessionAccessTokenIsExpiring(undefined, 1_000_000)).toBe(true);
    expect(sessionAccessTokenIsExpiring(1_000, 1_000_000, 60_000)).toBe(true);
    expect(sessionAccessTokenIsExpiring(2_000, 1_000_000, 0)).toBe(false);
  });
});
