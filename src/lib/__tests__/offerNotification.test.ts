// The app's Jest preset is `ts-jest` with no module transformation, so no `node_modules` package
// that ships ESM can be loaded — `expo-notifications` included. Mocked rather than pulled in: the
// behaviour under test is the filter, and the two calls around it are asserted on the source.
jest.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
}));

// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import { shouldDismissOfferNotification } from '../notifications/offerNotification';

/**
 * Retiring the tray entry once the driver has answered.
 *
 * The entry is the fallback for a wake that could not start the process, and it has no
 * counterpart: nothing withdraws it. Measured on a driver device, it stayed in the shade after
 * the offer was accepted — still announcing a ride already taken, with no timeout to retire it.
 *
 * The filter is what is tested here, because the failure that matters is silent: a sweep that
 * matches nothing dismisses nothing and reports no error, and the entry simply stays. The call
 * sites are pinned alongside, since a rule that is never reached is not a rule.
 */

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();
const DASHBOARD = 'app/(tabs)/index.tsx';

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

describe('which presented notifications the answer retires', () => {
  it('matches a ride offer by type, or by ride id alone', () => {
    // Both shapes exist in the wild: `dispatch-push` sends `type`, and a direct FCM send may
    // carry only `ride_id`. The native service already accepts either, so a sweep that required
    // `type` would leave half the entries behind while looking like it worked.
    expect(shouldDismissOfferNotification({ type: 'ride_offer', ride_id: 'r1' }, 'r1')).toBe(true);
    expect(shouldDismissOfferNotification({ ride_id: 'r1' }, 'r1')).toBe(true);
  });

  it('leaves every other notification alone', () => {
    // The sweep sees the whole shade, not just our entries. Dismissing a driver's message from
    // the backoffice because it happened to be there would be a worse bug than the one fixed.
    expect(shouldDismissOfferNotification({ type: 'promo' }, 'r1')).toBe(false);
    expect(shouldDismissOfferNotification({}, 'r1')).toBe(false);
    expect(shouldDismissOfferNotification({ type: 'dossier_action_needed' }, null)).toBe(false);
  });

  it('retires only the answered ride', () => {
    expect(shouldDismissOfferNotification({ ride_id: 'r2' }, 'r1')).toBe(false);
    expect(shouldDismissOfferNotification({ ride_id: 'r1' }, 'r1')).toBe(true);
  });

  it('treats a null ride id as "every offer", not as "no offer"', () => {
    // The sweep exists for entries left behind before this code shipped, and for the moment the
    // ride is not addressable. Matching nothing would make that call a silent no-op.
    expect(shouldDismissOfferNotification({ ride_id: 'r1' }, null)).toBe(true);
    expect(shouldDismissOfferNotification({ type: 'ride_offer' }, null)).toBe(true);
    // Still not a licence to clear the shade of anything else.
    expect(shouldDismissOfferNotification({ type: 'promo' }, null)).toBe(false);
  });
});

describe('the dashboard retires it wherever the driver answers', () => {
  const dashboard = readSource(DASHBOARD);

  function functionBody(signature: string): string {
    const start = dashboard.indexOf(signature);
    if (start < 0) throw new Error(`signature not found: ${signature}`);
    const open = dashboard.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < dashboard.length; i += 1) {
      if (dashboard[i] === '{') depth += 1;
      else if (dashboard[i] === '}') {
        depth -= 1;
        if (depth === 0) return dashboard.slice(open, i + 1);
      }
    }
    throw new Error(`unbalanced body: ${signature}`);
  }

  it('does it on both accepting paths', () => {
    // The card and the tray are two different call sites reaching `acceptTrackedRide`: the tray
    // action never goes through `handleAcceptRide`. Covering only one would leave the other
    // ringing a tray entry for a ride already taken — the exact report.
    expect(functionBody('const handleAcceptRide = async')).toContain('dismissOfferNotification');
    expect(functionBody('const takeAction = async')).toContain('dismissOfferNotification');
  });

  it('does it when the driver refuses', () => {
    expect(functionBody('const handleDeclineRide = async')).toContain(
      'dismissOfferNotification',
    );
  });

  it('retires it before the answer is sent, so the shade does not lag the card', () => {
    // Same ordering as the ring stop beside it, and for the same reason: the driver has replied,
    // and waiting for the round-trip would leave the entry visible while the card is already gone.
    const accept = functionBody('const handleAcceptRide = async');
    expect(accept.indexOf('dismissOfferNotification')).toBeLessThan(
      accept.indexOf('acceptTrackedRide('),
    );
    const decline = functionBody('const handleDeclineRide = async');
    expect(decline.indexOf('dismissOfferNotification')).toBeLessThan(
      decline.indexOf('respondOffer('),
    );
  });

  it('sweeps by payload rather than by a predicted identifier', () => {
    // `ride-offer-<rideId>` is only the identifier on the path where the app draws the
    // notification itself. The fallback entry is posted by Expo's delegate or by the system, and
    // its identifier is not ours to predict — a dismissal addressed by that name would hit
    // nothing and report no error.
    const sweep = readSource('src/lib/notifications/offerNotification.ts');
    expect(sweep).toContain('getPresentedNotificationsAsync');
    expect(sweep).toContain('dismissNotificationAsync(notification.request.identifier)');
  });
});
