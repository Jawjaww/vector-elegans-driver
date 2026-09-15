import { shouldOpenHomeFromPushData } from '../notifications/pushOpen';
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
