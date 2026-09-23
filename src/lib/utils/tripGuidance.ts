/**
 * What the driver is meant to be doing, right now.
 *
 * The trip already carried everything except this: a status, two addresses, and a button. Read
 * off a log, the dashboard showed a ride in `scheduled` with the home sheet settled on `nav` —
 * 14 px of body — for the whole drive to the pickup. The instruction existed as the sheet's
 * first row and was below the fold the entire time, which on the phone reads exactly like the
 * instruction was never written.
 *
 * Kept pure and separate from the sheet for that reason: the stage decides *what* is said, and
 * the layout decides where — and it was the second that hid the first.
 *
 * Three stages, because the driver has three different jobs and one of them is waiting:
 *
 * - `to_pickup`  — drive to the customer. The address is the whole point.
 * - `at_pickup`  — be reachable. The customer has been told the driver is there.
 * - `to_dropoff` — drive the customer. The destination is the whole point.
 */
export type TripStage = 'to_pickup' | 'at_pickup' | 'to_dropoff';

/**
 * The stage for a ride, or `null` when there is no instruction to give.
 *
 * Derived from `status` plus `driver_arrived_at` rather than from a status of its own: arrival
 * is a fact the driver records mid-`scheduled`, not a transition out of it, so `arrived` is the
 * only thing that separates the two halves of that status. `in-progress` is the second half of
 * the trip and needs no flag.
 *
 * Any other status — `pending`, a cancellation, a completion — has no instruction, and returning
 * one there would put a stale instruction on screen for a ride that is over.
 */
export function resolveTripStage(
  status: string | null | undefined,
  arrived: boolean,
): TripStage | null {
  if (status === 'scheduled') return arrived ? 'at_pickup' : 'to_pickup';
  if (status === 'in-progress') return 'to_dropoff';
  return null;
}

/**
 * The address the instruction is about, or `null` when the stage names its own place.
 *
 * `at_pickup` is the only stage whose instruction is complete without an address: the driver is
 * already there, and repeating it would be a second thing to read while parked. The other two
 * are meaningless without one, so a missing address is worth passing through as `null` rather
 * than substituting — a bar that says "head to the pickup" and then nothing is honest about the
 * gap, where a placeholder would hide it.
 */
export function tripGuidanceAddress(
  stage: TripStage,
  addresses: { pickupAddress: string | null; dropoffAddress: string | null },
): string | null {
  if (stage === 'to_pickup') return addresses.pickupAddress;
  if (stage === 'to_dropoff') return addresses.dropoffAddress;
  return null;
}

/** i18n key of the instruction itself. Returned rather than translated: this module holds no
 *  locale, so it stays callable from a test and from a log. */
export function tripGuidanceTitleKey(stage: TripStage): string {
  switch (stage) {
    case 'to_pickup':
      return 'ride.guidance.toPickup';
    case 'at_pickup':
      return 'ride.guidance.atPickup';
    case 'to_dropoff':
      return 'ride.guidance.toDropoff';
  }
}

/** i18n key of the supporting line, or `null` when the stage has none. */
export function tripGuidanceHintKey(stage: TripStage): string | null {
  switch (stage) {
    case 'to_pickup':
      return 'ride.guidance.toPickupHint';
    case 'at_pickup':
      return 'ride.guidance.atPickupHint';
    case 'to_dropoff':
      return 'ride.guidance.toDropoffHint';
  }
}
