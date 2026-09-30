import {
  ARRIVAL_CHIP_DISTANCE_CAPTION,
  ARRIVAL_CHIP_ETA_CAPTION,
  formatArrivalClock,
  formatRemainingDistance,
  maneuverActionPhrase,
  maneuverBannerParts,
  maneuverToFeatherIcon,
  nextManeuverAlongTrack,
  optimisticEtaMinutes,
  steppedManeuverDistance,
  tripStageBannerParts,
  type OsrmStepLike,
} from '../utils/navProgress';

describe('navProgress', () => {
  it('optimisticEtaMinutes applies 0.85 factor', () => {
    // 600s * 0.85 = 510s → 9 min
    expect(optimisticEtaMinutes(600, 5000)).toBe(9);
  });

  it('optimisticEtaMinutes floors at 1 min when far enough', () => {
    expect(optimisticEtaMinutes(10, 200)).toBe(1);
    expect(optimisticEtaMinutes(0, 50)).toBe(0);
  });

  it('formatRemainingDistance switches units', () => {
    expect(formatRemainingDistance(850)).toBe('850 m');
    expect(formatRemainingDistance(1500)).toBe('1.5 km');
  });

  it('steppedManeuverDistance only moves at the announcement steps', () => {
    // A 3 m change at 500 m must not rewrite the sentence; crossing 100 m must.
    expect(steppedManeuverDistance(348)).toBe(350);
    expect(steppedManeuverDistance(345)).toBe(350);
    expect(steppedManeuverDistance(2320)).toBe(2300);
    expect(steppedManeuverDistance(104)).toBe(100);
    expect(steppedManeuverDistance(96)).toBe(100);
    expect(steppedManeuverDistance(24)).toBe(20);
    expect(steppedManeuverDistance(17)).toBe(15);
    expect(steppedManeuverDistance(null)).toBeNull();
  });

  it('tripStageBannerParts still names the target with no maneuver', () => {
    // Non-vacuity for the HUD gate: with no step from the router this is the only line the
    // driver gets, and it must not be empty.
    expect(tripStageBannerParts('to_pickup', 1200)).toEqual({
      action: 'Rejoindre le point de prise en charge',
      distance: '1.2 km',
    });
    expect(tripStageBannerParts('to_dropoff', 348)).toEqual({
      action: 'Rejoindre la destination',
      distance: '350 m',
    });
    expect(tripStageBannerParts('to_pickup', null)).toEqual({
      action: 'Rejoindre le point de prise en charge',
      distance: null,
    });
    // An unknown stage is the pickup leg rather than an empty card.
    expect(tripStageBannerParts(null, 0).action).toBe(
      'Rejoindre le point de prise en charge',
    );
  });

  it('formatArrivalClock adds eta minutes to local clock', () => {
    const now = new Date(2026, 7, 25, 14, 5, 0); // local 14:05
    expect(formatArrivalClock(9, now)).toBe('14:14');
    expect(formatArrivalClock(0, now)).toBe('14:05');
  });

  it('names each figure of the arrival chip', () => {
    // The chip read `5,8 km · 14h25`, and the report was that neither number could be read: "you
    // cannot tell that it means 5.8 km from the arrival point and that you get there at 14:25".
    // Two bare figures with a dot between them look like the same kind of thing. Copy, not
    // styling — so it is asserted like the rest of the driver-facing lines here.
    expect(ARRIVAL_CHIP_DISTANCE_CAPTION).toBe('restant');
    expect(ARRIVAL_CHIP_ETA_CAPTION).toBe('arrivée');
  });

  it('maneuverToFeatherIcon maps turns', () => {
    expect(maneuverToFeatherIcon('turn', 'left')).toBe('corner-up-left');
    expect(maneuverToFeatherIcon('turn', 'right')).toBe('corner-up-right');
    expect(maneuverToFeatherIcon('continue', 'straight')).toBe('arrow-up');
    expect(maneuverToFeatherIcon('arrive')).toBe('flag');
  });

  it('maneuverBannerParts is a spoken French instruction, split where it is read', () => {
    expect(maneuverBannerParts('turn', 'right', 60)).toEqual({
      action: 'Tourner à droite',
      distance: 'dans 60 m',
    });
    expect(maneuverBannerParts('turn', 'slight left', 200)).toEqual({
      action: 'Tourner légèrement à gauche',
      distance: 'dans 200 m',
    });
    expect(maneuverActionPhrase('continue', 'straight')).toBe(
      'Continuer tout droit',
    );
    // Arrival is not something to be "in 12 m": the action is the whole sentence.
    expect(maneuverBannerParts('arrive', undefined, 12)).toEqual({
      action: 'Vous êtes arrivé',
      distance: null,
    });
    expect(maneuverBannerParts('roundabout', undefined, 80, 2)).toEqual({
      action: 'Prendre la 2e sortie',
      distance: 'dans 80 m',
    });
    expect(maneuverBannerParts('roundabout', undefined, 40, 1)).toEqual({
      action: 'Prendre la 1re sortie',
      distance: 'dans 40 m',
    });
    expect(maneuverBannerParts('rotary', undefined, 30)).toEqual({
      action: 'Rond-point',
      distance: 'dans 30 m',
    });
    // A spent distance is not announced as zero: the action carries the card alone.
    expect(maneuverBannerParts('turn', 'right', 0).distance).toBeNull();
  });

  const steps: OsrmStepLike[] = [
    { distance: 100, name: 'Rue A', maneuver: { type: 'depart' } },
    {
      distance: 80,
      name: 'Rue B',
      maneuver: { type: 'turn', modifier: 'right' },
    },
    {
      distance: 20,
      name: 'Rue C',
      maneuver: { type: 'turn', modifier: 'left' },
    },
    { distance: 0, name: 'Arrivée', maneuver: { type: 'arrive' } },
  ];

  it('names the turn still ahead along the route', () => {
    const next = nextManeuverAlongTrack(steps, 40);
    expect(next).toMatchObject({
      type: 'turn',
      modifier: 'right',
      distanceMeters: 60,
      name: 'Rue B',
    });
  });

  it('skips a turn already passed, including one only a few metres back', () => {
    const passed = nextManeuverAlongTrack(steps, 110);
    expect(passed).toMatchObject({
      modifier: 'left',
      distanceMeters: 70,
      name: 'Rue C',
    });
    const close = nextManeuverAlongTrack(steps, 175);
    expect(close).toMatchObject({
      modifier: 'left',
      distanceMeters: 5,
      name: 'Rue C',
    });
  });

  it('reports arrival from the remaining along-track distance', () => {
    expect(nextManeuverAlongTrack(steps, 190)).toMatchObject({
      type: 'arrive',
      distanceMeters: 10,
    });
    expect(nextManeuverAlongTrack(steps, 250)).toMatchObject({
      type: 'arrive',
      distanceMeters: 0,
    });
    expect(nextManeuverAlongTrack([], 0)).toBeNull();
  });
});
