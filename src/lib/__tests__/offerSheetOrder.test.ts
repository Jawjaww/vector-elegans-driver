// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import {
  offerSetToken,
  resolveBottomSheetAllowedSnaps,
  resolveDriverHomeSnapLevel,
  shouldResettleSheet,
  visibleProvisionalOffer,
  type SheetSettleState,
} from '../utils/homeSheetSnap';
import type { ProvisionalOffer } from '../stores/driverStore';

const REPO_ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

const provisional: ProvisionalOffer = {
  rideId: 'ride-1',
  pickupAddress: '12 rue Oberkampf',
  dropoffAddress: 'CDG 2E',
  priceLabel: '38,50 €',
};

const BASE = {
  activeRide: null,
  hasPresentableOffer: false,
  availableRide: null,
  offerableDeferredCount: 0,
  hasNotices: false,
};

describe('the sheet never covers an offer that is on screen', () => {
  // The regression this file exists for: a dossier banner outranked a live offer, so the card
  // sat behind the sheet at `notices` (~160 px). The fix is purely the order of two tests.
  it('collapses for a presentable offer even when a notice is waiting', () => {
    expect(
      resolveDriverHomeSnapLevel({
        ...BASE,
        hasPresentableOffer: true,
        hasNotices: true,
      }),
    ).toBe('nav');
  });

  it('collapses for a provisional card, which is a presentable offer too', () => {
    // A provisional card is painted from the wake payload before the deck loads; the sheet
    // cannot wait for the deck, or the card would be covered for exactly the window it exists
    // to fill.
    expect(
      resolveDriverHomeSnapLevel({
        ...BASE,
        hasPresentableOffer: true,
        availableRide: null,
        hasNotices: true,
      }),
    ).toBe('nav');
  });

  // The other half of the fix, and the one that is easy to lose: `hasPresentableOffer` is the
  // *display* gate's answer, not a raw count. An offer the driver may not be shown — inactive
  // dossier, ride already in progress — must leave the banner that explains it visible.
  it('leaves the notices visible when the offer may not be displayed', () => {
    expect(
      resolveDriverHomeSnapLevel({
        ...BASE,
        hasPresentableOffer: false,
        hasNotices: true,
      }),
    ).toBe('notices');
  });

  it('still lets an ongoing trip outrank every offer', () => {
    expect(
      resolveDriverHomeSnapLevel({
        ...BASE,
        activeRide: { status: 'in-progress' },
        hasPresentableOffer: true,
        hasNotices: true,
      }),
    ).toBe('nav');
  });

  it('shows the trip sheet once the driver is waiting at pickup', () => {
    expect(
      resolveDriverHomeSnapLevel({
        ...BASE,
        activeRide: { status: 'scheduled', driver_arrived_at: '2026-09-23T17:00:00Z' },
      }),
    ).toBe('trip');
  });

  it('falls back to the deferred stack, then to peek', () => {
    expect(
      resolveDriverHomeSnapLevel({ ...BASE, offerableDeferredCount: 2 }),
    ).toBe('rides');
    expect(resolveDriverHomeSnapLevel({ ...BASE, availableRide: {} })).toBe(
      'rides',
    );
    expect(resolveDriverHomeSnapLevel(BASE)).toBe('peek');
  });
});

describe('the default palier is always one the sheet is allowed to settle on', () => {
  // A default that is absent from the allowed set is silently replaced by the first allowed
  // one, so the two functions drifting apart makes the default a request the sheet ignores.
  // Swept rather than spot-checked: the pairs are what matter, not any single value.
  const situations = [
    { activeRide: { status: 'in-progress' }, hasPresentableOffer: false, hasNotices: false },
    { activeRide: null, hasPresentableOffer: true, hasNotices: true },
    { activeRide: null, hasPresentableOffer: false, hasNotices: true },
    { activeRide: null, hasPresentableOffer: false, hasNotices: false },
  ];

  for (const situation of situations) {
    it(`keeps them paired for ${JSON.stringify(situation)}`, () => {
      const snapLevel = resolveDriverHomeSnapLevel({
        ...BASE,
        ...situation,
      });
      const allowed = resolveBottomSheetAllowedSnaps(
        situation.activeRide,
        situation.hasPresentableOffer,
        situation.hasNotices,
      );
      expect(allowed).toContain(snapLevel);
    });
  }

  it('drops the notices palier only when there is nothing to read there', () => {
    expect(resolveBottomSheetAllowedSnaps(null, true, false)).not.toContain(
      'notices',
    );
    expect(resolveBottomSheetAllowedSnaps(null, true, true)).toContain(
      'notices',
    );
  });
});

describe('the provisional card yields to the real one, on the ride', () => {
  it('yields only when the deck holds that same ride', () => {
    expect(visibleProvisionalOffer(provisional, ['other-ride'])).toEqual(
      provisional,
    );
    expect(visibleProvisionalOffer(provisional, [provisional.rideId])).toBeNull();
  });

  it('has nothing to show without a payload', () => {
    expect(visibleProvisionalOffer(null, ['ride-1'])).toBeNull();
  });
});

describe('offerSetToken: a reorder must not move the sheet, an arrival must', () => {
  it('ignores the order and the duplicates', () => {
    // Swiping the stack cycles `availableRides`. An order-sensitive key would fling the sheet
    // back down on every swipe, which is worse than the bug being fixed.
    expect(offerSetToken(['a', 'b', 'c'], null)).toBe(
      offerSetToken(['c', 'a', 'b'], null),
    );
    expect(offerSetToken(['a', 'a'], null)).toBe(offerSetToken(['a'], null));
  });

  it('changes when an offer arrives or leaves', () => {
    expect(offerSetToken(['a'], null)).not.toBe(offerSetToken(['a', 'b'], null));
    expect(offerSetToken(['a', 'b'], null)).not.toBe(offerSetToken(['a'], null));
  });

  it('does not move when the provisional card is replaced by the real one', () => {
    // The handover must be invisible: same ride, so the sheet has no reason to re-settle a
    // second time for one offer.
    expect(offerSetToken(['ride-1'], provisional)).toBe(
      offerSetToken([], provisional),
    );
  });

  it('changes when only the provisional card arrives', () => {
    expect(offerSetToken([], null)).not.toBe(offerSetToken([], provisional));
  });

  it('is stable for an empty deck', () => {
    expect(offerSetToken([], null)).toBe('');
  });
});

describe('BottomSheet re-settles when the token changes, not when the palier does', () => {
  const settle = (over: Partial<SheetSettleState>): SheetSettleState => ({
    token: 'a',
    snapsKey: 'nav,rides',
    snap: 'nav',
    ...over,
  });

  // The regression: a sheet the driver had dragged up stayed up when the next offer arrived.
  // Same palier before and after, so anything that compares paliers answers "no change" about a
  // sheet that is no longer where the app put it.
  it('re-settles on a new offer even when the palier is unchanged', () => {
    expect(
      shouldResettleSheet(
        settle({ token: 'a', snap: 'nav' }),
        settle({ token: 'b', snap: 'nav' }),
      ),
    ).toBe(true);
  });

  it('re-settles when the palier changes', () => {
    expect(
      shouldResettleSheet(settle({ snap: 'nav' }), settle({ snap: 'notices' })),
    ).toBe(true);
  });

  it('re-settles when the allowed set changes', () => {
    expect(
      shouldResettleSheet(
        settle({ snapsKey: 'nav,rides' }),
        settle({ snapsKey: 'nav,notices,trip' }),
      ),
    ).toBe(true);
  });

  it('does nothing when nothing changed', () => {
    expect(shouldResettleSheet(settle({}), settle({}))).toBe(false);
  });

  it('does not move for a token that merely repeats', () => {
    // `undefined` is a legitimate token (a dashboard with no offer); it must not read as a
    // change just because the prop was absent before.
    expect(shouldResettleSheet(settle({ token: undefined }), settle({ token: undefined }))).toBe(
      false,
    );
  });

  it('is the decision the component actually applies', () => {
    const sheet = readSource(join('src', 'components', 'BottomSheet.tsx'));
    expect(sheet).toContain('if (!shouldResettleSheet(previous, next)) return;');
    // The three triggers are read into one comparable state, so no single one of them can be
    // quietly dropped from the decision.
    expect(sheet).toContain('token: collapseToken,');
    expect(sheet).toContain("snapsKey: allowedOrder.join(','),");
    expect(sheet).toContain('snap: effectiveSnap,');
  });
});

describe('the dashboard feeds the token and the shared predicate', () => {
  const dashboard = readSource(join('app', '(tabs)', 'index.tsx'));

  it('passes the offered-ride set to the sheet', () => {
    expect(dashboard).toContain('offerSetToken(deckOfferIds, visibleProvisional)');
    expect(dashboard).toContain('collapseToken={offerToken}');
  });

  it('collapses on the display gate, not on a raw count', () => {
    expect(dashboard).toContain('hasPresentableOffer: offerCardVisible');
    expect(dashboard).toContain('resolveBottomSheetAllowedSnaps(');
    expect(dashboard).not.toContain('availableRidesCount:');
  });
});
