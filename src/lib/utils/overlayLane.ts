/**
 * The lane just above the sheet, and the small controls that have to share it.
 *
 * Three things want that strip of screen: the instruction bar, the arrival chip, and the recenter
 * control. The instruction bar is the widest and it is the one being *read*, so it owns the lane
 * and the other two lift clear of it. That decision used to live as two unconnected local
 * constants — one in the arrival chip, and none at all in the recenter control, which is why the
 * control was drawn straight across the sentence. A shared number is the point: two controls that
 * lift by amounts a point apart show as two panels that almost line up, which is worse than one
 * that plainly does not.
 *
 * Everything here is geometry and nothing else, so the stacking can be checked as arithmetic
 * rather than as a screenshot.
 */

/**
 * Height of the instruction bar.
 *
 * Declared here rather than in `TripGuidanceBar` so the controls that must clear it can depend on
 * the number without depending on the component: a util importing from `components/` would point
 * the arrow the wrong way for what is pure layout.
 *
 * Deterministic rather than measured: the bar draws one row of type, capped at two lines, so the
 * tallest state is known and there is no reason to pay for an `onLayout` round-trip that would
 * make the arrival chip jump a frame after the bar appears.
 *
 * The figure is the tall card, not the old pill: 16 pt type on a 22 pt line, two lines, plus
 * 14 pt of padding on each side and the hairline. A shorter constant leaves the arrival chip
 * across the second line.
 */
export const TRIP_GUIDANCE_BAR_HEIGHT = 76;

/** Corner radius of a map card. A card, not a capsule: 999 collapsed these into pills. */
export const OVERLAY_CARD_RADIUS = 20;

/** Gap between two stacked overlays, and between the lower one and the sheet. */
export const OVERLAY_STACK_GAP = 6;

/** Distance from the top of the visible sheet to the bottom of the instruction bar. */
export const LANE_BASE_OFFSET = 10;

/**
 * The same distance for a small control in the lane.
 *
 * Two points above the bar, so a control and the bar never share a baseline even when the control
 * is at rest — the offset is what makes the two read as a stack rather than as one thick panel.
 */
export const CONTROL_BASE_OFFSET = 12;

/** Footprint of a round control in the lane, rim included. */
export const MAP_CONTROL_SIZE = 48;

/**
 * How far a small control rises to clear the instruction bar while the bar is on screen.
 *
 * The bar's own height plus the gap, so a lifted control sits in the lane above it rather than
 * over it. Both the arrival chip and the recenter control use this figure and nothing else: the
 * lift is the only thing between a control and the sentence underneath it.
 */
export const LIFT_OVER_INSTRUCTION = TRIP_GUIDANCE_BAR_HEIGHT + OVERLAY_STACK_GAP;
