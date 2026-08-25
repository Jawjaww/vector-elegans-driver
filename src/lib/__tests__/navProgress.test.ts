import {
  formatArrivalClock,
  formatRemainingDistance,
  maneuverInstructionLabel,
  maneuverToFeatherIcon,
  optimisticEtaMinutes,
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

  it('maneuverInstructionLabel is French', () => {
    expect(maneuverInstructionLabel('turn', 'left')).toBe('À gauche');
    expect(maneuverInstructionLabel('arrive')).toBe('Arrivée');
  });
});
