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

/**
 * What the resting sheet keeps visible of itself above the bottom of the scene.
 *
 * Declared here, with the rest of the lane, because a tenant that is not a component needs it:
 * the map document has to lift the attribution label clear of the instruction band, and that
 * band stands on this lip. The document is a string built by a pure module, so it cannot read a
 * constant out of `components/` — the arrow has to point this way, exactly as it does for
 * `TRIP_GUIDANCE_BAR_HEIGHT`, which is why `BottomSheet` now imports it instead of owning it.
 */
export const SHEET_PEEK_VISIBLE_H = 14;

/** Corner radius of a map card. A card, not a capsule: 999 collapsed these into pills. */
export const OVERLAY_CARD_RADIUS = 20;

/** Gap between two stacked overlays, and between the lower one and the sheet. */
export const OVERLAY_STACK_GAP = 6;

/**
 * Distance from the top of the visible sheet to the bottom of the instruction bar.
 *
 * Wide enough that the card's shadow does not land on the sheet. A 10 px gap read as contact.
 */
export const LANE_BASE_OFFSET = 28;

/**
 * Resting distance from the sheet to a small control, while the instruction bar is hidden.
 *
 * Lower than the bar on purpose: the control only climbs (`LIFT_OVER_INSTRUCTION`) once the bar
 * is on screen. At rest it stays in the strip the bar leaves behind.
 */
export const CONTROL_BASE_OFFSET = 12;

/** Footprint of a round control in the lane, rim included. */
export const MAP_CONTROL_SIZE = 48;

/**
 * How far a small control rises to clear the instruction bar while the bar is on screen.
 *
 * The bar is anchored higher than the control (`LANE_BASE_OFFSET` versus `CONTROL_BASE_OFFSET`),
 * so the lift is the bar's height, the stack gap, and that extra baseline. Without the baseline
 * the control's top lands inside the sentence once the bar is raised off the sheet.
 */
export const LIFT_OVER_INSTRUCTION =
  TRIP_GUIDANCE_BAR_HEIGHT +
  OVERLAY_STACK_GAP +
  (LANE_BASE_OFFSET - CONTROL_BASE_OFFSET);

/**
 * Bottom of the whole instruction band, measured from the bottom of the scene.
 *
 * The bar is hung off the top of the sheet (`SHEET_PEEK_VISIBLE_H + LANE_BASE_OFFSET`) and is
 * `TRIP_GUIDANCE_BAR_HEIGHT` tall, so this is the distance a control has to reach to be *above*
 * the sentence rather than inside it. It is the same arithmetic `LIFT_OVER_INSTRUCTION` does from
 * the control's own resting offset, stated from the floor instead — which is what the map document
 * needs, since it has no resting offset of its own to lift from.
 */
export const INSTRUCTION_BAND_TOP =
  SHEET_PEEK_VISIBLE_H + LANE_BASE_OFFSET + TRIP_GUIDANCE_BAR_HEIGHT;

/**
 * Bottom of the attribution label, measured from the bottom of the map document.
 *
 * The licence credit used to be painted a few pixels above the bottom edge, in the strip the low
 * overlays occupy, so it was drawn across the instruction being read ("Rendez-vous au point de
 * prise en charge") and across the location control. It is one gap above the instruction band now:
 * the band is what the driver reads, and a credit that overlaps it takes a sentence away to show a
 * courtesy. `OVERLAY_STACK_GAP` is the gap the lane already uses between two stacked overlays,
 * rather than a number invented here.
 *
 * This offset clears the instruction band and *cannot* be asked to clear the recenter control: that
 * control's bottom is the **settled** sheet height plus `CONTROL_BASE_OFFSET`, and a palier's
 * height is measured content that `sheetVisibleHeight` deliberately does not cap. So the control's
 * offset is whatever a section measured — no constant here bounds it, and this module cannot
 * enumerate the paliers. A fixed credit offset therefore cannot be shown to clear it: raising the
 * credit moves the band in which the two can meet up with it, it does not remove the band. The
 * separation lives on the axis that does not move, and `MAP_CONTROL_RIGHT_INSET` below holds it.
 */
export const ATTRIBUTION_LABEL_BOTTOM = INSTRUCTION_BAND_TOP + OVERLAY_STACK_GAP;

/** Right inset of the licence credit's column, from the right edge of the map. */
export const ATTRIBUTION_LABEL_RIGHT_INSET = 4;

/**
 * Horizontal footprint of the vertical credit label: one 10 px line at `line-height: 1`, its
 * padding and its hairline. Mirrors the rules in the map document; the guard measures the document
 * and fails if the two disagree.
 */
export const ATTRIBUTION_LABEL_STRIP_W = 18;

/** How far a round control's touch zone reaches past its own box (`hitSlop` on the recenter one). */
export const MAP_CONTROL_TOUCH_SLOP = 8;

/**
 * Right inset the lane's round control needs so its touch zone clears the credit's column.
 *
 * The control was placed with `right-4`, read as "4 rem, and NativeWind's rem is 14, so 56 px" —
 * the digit of a Tailwind spacing *step* multiplied by the rem by hand. A step is `0.25rem`, so
 * `right-4` is `1rem` = **14 px** on native (tailwindcss with `nativewind/preset` emits
 * `right: 1rem`; `react-native-css-interop` resolves it at 14 px per rem). The control was 42 px
 * inside where that figure placed it, and its touch zone began 6 px from the edge — so it covered
 * the credit's column (4..22) by 16 px instead of leaving it free. That is the defect the previous
 * figure claimed to have ruled out.
 *
 * Derived from the credit's own geometry and the lane's gap rather than written out, so moving the
 * credit moves the control with it; `attributionDisclosure.test.ts` holds the arithmetic, and the
 * control and the document both read these figures instead of carrying copies.
 */
export const MAP_CONTROL_RIGHT_INSET =
  ATTRIBUTION_LABEL_RIGHT_INSET +
  ATTRIBUTION_LABEL_STRIP_W +
  OVERLAY_STACK_GAP +
  MAP_CONTROL_TOUCH_SLOP;
