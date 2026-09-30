// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require("fs") as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require("path") as { join: (...parts: string[]) => string };

import { OFFER_NOTICE_COPY } from "../offerNoticeCopy";

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const DASHBOARD = join("app", "(tabs)", "index.tsx");
const OVERLAY = "src/components/OfferNoticeOverlay.tsx";
const RETIRED_CARD = "src/components/OfferNoticeCard.tsx";
const STACK = "src/components/OfferRideCarousel.tsx";
const SHEET = "src/components/BottomSheet.tsx";
/** The card the notice shares its lane with, and the one it takes its scale from. */
const GUIDANCE_BAR = "src/components/TripGuidanceBar.tsx";
/** Its supporting street line is where the notice's body size comes from. */
const MANEUVER_HUD = "src/components/TripManeuverHud.tsx";

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

/** The `zIndex` declared by one entry of a `StyleSheet.create` block. */
function styleSheetZIndex(source: string, entry: string): number {
  const from = source.indexOf(`${entry}: {`);
  const match = from < 0 ? null : /zIndex: (\d+)/.exec(source.slice(from));
  if (!match) throw new Error(`no zIndex for ${entry}`);
  return Number(match[1]);
}

/**
 * The offer notice, told over the map instead of inside the sheet.
 *
 * Three decisions are pinned here, none of which a render test would catch. That the notice is no
 * longer a child of the sheet — its mere existence used to count as a notice and pull the sheet
 * open, which is how a driver got a panel they had not asked for, moving under the message they
 * had not asked for either. That it sits outside the map's group, because that group is a sealed
 * stacking context and an overlay inside it could never be lifted above the offer stack it
 * replaces. And that its layer is strictly between the stack and the sheet, so the card wins
 * against a card and loses against a sheet the driver raised on purpose.
 */
describe("the offer notice is a map overlay now", () => {
  const dashboard = readSource(DASHBOARD);
  const overlay = readSource(OVERLAY);

  it("is not a child of the sheet any more, and the sheet does not open for it", () => {
    // The trigger was `noticeCount`: `dossierBanners.length + (offerNotice ? 1 : 0)`. Put the
    // second term back and `hasNotices` turns true, the sheet snaps to the `notices` palier, and
    // the notice is painted inside the panel that is at that moment sliding up under it.
    expect(dashboard).toContain("const noticeCount = dossierBanners.length;");
    expect(dashboard).not.toContain("dossierBanners.length + (offerNotice");

    // Non-vacuity: the notice must not have moved back in under another name.
    const sheetChildren = dashboard.slice(dashboard.indexOf("<BottomSheet"));
    expect(sheetChildren).not.toContain("<OfferNoticeOverlay");
    expect(dashboard).not.toContain("<OfferNoticeCard");
  });

  it("leaves no trace of the card that was retired", () => {
    // The no-dead-code rule: a same-named component left behind is a second surface to keep in
    // step, and nothing would notice it drifting.
    expect(() => readSource(RETIRED_CARD)).toThrow();
  });

  it("is mounted outside the map group, between the offer stack and the sheet", () => {
    const stackAt = dashboard.indexOf("{offerCarouselElement}");
    const noticeAt = dashboard.indexOf("<OfferNoticeOverlay");
    const sheetAt = dashboard.indexOf("<BottomSheet");
    expect(stackAt).toBeGreaterThan(-1);
    expect(noticeAt).toBeGreaterThan(stackAt);
    expect(sheetAt).toBeGreaterThan(noticeAt);
  });

  it("sits strictly between the offer stack and the sheet in the layer scale", () => {
    // Above the stack because it is what replaces the card; below the sheet because the sheet is
    // the one panel the driver pulled up on purpose. Both fields, because Android sorts siblings
    // by `elevation` and iOS by `zIndex` — one number alone settles only one of the two.
    const noticeZ = Number(/zIndex: (\d+)/.exec(overlay)?.[1]);
    const noticeElevation = Number(/elevation: (\d+)/.exec(overlay)?.[1]);
    const stackZ = styleSheetZIndex(readSource(STACK), "root");
    const sheetZ = styleSheetZIndex(readSource(SHEET), "sceneFill");

    expect(noticeZ).toBeGreaterThan(stackZ);
    expect(noticeZ).toBeLessThan(sheetZ);
    expect(noticeElevation).toBe(noticeZ);
  });

  it("anchors to the lane above the resting sheet, from the sheet itself", () => {
    // The same arithmetic as the instruction bar: the sheet's settled visible height plus the
    // shared lane offset. A hard-coded `bottom` would drift the moment the sheet's chrome moves.
    expect(overlay).toContain("sheetVisibleH + LANE_BASE_OFFSET");
    expect(dashboard).toContain("sheetVisibleH={overlaySheetVisibleH}");
  });

  it("keeps the map pannable around the card, and the card itself pressable", () => {
    // Unlike the trip HUDs, which are read and never pressed: this one carries a dismiss control
    // and a call to action, so `none` here would make both of them dead.
    expect(overlay).toContain('pointerEvents="box-none"');
    expect(overlay).toMatch(
      /accessibilityLabel=\{t\(["']ride\.offerNotice\.dismiss["']\)\}/,
    );
    expect(overlay).toContain("{t(cta.labelKey)}");
  });

  it("arrives after the card it replaces, rather than blinking on", () => {
    // The card leaves instantly (a reanimated exit), so the notice has to fade in on its own
    // clock or the two surfaces swap in one frame and read as a glitch.
    expect(overlay).toContain("new Animated.Value(0)");
    expect(overlay).toContain("NOTICE_ENTER_MS");
    expect(overlay).toContain("opacity: shown");
  });

  it("draws the notice on the material every overlay above the map uses", () => {
    // One look over the map. The face is pale, which is why the copy carries an `ink` step down
    // rather than the marker's own colour: see `offerNoticeCopy`.
    expect(overlay).toMatch(/from\s+["']\.\/GlassPanel["']/);
    expect(overlay).toContain("<GlassPanel radius={OVERLAY_CARD_RADIUS}>");
    expect(overlay).toContain("GLASS_MATERIAL");
    // No colour of its own, so retuning the face cannot leave one card off-material.
    expect(overlay).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(overlay).not.toMatch(/rgba?\(/);
  });

  it("reads at the scale of the instruction card it shares the lane with", () => {
    // 15 on 20 over a 13 pt body was a step below both neighbours on the same pale face, and the
    // second half of "one doesn't see the message well". The title takes the guidance bar's 16 on
    // 22; the body takes the next-turn HUD's supporting line, 15 on 20. Asserted against the two
    // reference files rather than as bare numbers, so moving the family moves this with it.
    const bar = readSource(GUIDANCE_BAR);
    const hud = readSource(MANEUVER_HUD);
    expect(bar).toContain("fontSize: 16");
    expect(hud).toContain("const STREET_SIZE = 15");

    expect(overlay).toContain("fontSize: 16");
    expect(overlay).toContain("fontSize: 15");
    expect(overlay).not.toContain("fontSize: 13");
  });
});

describe("a notice that offers a way out does not lead into the history tab", () => {
  it('sends "see my ride" to the map, where the trip is driven', () => {
    // The Courses tab stopped carrying the active trip when it became the completed-ride history.
    // A CTA labelled "see my ride" must not land on a list of rides that are already over.
    for (const copy of Object.values(OFFER_NOTICE_COPY)) {
      expect(copy.cta?.target).not.toBe("rides");
    }
    expect(OFFER_NOTICE_COPY.already_on_ride.cta).toEqual({
      labelKey: "ride.offerNoticeCta.currentRide",
      target: "home",
    });
    expect(OFFER_NOTICE_COPY.already_accepted.cta).toEqual({
      labelKey: "ride.offerNoticeCta.currentRide",
      target: "home",
    });

    expect(readSource(DASHBOARD)).toContain(
      'onOpenHome={() => router.push("/(tabs)")}',
    );
  });

  it("still names the dossier when the fix is the driver dossier", () => {
    expect(OFFER_NOTICE_COPY.dossier_inactive.cta).toEqual({
      labelKey: "ride.offerNoticeCta.profile",
      target: "profile",
    });
  });
});
