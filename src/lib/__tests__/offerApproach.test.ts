import { seedOfferApproach } from '../utils/offerApproach';

describe('seedOfferApproach', () => {
  const first = { lat: 48.78123, lng: 1.95887 };
  const laterTick = { lat: 48.78201, lng: 1.9594 };

  it('seeds from the first GPS fix', () => {
    expect(seedOfferApproach(undefined, undefined)).toBeUndefined();
    expect(seedOfferApproach(undefined, first)).toEqual({
      lat: Math.round(first.lat * 2e3) / 2e3,
      lng: Math.round(first.lng * 2e3) / 2e3,
    });
  });

  it('keeps the first fix when GPS ticks afterwards', () => {
    const seeded = seedOfferApproach(undefined, first);
    expect(seedOfferApproach(seeded, laterTick)).toEqual(seeded);
  });
});
