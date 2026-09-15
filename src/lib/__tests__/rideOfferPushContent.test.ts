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
  it('formats A/B lines and price from structured data', () => {
    const content = buildRideOfferPushContent(
      {
        type: 'ride_offer',
        ride_id: 'ride-1',
        pickup_address: '12 Rue de Rivoli, Paris',
        dropoff_address: 'CDG Terminal 2',
        estimated_price: 42.5,
        subtitle: '42.50 €',
      },
      { title: 'Remote', body: 'Remote body' },
      { includeSubtitle: true },
    );

    expect(content.title).toBe('Nouvelle course');
    expect(content.body).toContain('🔵 A · 12 Rue de Rivoli, Paris');
    expect(content.body).toContain('🟢 B · CDG Terminal 2');
    expect(content.body).toContain('💶 42.50 € · Appuyez pour accepter');
    expect(content.subtitle).toBe('42.50 €');
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
