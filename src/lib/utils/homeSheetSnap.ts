import type { SheetSnapLevel } from '../../components/BottomSheet';
import type { ProvisionalOffer } from '../stores/driverStore';

/**
 * Where the home sheet sits, and when it must get out of an offer's way.
 *
 * Extracted from the dashboard for one reason: the rule is a *decision*, and the two bugs it
 * carries were both invisible in a screenshot. An offer card could be painted with the sheet
 * sitting over it (a dossier banner outranked a live offer), and a sheet the driver had dragged
 * up stayed up when a new offer arrived. Neither shows in a render test, and neither is
 * observable at all unless the rule can be called directly.
 */

/**
 * The provisional card, once it has yielded to the real one.
 *
 * A provisional card is a stand-in: it carries the ride id from the notification payload and
 * nothing else — no coordinates, no distance, no approach time. It must therefore disappear the
 * moment the deck actually holds that ride, or it would be a downgrade of the card next to it.
 * Keyed on the ride rather than on the display gate alone: a deck showing some *other* offer is
 * no reason to drop the only thing describing this one.
 *
 * Shared by the overlay that paints it and by the sheet rule below, so "is a card on screen"
 * cannot mean two different things in the same frame.
 */
export function visibleProvisionalOffer(
  provisional: ProvisionalOffer | null,
  deckRideIds: readonly string[],
): ProvisionalOffer | null {
  if (provisional === null) return null;
  return deckRideIds.includes(provisional.rideId) ? null : provisional;
}

/**
 * Identity of the set of rides currently being offered, for the sheet's collapse trigger.
 *
 * Sorted and de-duplicated on purpose, and this is the whole point: swiping the stack cycles
 * `availableRides` without changing *which* rides are offered, so an order-sensitive key would
 * fling the sheet back down every time the driver browsed the cards. A set-based key ignores a
 * reorder and fires only on a genuine arrival or departure.
 *
 * The provisional card joins the set, which also makes the provisional-to-real handover
 * invisible: the ride id is present before and after, so the key is identical and the sheet does
 * not move a second time for the same offer.
 */
export function offerSetToken(
  deckRideIds: readonly string[],
  provisional: ProvisionalOffer | null,
): string {
  const ids = new Set(deckRideIds);
  if (provisional) ids.add(provisional.rideId);
  return [...ids].sort().join('|');
}

/**
 * Snap palier for the driver home, given what is on screen.
 *
 * An offer that is actually painted owns the top of the map: it is a question with a deadline,
 * and the sheet must not be stacked over the card asking it. That test comes **before** the
 * notices, because a dossier banner is not a reason to hide a live offer — the ordering is the
 * fix, not an incidental detail.
 *
 * `hasPresentableOffer` is deliberately the visibility rule the overlay itself uses
 * (`shouldBypassBootGate`), not a raw `availableRides.length`: an offer the driver may not be
 * shown — inactive dossier, ride already in progress — must not collapse the sheet and hide the
 * very banner explaining why nothing is displayed.
 */
export function resolveDriverHomeSnapLevel(input: {
  activeRide: { status: string; driver_arrived_at?: string | null } | null;
  hasPresentableOffer: boolean;
  availableRide: unknown;
  offerableDeferredCount: number;
  hasNotices: boolean;
}): SheetSnapLevel {
  const {
    activeRide,
    hasPresentableOffer,
    availableRide,
    offerableDeferredCount,
    hasNotices,
  } = input;

  if (activeRide) {
    const waitingAtPickup =
      activeRide.status === 'scheduled' &&
      Boolean(activeRide.driver_arrived_at);
    return waitingAtPickup ? 'trip' : 'nav';
  }
  if (hasPresentableOffer) return 'nav';
  if (hasNotices) return 'notices';
  if (availableRide || offerableDeferredCount > 0) return 'rides';
  return 'peek';
}

/**
 * Which paliers the driver may drag to, for the same situation.
 *
 * Kept beside the snap level because the two must agree: a default palier that is absent from
 * the allowed set is silently replaced by the first allowed one, so drifting the two apart makes
 * the default a request the sheet quietly ignores.
 */
export function resolveBottomSheetAllowedSnaps(
  activeRide: unknown,
  hasPresentableOffer: boolean,
  hasNotices: boolean,
): readonly SheetSnapLevel[] {
  const withNotices = (snaps: SheetSnapLevel[]): readonly SheetSnapLevel[] =>
    hasNotices ? snaps : snaps.filter((s) => s !== 'notices');

  if (activeRide) {
    return withNotices(['nav', 'notices', 'trip']);
  }
  if (hasPresentableOffer) {
    return withNotices(['nav', 'online', 'notices', 'rides', 'stats']);
  }
  return withNotices(['peek', 'online', 'notices', 'rides', 'stats']);
}

/** Everything the sheet settles on, as one comparable value. */
export type SheetSettleState = {
  /** Identity of what the sheet must get out of the way for. */
  token: string | undefined;
  /** The allowed set, joined — an array identity would retrigger on every render. */
  snapsKey: string;
  snap: SheetSnapLevel;
};

/**
 * Whether the sheet must re-settle, given what changed since it last settled.
 *
 * The token is tested **first and on its own**, and that is the whole point: an offer that has
 * just arrived must pull the sheet back down even when the target palier is the same one the
 * sheet already had. Same palier plus a new offer is exactly the case a driver experiences as
 * "the sheet stayed on top" — a manual drag never updates the last *programmatic* palier, so a
 * palier comparison answers "nothing changed" about a sheet that has been dragged away.
 *
 * The comparisons below it are the ordinary ones. Note that the token is NOT among them: a
 * reorder of the offer stack keeps the same set (see `offerSetToken`), so browsing cards must
 * not move the sheet, while the ordinary `snap` comparison still fires on a reorder when the
 * resulting palier genuinely changes.
 */
export function shouldResettleSheet(
  previous: SheetSettleState,
  next: SheetSettleState,
): boolean {
  if (previous.token !== next.token) return true;
  if (previous.snapsKey !== next.snapsKey) return true;
  return previous.snap !== next.snap;
}
