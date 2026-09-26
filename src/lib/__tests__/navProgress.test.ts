import {
  formatArrivalClock,
  formatRemainingDistance,
  maneuverActionPhrase,
  maneuverBannerLine,
  maneuverToFeatherIcon,
  nextManeuverAlongTrack,
  optimisticEtaMinutes,
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

  it('formatArrivalClock adds eta minutes to local clock', () => {
    const now = new Date(2026, 7, 25, 14, 5, 0); // local 14:05
    expect(formatArrivalClock(9, now)).toBe('14:14');
    expect(formatArrivalClock(0, now)).toBe('14:05');
  });

  it('maneuverToFeatherIcon maps turns', () => {
    expect(maneuverToFeatherIcon('turn', 'left')).toBe('corner-up-left');
    expect(maneuverToFeatherIcon('turn', 'right')).toBe('corner-up-right');
    expect(maneuverToFeatherIcon('continue', 'straight')).toBe('arrow-up');
    expect(maneuverToFeatherIcon('arrive')).toBe('flag');
  });

  it('maneuverBannerLine is a spoken French instruction', () => {
    expect(maneuverBannerLine('turn', 'right', 60)).toBe(
      'Tourner à droite dans 60 m',
    );
    expect(maneuverBannerLine('turn', 'slight left', 200)).toBe(
      'Tourner légèrement à gauche dans 200 m',
    );
    expect(maneuverActionPhrase('continue', 'straight')).toBe(
      'Continuer tout droit',
    );
    expect(maneuverBannerLine('arrive', undefined, 12)).toBe(
      'Vous êtes arrivé',
    );
    expect(maneuverBannerLine('roundabout', undefined, 80, 2)).toBe(
      'Prendre la 2e sortie dans 80 m',
    );
    expect(maneuverBannerLine('roundabout', undefined, 40, 1)).toBe(
      'Prendre la 1re sortie dans 40 m',
    );
    expect(maneuverBannerLine('rotary', undefined, 30)).toBe(
      'Rond-point dans 30 m',
    );
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
