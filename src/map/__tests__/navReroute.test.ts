// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require("fs") as {
  readFileSync: (path: string, encoding: string) => string;
};

import { buildMapHtmlTemplate } from "../mapHtmlTemplate";

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();
const MAP = "src/map/WebViewMap.tsx";
const TEMPLATE = "src/map/mapHtmlTemplate.ts";

function source(relativePath: string): string {
  return readFileSync(`${REPO_ROOT}/${relativePath}`, "utf8");
}

function mapHtml(): string {
  return buildMapHtmlTemplate({ lat: 48.85, lng: 2.35 });
}

function extractBetween(html: string, startMarker: string, endMarker: string) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

/**
 * The resume check, run against the real embedded helpers and a stub document.
 *
 * It spans three fragments on purpose: the helpers it measures with, the guard it clears, and the
 * check itself — the same text the map document runs, in the same order.
 */
function rerouteResumeScope(
  nav: Record<string, any>,
  coords: [number, number] | null,
) {
  const html = mapHtml();
  const fragment = [
    extractBetween(
      html,
      "/* VE_NAV_HELPERS_START */",
      "/* VE_NAV_HELPERS_END */",
    ),
    extractBetween(
      html,
      "/* VE_OFF_ROUTE_GUARD_START */",
      "/* VE_OFF_ROUTE_GUARD_END */",
    ),
    extractBetween(
      html,
      "/* VE_REROUTE_RESUME_START */",
      "/* VE_REROUTE_RESUME_END */",
    ),
  ].join("\n");
  const posted: Record<string, unknown>[] = [];
  const fakeWindow = {
    __veNav: nav,
    __veLastGpsCoords: coords,
    ReactNativeWebView: {
      postMessage: (raw: string) => posted.push(JSON.parse(raw)),
    },
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(
    "window",
    `${fragment}
    return { rerouteCheckNow: rerouteCheckNow, latchOffRoute: latchOffRoute };`,
  )(fakeWindow);
  api.rerouteCheckNow();
  return { posted, nav };
}

const ROAD_LINE: [number, number][] = [
  [2.3, 48.84],
  [2.302, 48.84],
  [2.304, 48.84],
];

function navWith(line: [number, number][] | null, extra: Record<string, any> = {}) {
  return {
    line: line,
    offRouteStreak: 0,
    awaitingReroute: false,
    ...extra,
  };
}

describe("reroute on return to foreground", () => {
  it("asks for a reroute when the driver is still adrift, and marks it as a resume", () => {
    // A latch already spent on a line the driver has since left must not swallow the resume: the
    // streak is meaningless across a screen-off.
    const nav = navWith(ROAD_LINE, { awaitingReroute: true, offRouteStreak: 3 });
    const { posted } = rerouteResumeScope(nav, [2.3, 48.840539]);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: "offRoute", reason: "resume" });
    expect(nav.awaitingReroute).toBe(true);
  });

  it("clears the latch and stays quiet when the driver is back on the line", () => {
    const nav = navWith(ROAD_LINE, { awaitingReroute: true, offRouteStreak: 3 });
    const { posted } = rerouteResumeScope(nav, [2.3, 48.84]);
    expect(posted).toHaveLength(0);
    expect(nav.awaitingReroute).toBe(false);
    expect(nav.offRouteStreak).toBe(0);
  });

  it("does nothing on a chord: a failed route is retried, never treated as a road", () => {
    const { posted } = rerouteResumeScope(
      navWith([
        [2.3, 48.84],
        [2.304, 48.84],
      ]),
      [2.3, 48.85],
    );
    expect(posted).toHaveLength(0);
  });

  it("does nothing without a fix to measure", () => {
    const { posted } = rerouteResumeScope(navWith(ROAD_LINE), null);
    expect(posted).toHaveLength(0);
  });

  it("is wired to the foreground transition, not to every GPS tick", () => {
    const map = source(MAP);
    const appState = map.slice(map.indexOf("const handleAppStateChange"));
    expect(appState).toContain("postToMap({ type: 'rerouteCheck' })");
    expect(appState).toContain("navigationFollowRef.current");
    // The document must recognise it and answer with the resume reason.
    const html = mapHtml();
    expect(html).toContain('msg.type === "rerouteCheck"');
    expect(html).toContain('reason: "resume"');
  });
});

describe("reroute wiring", () => {
  it("reports a suppressed reroute instead of returning in silence", () => {
    const map = source(MAP);
    const request = map.slice(map.indexOf("const requestReroute"));
    // The absence of a reroute used to be unreadable: no line said the guard had fired at all.
    expect(request).toContain("action: 'skipped'");
    expect(request).toContain("reason: 'not_navigating'");
  });

  it("keeps the anti-flap window, and lets a resume bypass it", () => {
    const map = source(MAP);
    const request = map.slice(map.indexOf("const requestReroute"));
    expect(request).toContain("if (!force && now - lastRerouteAtRef.current");
    expect(map).toContain("const REROUTE_COOLDOWN_MS = 8000");
    expect(map).toContain("requestReroute(reason === 'resume')");
  });

  it("retries a failed leg with a bounded backoff, never on an abort", () => {
    const map = source(MAP);
    expect(map).toMatch(/const ROUTE_RETRY_BACKOFF_MS = \[[^\]]+\] as const/);
    const request = map.slice(map.indexOf("const requestRouteLegs"));
    expect(request).toContain("ROUTE_RETRY_BACKOFF_MS[attempt]");
    expect(request).toContain("reason !== 'aborted'");
    expect(request).toContain("logOfferStage('nav_route_retry'");
    // A superseding route aborts the signal; the pending retry timer must go with it.
    expect(request).toContain("signal.addEventListener('abort'");
  });
});
