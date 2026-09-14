import { shouldOpenHomeFromPushData } from '../notifications/pushOpen';
import { pushRegisterFailureI18n } from '../notifications/pushStatusCopy';

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
