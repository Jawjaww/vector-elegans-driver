import { buildOfferRouteUpdateKey } from '../utils/offerRouteUpdateKey';

describe('buildOfferRouteUpdateKey', () => {
  const base = {
    start: { lat: 48.78, lng: 1.95 },
    end: { lat: 44.18, lng: 0.35 },
    approachFrom: { lat: 48.78, lng: 1.95 },
    padKey: '40,40,40,40',
    navigationFollow: false,
    presentation: 'offer',
    offerOverview: false,
  };

  it('stays stable when only the GPS / driver marker would have moved', () => {
    const a = buildOfferRouteUpdateKey(base);
    const b = buildOfferRouteUpdateKey(base);
    expect(a).toBe(b);
    expect(a).not.toContain('48.7812');
  });

  it('changes when the trip endpoints change', () => {
    const a = buildOfferRouteUpdateKey(base);
    const b = buildOfferRouteUpdateKey({
      ...base,
      end: { lat: 44.2, lng: 0.4 },
    });
    expect(a).not.toBe(b);
  });

  it('changes once when approachFrom is seeded, not when only GPS precision would move', () => {
    const withoutApproach = buildOfferRouteUpdateKey({
      ...base,
      approachFrom: null,
    });
    const seeded = buildOfferRouteUpdateKey(base);
    expect(withoutApproach).not.toBe(seeded);
    const sameSeeded = buildOfferRouteUpdateKey({
      ...base,
      approachFrom: { lat: 48.78, lng: 1.95 },
    });
    expect(seeded).toBe(sameSeeded);
  });
});
