import {
  DROPOFF_ARRIVAL_METERS,
  isParkedStage,
  isTripStage,
  isWithinDropoffRadius,
  resolveTripStage,
  tripGuidanceTitleKey,
  type TripStage,
} from '../utils/tripGuidance';
import fr from '../../i18n/locales/fr.json';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';

/** The four stages, as a list rather than a union: every per-stage rule below walks it. */
const STAGES: TripStage[] = [
  'to_pickup',
  'at_pickup',
  'to_dropoff',
  'at_dropoff',
];

/** Arguments that produce `stage`, so the parked check is derived from the resolver, not a copy. */
function stageArgs(stage: TripStage): Parameters<typeof resolveTripStage> {
  if (stage === 'to_pickup') return ['scheduled', false];
  if (stage === 'at_pickup') return ['scheduled', true];
  if (stage === 'to_dropoff') return ['in-progress', true];
  return ['in-progress', false, true];
}

/** `ride.guidance.atDropoff` → `bundle.ride.guidance.atDropoff`, or the key when it is missing. */
function readLocale(bundle: unknown, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle,
    );
  return typeof value === 'string' ? value : key;
}

/**
 * The instruction the driver reads, at each stage of the trip.
 *
 * This module exists because the instruction was already written — as the first row of the trip
 * sheet — and the sheet rests at `nav` while a ride is being driven, which leaves 14 px of body.
 * The sentence was on screen the whole time and below the fold the whole time, and the two are
 * indistinguishable from the driver's seat. What went wrong was placement, so what is pinned
 * here is the *decision* that placement now depends on.
 *
 * The second half of the same bug is pinned here too, and it is the opposite one: the sentence
 * was written, placed, and then withheld for the whole stage it belonged to. So the four stages
 * are pinned, the two arrival ones are pinned as *parked*, and every sentence is pinned as
 * resolvable in every locale the app ships — a key that resolves to nothing renders as the key.
 */
describe('the stage of the trip the driver is in', () => {
  it('splits `scheduled` on arrival, which is the only thing that separates its two halves', () => {
    // Arrival is recorded *inside* `scheduled` rather than as a transition out of it, so a
    // mapping that keyed on status alone would tell a parked driver to drive to the pickup.
    expect(resolveTripStage('scheduled', false)).toBe('to_pickup');
    expect(resolveTripStage('scheduled', true)).toBe('at_pickup');
    expect(resolveTripStage('in-progress', true)).toBe('to_dropoff');
  });

  it('splits `in-progress` on the drop-off being reached, which no status carries', () => {
    // `mark_driver_arrived` covers the pickup only. At the drop-off the driver's next action is
    // the swipe that *ends* the ride, so the status is still `in-progress` while the vehicle sits
    // at the pin: proximity is the only signal there is, and it is the third argument rather than
    // a field read here.
    expect(resolveTripStage('in-progress', false, true)).toBe('at_dropoff');
    // The pickup half is unaffected by it.
    expect(resolveTripStage('scheduled', false, true)).toBe('to_pickup');
  });

  it('says nothing for a ride that is over, or not yet taken', () => {
    // A stale instruction is worse than none: `completed` and every cancellation must leave
    // the driver with no bar rather than one naming a place he is no longer going. That holds
    // for the drop-off arrival too — a ride that ended at the pin has nothing left to say.
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
      expect(resolveTripStage(status, true, true)).toBeNull();
    }
    expect(resolveTripStage(null, false)).toBeNull();
    expect(resolveTripStage(undefined, false)).toBeNull();
  });

  it('counts arrival only inside the radius, and never without a position', () => {
    expect(isWithinDropoffRadius(DROPOFF_ARRIVAL_METERS - 1)).toBe(true);
    expect(isWithinDropoffRadius(DROPOFF_ARRIVAL_METERS)).toBe(true);
    expect(isWithinDropoffRadius(DROPOFF_ARRIVAL_METERS + 1)).toBe(false);
    // "Unknown" is not "arrived". A ride with no geocoded drop-off, or a device with no fix yet,
    // would otherwise announce the drop-off to every driver at once at the start of every leg.
    expect(isWithinDropoffRadius(null)).toBe(false);
    expect(isWithinDropoffRadius(Number.NaN)).toBe(false);
  });

  it('groups exactly the two arrival stages as parked', () => {
    // `isParkedStage` is what the next-turn card gate, the arrival chip gate and the announcement
    // retraction rule all read, so a stage added later must be a decision, not a default. The list
    // is derived from the resolver rather than restated, so the two cannot drift apart.
    for (const stage of STAGES) {
      expect(isParkedStage(resolveTripStage(...stageArgs(stage)))).toBe(
        stage === 'at_pickup' || stage === 'at_dropoff',
      );
    }
    expect(isParkedStage(null)).toBe(false);
  });

  it('has one title per stage, and no supporting line under it', () => {
    // The bar used to carry a second line — the address, falling back to a hint — and that line
    // is gone by decision: the map already pins the place the sentence names, and the half of the
    // row the address occupied was the half the sentence needed. What is pinned here is that
    // every stage still says something, and that no two stages say the same thing.
    for (const stage of STAGES) {
      expect(tripGuidanceTitleKey(stage)).toMatch(/^ride\.guidance\./);
    }
    // Distinct titles: four stages that read the same are one instruction, and the driver
    // would have no way to tell which half of the trip he is in.
    expect(new Set(STAGES.map(tripGuidanceTitleKey)).size).toBe(STAGES.length);
  });

  it('resolves every sentence in every locale, which is what the driver actually reads', () => {
    // The bug this stands in for: `ride.guidance.atPickup` existed in all three locales and was
    // rendered in none, so the driver was told nothing while waiting. A key that resolves to
    // nothing is quieter and worse — i18next renders the key itself, `ride.guidance.atDropoff`,
    // on the windscreen — which is why the assertion is on the resolved string, not the key.
    for (const stage of STAGES) {
      const key = tripGuidanceTitleKey(stage);
      for (const [locale, bundle] of Object.entries({ fr, en, es })) {
        const sentence = readLocale(bundle, key);
        expect(sentence).not.toBe(key);
        expect(sentence).toMatch(/[a-zà-ÿ]/i);
        if (locale !== 'fr') {
          // Translated, not copied: an English driver reading the French sentence is the same
          // failure as reading a key, one edit further away from being noticed.
          expect(sentence).not.toBe(readLocale(fr, key));
        }
      }
    }
  });
});

describe('the stage strings the dashboard may hand the map cards', () => {
  it('accepts the four stages and nothing else', () => {
    // The dashboard reads the stage off a ride, where the type is not enforced, so the guard is
    // what keeps a new stage from silently falling back to the neutral ink instead of being
    // added to the palette.
    for (const stage of STAGES) expect(isTripStage(stage)).toBe(true);
    expect(isTripStage('to_client')).toBe(false);
    expect(isTripStage('')).toBe(false);
    expect(isTripStage(null)).toBe(false);
    expect(isTripStage(undefined)).toBe(false);
  });
});
