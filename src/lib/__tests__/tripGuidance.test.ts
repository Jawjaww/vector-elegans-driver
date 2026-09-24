import {
  resolveTripStage,
  tripGuidanceTitleKey,
  type TripStage,
} from '../utils/tripGuidance';

/**
 * The instruction the driver reads, at each stage of the trip.
 *
 * This module exists because the instruction was already written — as the first row of the trip
 * sheet — and the sheet rests at `nav` while a ride is being driven, which leaves 14 px of body.
 * The sentence was on screen the whole time and below the fold the whole time, and the two are
 * indistinguishable from the driver's seat. What went wrong was placement, so what is pinned
 * here is the *decision* that placement now depends on.
 */
describe('the stage of the trip the driver is in', () => {
  it('splits `scheduled` on arrival, which is the only thing that separates its two halves', () => {
    // Arrival is recorded *inside* `scheduled` rather than as a transition out of it, so a
    // mapping that keyed on status alone would tell a parked driver to drive to the pickup.
    expect(resolveTripStage('scheduled', false)).toBe('to_pickup');
    expect(resolveTripStage('scheduled', true)).toBe('at_pickup');
    expect(resolveTripStage('in-progress', true)).toBe('to_dropoff');
  });

  it('says nothing for a ride that is over, or not yet taken', () => {
    // A stale instruction is worse than none: `completed` and every cancellation must leave
    // the driver with no bar rather than one naming a place he is no longer going.
    for (const status of [
      'pending',
      'completed',
      'client-canceled',
      'driver-canceled',
      'admin-canceled',
      'no-show',
      'delayed',
    ]) {
      expect(resolveTripStage(status, false)).toBeNull();
      expect(resolveTripStage(status, true)).toBeNull();
    }
    expect(resolveTripStage(null, false)).toBeNull();
    expect(resolveTripStage(undefined, false)).toBeNull();
  });

  it('has one title per stage, and no supporting line under it', () => {
    // The bar used to carry a second line — the address, falling back to a hint — and that line
    // is gone by decision: the map already pins the place the sentence names, and the half of the
    // row the address occupied was the half the sentence needed. What is pinned here is that
    // every stage still says something, and that no two stages say the same thing.
    const stages: TripStage[] = ['to_pickup', 'at_pickup', 'to_dropoff'];
    for (const stage of stages) {
      expect(tripGuidanceTitleKey(stage)).toMatch(/^ride\.guidance\./);
    }
    // Distinct titles: three stages that read the same are one instruction, and the driver
    // would have no way to tell which half of the trip he is in.
    expect(new Set(stages.map(tripGuidanceTitleKey)).size).toBe(stages.length);
  });
});
