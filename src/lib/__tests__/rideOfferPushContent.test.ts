import {
  buildRideOfferPushContent,
  isRideOfferPush,
  rideOfferNotificationId,
} from '../notifications/rideOfferPushContent';

describe('isRideOfferPush', () => {
  it('detects ride_offer type', () => {
    expect(isRideOfferPush({ type: 'ride_offer' })).toBe(true);
  });

  it('detects ride_id-only payloads', () => {
    expect(isRideOfferPush({ ride_id: 'ride-1' })).toBe(true);
  });
});

describe('buildRideOfferPushContent', () => {
  it('formats price, distance and duration from structured data', () => {
    const content = buildRideOfferPushContent(
      {
        type: 'ride_offer',
        ride_id: 'ride-1',
        pickup_address: '12 Rue de Rivoli, Paris',
        dropoff_address: 'CDG Terminal 2',
        estimated_price: 42.5,
        distance: 12.3,
        duration: 28,
        subtitle: '42.50 €',
      },
      { title: 'Remote', body: 'Remote body' },
      { includeSubtitle: true },
    );

    expect(content.title).toBe('Nouvelle course');
    expect(content.body).toBe('42.50 € · 12.3 km · 28 min');
    expect(content.body).not.toContain('📍');
    expect(content.body).not.toContain('🏁');
    expect(content.subtitle).toBe('42.50 €');
  });

  it('prefers server labels over numeric fields', () => {
    const content = buildRideOfferPushContent(
      {
        type: 'ride_offer',
        price_label: '42.50 €',
        distance_label: '12.3 km',
        duration_label: '28 min',
      },
      { title: 'Remote', body: 'Remote body' },
    );

    expect(content.body).toBe('42.50 € · 12.3 km · 28 min');
  });

  it('falls back to remote copy when structured data is absent', () => {
    const content = buildRideOfferPushContent(
      { type: 'ride_offer', ride_id: 'ride-2' },
      { title: 'Nouvelle course', body: 'Gare · 30 € — ouvrez.' },
    );

    expect(content.title).toBe('Nouvelle course');
    expect(content.body).toBe('Gare · 30 € — ouvrez.');
  });
});

describe('rideOfferNotificationId', () => {
  it('uses ride_id when present', () => {
    expect(rideOfferNotificationId({ ride_id: 'abc' })).toBe('ride-offer-abc');
  });
});
