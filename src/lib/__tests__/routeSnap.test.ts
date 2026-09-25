import { bearingDegrees, snapToNavLine } from '../utils/routeSnap';

describe('snapToNavLine', () => {
  it('drops the GPS onto the segment and faces further along it', () => {
    const line: [number, number][] = [
      [2.3, 48.84],
      [2.302, 48.84],
      [2.304, 48.84],
    ];
    const snap = snapToNavLine([2.301, 48.8404], line, 60);
    expect(snap).not.toBeNull();
    expect(snap!.point[1]).toBeCloseTo(48.84, 4);
    expect(snap!.traveledMeters).toBeGreaterThan(50);
    expect(snap!.traveledMeters).toBeLessThan(200);
    const bearing = snap!.bearing;
    expect(bearing).toBeGreaterThan(70);
    expect(bearing).toBeLessThan(110);
    expect(bearingDegrees(line[0], line[1])).toBeGreaterThan(70);
    const source = snapToNavLine.toString();
    expect(source).toContain('haversineMeters');
    expect(source).not.toContain('LngLat');
  });
});
