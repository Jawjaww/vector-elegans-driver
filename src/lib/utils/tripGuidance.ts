import { MAP_PALETTE } from '../mapPalette';
import { theme } from '../theme';

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
 * Four stages, because the driver has four different jobs and two of them are waiting:
 *
 * - `to_pickup`  — drive to the customer. The customer's place is the destination of the leg.
 * - `at_pickup`  — be reachable. The customer has been told the driver is there.
 * - `to_dropoff` — drive the customer. The drop-off is the destination of the leg.
 * - `at_dropoff` — let the customer out.
 *
 * The two arrival stages are read from different signals, and that is not an inconsistency. The
 * first is *declared* by the driver — the « Je suis arrivé » swipe, recorded server-side in
 * `driver_arrived_at` — because no sensor can know the customer has been picked up. The second
 * is proximity to the drop-off pin, because the driver's next action there is the swipe that
 * *ends* the ride: an instruction that appeared only once the ride was over would be an
 * instruction nobody could act on. See `DROPOFF_ARRIVAL_METERS`.
 */
export type TripStage = 'to_pickup' | 'at_pickup' | 'to_dropoff' | 'at_dropoff';

/**
 * Whether a loose stage string is one of the four the palette knows.
 *
 * The dashboard hands the map cards a `string | null` — it reads the stage off a ride, where the
 * type is not enforced — so the components that want the stage's colour need to narrow it first.
 * Written as a guard rather than a cast so an unknown stage falls back to the neutral ink instead
 * of indexing the palette with a key that is not there.
 */
export function isTripStage(value: string | null | undefined): value is TripStage {
  return (
    value === 'to_pickup' ||
    value === 'at_pickup' ||
    value === 'to_dropoff' ||
    value === 'at_dropoff'
  );
}

/**
 * Whether the vehicle is standing still and the driver's job is something other than driving.
 *
 * The two arrival stages are the same kind of stage wearing two addresses: nothing left to
 * announce in the way of a route, a distance that reads `0 m` if anyone insists on showing it,
 * and one sentence about what to do with the customer. Everything that treats "there is still
 * ground to cover" as a fact — the next-turn card, the remaining-distance chip, the announcement
 * that withdraws once the driver pulls away — has to ask this instead of re-deriving it from
 * `status`, which is how the two of them came apart in the first place.
 */
export function isParkedStage(stage: TripStage | null): boolean {
  return stage === 'at_pickup' || stage === 'at_dropoff';
}

/**
 * How close to the drop-off pin counts as arrived, in metres.
 *
 * The last fix a parked car contributes is itself within `GPS_STORE_MIN_METERS` (8 m) of where it
 * stopped, so the *floor* of this number is tiny; the budget is spent on everything the pin does
 * not know. A drop-off pin routinely sits mid-block, on the far side of a dual carriageway, or at
 * the barrier of a car park whose access is the next street over — 150 m is the scale at which the
 * driver is close enough to be told to drop off and still able to pick where to stop.
 *
 * It cannot fire at speed ahead of the destination, which is the failure mode of a loose
 * threshold: 150 m of urban approach is about ten seconds, which is the reading time the sentence
 * wants anyway.
 *
 * One consequence, taken knowingly: a ride whose destination sits *inside* this radius starts its
 * `in-progress` leg already in the arrival stage, so a hundred-metre hop is announced as one from
 * the first fix. That is not a lie about the geometry — the driver is where they are being told
 * to drop off — and the alternative is a latch remembering that the vehicle once left the pickup,
 * which is a state tracked to make a degenerate ride read better.
 */
export const DROPOFF_ARRIVAL_METERS = 150;

/**
 * Whether the latest fix is inside the drop-off radius.
 *
 * `null` — no fix yet, or a ride without coordinates — is *not* arrival. Defaulting to `true`
 * there would announce the drop-off to every driver whose ride was created without a geocoded
 * destination, which is the one case where the driver could not act on it.
 */
export function isWithinDropoffRadius(
  metersToDropoff: number | null,
): boolean {
  return (
    metersToDropoff !== null &&
    Number.isFinite(metersToDropoff) &&
    metersToDropoff <= DROPOFF_ARRIVAL_METERS
  );
}

/**
 * The stage for a ride, or `null` when there is no instruction to give.
 *
 * Derived from `status` plus `driver_arrived_at` rather than from a status of its own: arrival
 * is a fact the driver records mid-`scheduled`, not a transition out of it, so `arrived` is the
 * only thing that separates the two halves of that status. `in-progress` is the second half of
 * the trip and needs no flag of its own — except for its own arrival, which `reachedDropoff`
 * carries: the drop-off is a place, and the ride says nothing about whether the vehicle is on it.
 *
 * Any other status — `pending`, a cancellation, a completion — has no instruction, and returning
 * one there would put a stale instruction on screen for a ride that is over.
 */
export function resolveTripStage(
  status: string | null | undefined,
  arrived: boolean,
  reachedDropoff = false,
): TripStage | null {
  if (status === 'scheduled') return arrived ? 'at_pickup' : 'to_pickup';
  if (status === 'in-progress') return reachedDropoff ? 'at_dropoff' : 'to_dropoff';
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
    case 'at_dropoff':
      return 'ride.guidance.atDropoff';
  }
}

/** Feather glyph names the bar draws. Narrowed here so a typo is a type error, not a blank. */
export type TripGuidanceIcon = 'navigation' | 'user-check' | 'flag' | 'map-pin';

/** amber-700 — the dark step of `theme.colors.warning`, as `*Edge` is for the map's two. */
const WAIT_INK = '#b45309';

/**
 * How each stage is coloured and drawn.
 *
 * Pickup and dropoff borrow `MAP_PALETTE`, so the instruction carries the same colour as the
 * marker it points at — a blue bar naming the blue departure pin. Waiting at the pickup has no
 * marker of its own and nothing to drive to, so it takes the warning amber, which is the one
 * glance-readable way to say "this stage is a wait, not a route".
 *
 * `at_dropoff` deliberately shares `to_dropoff`'s green rather than inventing a fourth colour.
 * It is not a fourth place: it is the same pin, reached, and a driver reading the bar while
 * stopping has to recognise the destination at a glance — two different greens for "driving to
 * the destination" and "you are at the destination" would make the one that matters least
 * readable. What separates them is the glyph: an arrow-flag for the leg, a pin for the spot.
 *
 * Two colours rather than one, because the bar is drawn on a pale face. `color` is the marker's
 * own colour, used where it is reduced before it lands — the chip is that colour at a fraction
 * of its alpha, and a tint reads correctly at any value. `ink` is the same hue several steps
 * down, and it is what the glyph itself is drawn in: amber at full strength on a pale pane sits
 * under 2:1 contrast, which is a glyph the driver has to hunt for. `departureEdge` and
 * `arrivalEdge` already exist as the map's marker outlines, so only the amber needed a partner.
 */
export function tripGuidanceAccent(stage: TripStage): {
  color: string;
  ink: string;
  icon: TripGuidanceIcon;
} {
  switch (stage) {
    case 'to_pickup':
      return {
        color: MAP_PALETTE.departure,
        ink: MAP_PALETTE.departureEdge,
        icon: 'navigation',
      };
    case 'at_pickup':
      return { color: theme.colors.warning, ink: WAIT_INK, icon: 'user-check' };
    case 'to_dropoff':
      return {
        color: MAP_PALETTE.arrival,
        ink: MAP_PALETTE.arrivalEdge,
        icon: 'flag',
      };
    case 'at_dropoff':
      return {
        color: MAP_PALETTE.arrival,
        ink: MAP_PALETTE.arrivalEdge,
        icon: 'map-pin',
      };
  }
}
