import {
  resolveOfferOpenOutcome,
  toOfferOpenFetch,
  type DriverOfferState,
  type OfferOpenContext,
  type OfferOpenFetch,
} from '../utils/offerOpenOutcome';
import { OFFER_NOTICE_COPY } from '../offerNoticeCopy';
import type { Ride } from '../stores/driverStore';
import fr from '../../i18n/locales/fr.json';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';

const NOW = Date.parse('2026-09-16T12:00:00Z');

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 'ride-1',
    user_id: 'client-1',
    driver_id: undefined,
    status: 'pending',
    pickup_address: '1 Rue de Rivoli, Paris',
    pickup_lat: 48.8566,
    pickup_lon: 2.3522,
    dropoff_address: 'CDG Terminal 2',
    dropoff_lat: 49.0097,
    dropoff_lon: 2.5479,
    pickup_time: '2026-09-16T12:30:00Z',
    distance: 12000,
    duration: 1500,
    vehicle_type: 'STANDARD',
    estimated_price: 42.5,
    final_price: null,
    created_at: '2026-09-16T11:00:00Z',
    updated_at: '2026-09-16T11:00:00Z',
    matching_deadline_at: '2026-09-16T13:30:00Z',
    matching_paused_at: null,
    ...overrides,
  };
}

const LIVE_OFFER: DriverOfferState = {
  status: 'offered',
  waveN: 1,
  offeredAt: '2026-09-16T11:59:30Z',
  expiresAt: '2026-09-16T12:01:00Z',
  respondedAt: null,
  alive: true,
};

function ready(
  offerOverrides: Partial<DriverOfferState> = {},
  rideOverrides: Partial<Ride> = {},
): OfferOpenFetch {
  return {
    ok: true,
    ride: ride(rideOverrides),
    offer: { ...LIVE_OFFER, ...offerOverrides },
  };
}

const ACTIVE_DRIVER: OfferOpenContext = {
  driverStatus: 'active',
  activeRideId: null,
  isOnline: true,
  myDriverId: 'driver-1',
  nowMs: NOW,
};

describe('resolveOfferOpenOutcome', () => {
  it('opens the overlay for a live offer on an active driver', () => {
    const outcome = resolveOfferOpenOutcome(ready(), ACTIVE_DRIVER);
    expect(outcome.kind).toBe('overlay');
  });

  it('opens the overlay for an offline driver — going online is the accept', () => {
    const outcome = resolveOfferOpenOutcome(ready(), {
      ...ACTIVE_DRIVER,
      isOnline: false,
    });
    expect(outcome.kind).toBe('overlay');
  });

  it('explains an expired offer instead of failing silently', () => {
    const outcome = resolveOfferOpenOutcome(
      ready({ alive: false, expiresAt: '2026-09-16T11:00:00Z' }),
      ACTIVE_DRIVER,
    );
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'offer_expired' },
    });
  });

  it('reports a ride taken by another driver', () => {
    const outcome = resolveOfferOpenOutcome(
      ready({}, { driver_id: 'driver-2' }),
      ACTIVE_DRIVER,
    );
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'ride_taken' },
    });
  });

  it('reports an offer already claimed elsewhere', () => {
    const outcome = resolveOfferOpenOutcome(
      ready({ status: 'expired_taken', alive: false }),
      ACTIVE_DRIVER,
    );
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'ride_taken' },
    });
  });

  it('reports a ride the driver already accepted', () => {
    const outcome = resolveOfferOpenOutcome(
      ready({ status: 'accepted' }, { driver_id: 'driver-1' }),
      ACTIVE_DRIVER,
    );
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'already_accepted' },
    });
  });

  it('reports an offer the driver declined', () => {
    const outcome = resolveOfferOpenOutcome(
      ready({ status: 'declined', alive: false }),
      ACTIVE_DRIVER,
    );
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'offer_declined' },
    });
  });

  it('reports matching that has closed while the offer badge was still alive', () => {
    const outcome = resolveOfferOpenOutcome(
      ready({}, { status: 'completed' }),
      ACTIVE_DRIVER,
    );
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'matching_closed' },
    });
  });

  it('reports a paused search', () => {
    const outcome = resolveOfferOpenOutcome(
      ready({}, { matching_paused_at: '2026-09-16T11:45:00Z' }),
      ACTIVE_DRIVER,
    );
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'matching_closed' },
    });
  });

  it('blocks acceptance when the dossier is not active', () => {
    const outcome = resolveOfferOpenOutcome(ready(), {
      ...ACTIVE_DRIVER,
      driverStatus: 'suspended',
    });
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'dossier_inactive' },
    });
  });

  it('reports an in-progress ride as the blocker', () => {
    const outcome = resolveOfferOpenOutcome(ready(), {
      ...ACTIVE_DRIVER,
      activeRideId: 'ride-0',
    });
    expect(outcome).toMatchObject({
      kind: 'notice',
      notice: { reason: 'already_on_ride' },
    });
  });

  it('distinguishes a network failure from a refusal', () => {
    expect(
      resolveOfferOpenOutcome({ ok: false, reason: 'network' }, ACTIVE_DRIVER),
    ).toMatchObject({ notice: { reason: 'unreachable' } });
    expect(
      resolveOfferOpenOutcome({ ok: false, reason: 'no_offer' }, ACTIVE_DRIVER),
    ).toMatchObject({ notice: { reason: 'not_available' } });
  });

  it('carries the ride on notices so the copy can name it', () => {
    const outcome = resolveOfferOpenOutcome(
      ready({ alive: false }),
      ACTIVE_DRIVER,
    );
    expect(outcome.kind === 'notice' && outcome.notice.ride?.id).toBe('ride-1');
  });
});

describe('toOfferOpenFetch', () => {
  it('normalises the rpc payload including snake_case offer fields', () => {
    const result = toOfferOpenFetch({
      success: true,
      ride: { id: 'ride-1', status: 'pending' },
      offer: {
        status: 'offered',
        wave_n: 3,
        offered_at: '2026-09-16T11:59:00Z',
        expires_at: '2026-09-16T12:00:30Z',
        responded_at: null,
        alive: true,
      },
    });

    expect(result).toEqual({
      ok: true,
      ride: expect.objectContaining({ id: 'ride-1' }),
      offer: {
        status: 'offered',
        waveN: 3,
        offeredAt: '2026-09-16T11:59:00Z',
        expiresAt: '2026-09-16T12:00:30Z',
        respondedAt: null,
        alive: true,
      },
    });
  });

  it('treats anything that is not an explicit success as a failure', () => {
    expect(toOfferOpenFetch({ success: false, reason: 'no_offer' })).toEqual({
      ok: false,
      reason: 'no_offer',
    });
    expect(toOfferOpenFetch(null)).toEqual({
      ok: false,
      reason: 'request_failed',
    });
    expect(toOfferOpenFetch({ success: true })).toEqual({
      ok: false,
      reason: 'request_failed',
    });
  });
});

function resolveKey(locale: Record<string, unknown>, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      locale,
    );
}

const LOCALES: Array<[string, Record<string, unknown>]> = [
  ['fr', fr as Record<string, unknown>],
  ['en', en as Record<string, unknown>],
  ['es', es as Record<string, unknown>],
];

/** Fails with the offending locale + key in the diff, and rejects blanks. */
function expectTranslated(
  localeName: string,
  locale: Record<string, unknown>,
  key: string,
): void {
  expect({
    key: `${localeName}:${key}`,
    value: resolveKey(locale, key),
  }).toEqual({
    key: `${localeName}:${key}`,
    value: expect.stringMatching(/\S/),
  });
}

describe('offer notice copy', () => {
  it('has a title, a body and a dismiss label for every reason', () => {
    for (const copy of Object.values(OFFER_NOTICE_COPY)) {
      for (const [name, locale] of LOCALES) {
        expectTranslated(name, locale, copy.titleKey);
        expectTranslated(name, locale, copy.bodyKey);
      }
    }
  });

  it('translates every call to action it offers', () => {
    for (const copy of Object.values(OFFER_NOTICE_COPY)) {
      if (!copy.cta) continue;
      for (const [name, locale] of LOCALES) {
        expectTranslated(name, locale, copy.cta.labelKey);
      }
    }
  });

  it('translates the shared dismiss label', () => {
    for (const [name, locale] of LOCALES) {
      expectTranslated(name, locale, 'ride.offerNotice.dismiss');
    }
  });
});
