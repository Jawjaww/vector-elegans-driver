// `@types/node` is not in the app's `types` array, so the filesystem is reached through
// `require` rather than a static import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };

import {
  resolveSheetSectionBottoms,
  type SheetBodyLevel,
  type SheetSectionBottoms,
} from '../utils/homeSheetSnap';

/** Jest runs from the app root (`vector-elegans/`). */
const REPO_ROOT = process.cwd();

const DASHBOARD = join('app', '(tabs)', 'index.tsx');
const BOTTOM_SHEET = join('src', 'components', 'BottomSheet.tsx');
const SECTION = join('src', 'components', 'SheetSection.tsx');

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * Where each bottom-sheet palier ends.
 *
 * Reported: the sheet "cuts the bottom of the ride card when there is one, and the Journée and
 * Courses cards under it too". Both were one bug — the `rides` and `stats` paliers were ending
 * *inside* the content they exist to reveal, because their height was a constant describing
 * components that had changed without it.
 *
 * What a source test can hold, and what is asserted here: that the rule is **neutral** on the
 * frame before anything has measured itself (so no boot jumps), that a measurement wins and drags
 * the paliers below it, that a value the sheet cannot trust is refused rather than believed, and
 * that the boundaries stay ordered however they are mixed. The measurement itself — a wrapper's
 * `onLayout` — is pinned as source below, because nothing in this Jest environment renders React
 * Native.
 */
describe('the palier boundaries, before any section has measured itself', () => {
  it('reproduces the geometry the sheet snapped on when the heights were constants', () => {
    // Non-negotiable: on the first frame of every mount no section has reported yet, and a sheet
    // that moved on that frame would be a jump at boot. These are the four numbers that were in
    // `BottomSheet.tsx` — 46 for the online row, and each palier growing by its own constant.
    expect(resolveSheetSectionBottoms({}, 0)).toEqual({
      online: 46,
      notices: 46,
      trip: 282,
      rides: 302,
      stats: 412,
    });
  });

  it('chains the dossier stack where the constant went, not beside it', () => {
    const bodies = resolveSheetSectionBottoms({}, 188);
    expect(bodies.notices).toBe(46 + 188);
    expect(bodies.rides).toBe(46 + 188 + 256);
    expect(bodies.stats).toBe(46 + 188 + 256 + 110);
  });
});

describe('a measured section moves its own palier, and the ones under it', () => {
  it('takes the edge the section reported instead of the constant', () => {
    // The fix, as arithmetic: the deferred card and the day-stats row are taller than their
    // constants were, so the sheet stops at the content rather than through it.
    const bodies = resolveSheetSectionBottoms(
      { online: 47, rides: 358, stats: 470 },
      0,
    );
    expect(bodies.online).toBe(47);
    expect(bodies.rides).toBe(358);
    expect(bodies.stats).toBe(470);
  });

  it('carries a measured palier into the guesses below it', () => {
    // What makes the fallback safe to keep: it hangs off the *resolved* palier above, so a
    // measurement landing for one section cannot leave the next one's guess measured from a
    // constant that the measurement just invalidated.
    const bodies = resolveSheetSectionBottoms({ online: 47 }, 0);
    expect(bodies.notices).toBe(47);
    expect(bodies.trip).toBe(47 + 236);
    expect(bodies.rides).toBe(47 + 256);
    expect(bodies.stats).toBe(47 + 256 + 110);
  });
});

describe('a section the sheet cannot trust is not a measurement', () => {
  it('ignores a value that is not a position', () => {
    expect(resolveSheetSectionBottoms({ rides: Number.NaN }, 0).rides).toBe(302);
    expect(resolveSheetSectionBottoms({ rides: Number.POSITIVE_INFINITY }, 0).rides).toBe(302);
    expect(resolveSheetSectionBottoms({ rides: null }, 0).rides).toBe(302);
    expect(resolveSheetSectionBottoms({ rides: -20 }, 0).rides).toBe(302);
  });

  it('refuses an edge above the palier that follows it', () => {
    // A section cannot end before the section above it, so a value that does describes a layout
    // the sheet has already moved past. Answering with the guess keeps the palier on the content;
    // collapsing it onto the palier above would hide the very card the palier is for.
    const bodies = resolveSheetSectionBottoms({ notices: 300, rides: 120 }, 0);
    expect(bodies.notices).toBe(300);
    expect(bodies.rides).toBe(300 + 256);
  });

  it('accepts an empty section as ending where the one above it ends', () => {
    // An empty dossier banner stack is mounted, has no height, and genuinely ends at the online
    // row's bottom edge. Equality is a real answer; a smaller number is not.
    const bodies = resolveSheetSectionBottoms({ online: 46, notices: 46 }, 100);
    expect(bodies.notices).toBe(46);
    expect(bodies.rides).toBe(46 + 256);
  });
});

describe('the boundaries stay in order, measured or guessed', () => {
  it('is monotonic for every mix of measurements', () => {
    // The sheet settles on the palier nearest the finger, so two boundaries that crossed would
    // make one palier unreachable from above and put its neighbour on screen twice. Walked as a
    // grid rather than by hand: the combinations that break are the half-measured ones, which is
    // exactly the state a section produces for one frame while a sibling is still reporting.
    const samples: Record<SheetBodyLevel, number> = {
      online: 47,
      notices: 214,
      trip: 476,
      rides: 430,
      stats: 552,
    };
    const levels = Object.keys(samples) as SheetBodyLevel[];
    let measuredCell = 0;

    for (let mask = 0; mask < 1 << levels.length; mask++) {
      const measured: SheetSectionBottoms = {};
      levels.forEach((level, index) => {
        if (mask & (1 << index)) {
          measured[level] = samples[level];
          measuredCell++;
        }
      });

      const bodies = resolveSheetSectionBottoms(measured, 120);
      expect(bodies.online).toBeLessThanOrEqual(bodies.notices);
      expect(bodies.notices).toBeLessThanOrEqual(bodies.trip);
      expect(bodies.notices).toBeLessThanOrEqual(bodies.rides);
      expect(bodies.rides).toBeLessThanOrEqual(bodies.stats);
    }

    // Non-vacuity: the grid has to have exercised measurements, or every assertion above would be
    // about the fallback chain alone.
    expect(measuredCell).toBeGreaterThan(levels.length);
  });

  it('answers for exactly the paliers that carry content', () => {
    // The set is derived from the rule rather than listed, so a palier added here cannot be left
    // unmeasured in the dashboard — the next test reads these keys.
    const bodies = resolveSheetSectionBottoms({}, 0);
    expect(Object.keys(bodies).sort()).toEqual([
      'notices',
      'online',
      'rides',
      'stats',
      'trip',
    ]);
  });
});

describe('the sheet snaps on the measured boundaries', () => {
  const sheet = readSource(BOTTOM_SHEET);

  it('builds every palier from the boundary, and none of them from a constant', () => {
    // The regression, named: per-palier constants describing components that changed without
    // them. `rides` and `stats` are the two that did, so they are the two that must not come
    // back as numbers in this file.
    expect(sheet).toContain('function buildSnapY(sceneH: number, bodies: Record<SheetBodyLevel, number>)');
    for (const level of ['online', 'notices', 'trip', 'rides', 'stats'] as const) {
      expect(sheet).toContain(`cap(bodies.${level})`);
    }
    expect(sheet).not.toContain('RIDES_BODY_H');
    expect(sheet).not.toContain('STATS_BODY_H');
    expect(sheet).not.toContain('TRIP_BODY_H');
    expect(sheet).not.toContain('ONLINE_BODY_H');
    expect(sheet).not.toContain('noticesHeight');
  });

  it('re-springs when a measurement lands after the palier was chosen', () => {
    // The sections report one frame after they are laid out, so a measurement arriving on a
    // palier the sheet is already sitting on is the normal case. Without this comparison the
    // sheet would keep the guessed offset until the driver touched it — which is the bug, one
    // frame later.
    expect(sheet).toContain('if (Math.abs(prevTarget - nextTarget) > 1) {');
    expect(sheet).toMatch(/\}, \[sceneH, bodies, snapYShared, translateY\]\);/);
  });

  it('keeps the visible height and the snap target on the same boundary', () => {
    // The overlays above the sheet are placed from `sheetVisibleHeight`. If it answered from a
    // constant while the sheet snapped on a measurement, the guidance bar would be drawn at the
    // top edge the sheet *used to* have.
    expect(sheet).toContain('bodies: Record<SheetBodyLevel, number>;');
    expect(sheet).toContain('return HANDLE_H + bodies[level];');
  });

  it('scrolls on the last allowed palier, not only on stats', () => {
    // During a ride the allowed set stops at `trip`. Enabling scroll only when `level === 'stats'`
    // left the « Je suis arrivé » swipe unreachable if `TOP_MAP_REVEAL` capped the snap.
    expect(sheet).toContain('const atExpanded = level === expandedSnapRef.current');
    expect(sheet).not.toContain("const atStats = level === 'stats'");
    expect(sheet).toContain('allowedOrder.at(-1)');
  });
});

describe('the dashboard measures every palier, once', () => {
  const dashboard = readSource(DASHBOARD);

  it('wraps each body palier in a measured section', () => {
    // Derived from the rule's own keys: a palier added to `resolveSheetSectionBottoms` fails here
    // until something measures it.
    for (const level of Object.keys(resolveSheetSectionBottoms({}, 0))) {
      expect(dashboard).toContain(`level="${level}"`);
    }
    expect(dashboard.match(/level="/g) ?? []).toHaveLength(5);
  });

  it('hands the sheet one resolved set, and the overlays the same one', () => {
    // One source of truth for where the sheet's top edge is: the sheet is told, and the bar and
    // the notice are placed from it. Two answers is how an overlay overlaps the panel.
    expect(dashboard).toContain('resolveSheetSectionBottoms(sheetBottoms, noticesHeight)');
    expect(dashboard).toContain('bodies={sheetBodies}');
    expect(dashboard).toContain('sheetVisibleHeight(overlaySheetLevel, sheetBodies)');
    // The constant has not merely moved: it is no longer a prop of the sheet at all.
    expect(dashboard).not.toContain('noticesHeight={');
    expect(dashboard).not.toContain('noticesHeight,\n        overlaySheetLevel');
  });

  it('keeps the measuring callback stable, which is what keeps a measurement alive', () => {
    // `SheetSection` clears its palier on unmount, and it cannot tell a real unmount from a
    // re-render that replaced the callback — so an inline arrow here would erase the measurement
    // of every section on every render, and no `onLayout` would fire to restore it. Asserted as
    // the dependency list itself, since that is the whole of the guarantee.
    const declaration = 'const measureSheetSection = useCallback<SheetSectionMeasure>';
    expect(dashboard).toContain(declaration);
    const from = dashboard.indexOf(declaration);
    const callback = dashboard.slice(from, dashboard.indexOf('\n  );', from));
    expect(callback.trimEnd().endsWith('[],')).toBe(true);
    expect(dashboard).toContain(
      'previous[level] === bottom ? previous : { ...previous, [level]: bottom }',
    );
  });

  it('measures trip and rides against the scroll content, not a chrome wrapper', () => {
    // The regression: a View (border, paddingTop) wrapped both SheetSections, so onLayout.y
    // was ~0 and the trip palier snapped to the swipe's own height. During a ride that palier
    // is as high as the sheet may go, so « Je suis arrivé » was clipped. The chrome belongs
    // *inside* the section so y is counted from the ScrollView content.
    const body = dashboard.slice(dashboard.indexOf('function DriverHomeSheetBody'));
    const trip = body.indexOf('level="trip"');
    const rides = body.indexOf('level="rides"');
    const chrome = body.indexOf('className="mb-5"');
    expect(trip).toBeGreaterThan(-1);
    expect(chrome).toBeGreaterThan(trip);
    expect(rides).toBeGreaterThan(chrome);
    expect(body.lastIndexOf('className="mb-5"')).toBeGreaterThan(rides);
  });
});

describe('SheetSection', () => {
  const section = readSource(SECTION);

  it('reports the bottom edge, in the space the snap offsets are built from', () => {
    // `y + height`, not `height`: the frame is relative to the scroll content container, which is
    // the same space the palier boundaries live in — padding included, margins above included.
    expect(section).toContain('measureRef.current(level, y + height);');
    expect(section).not.toContain('measureRef.current(level, height)');
    expect(section).toContain('scroll content container');
    expect(section).toContain('native wrapper');
  });

  it('holds the callback in a ref, so a render cannot clear a live measurement', () => {
    // The trap: the unmount cleanup has to clear the palier — a section that leaves must stop
    // speaking for it — and with the callback in the deps an inline arrow would run that cleanup
    // on every render instead.
    expect(section).toContain('const measureRef = useRef(onMeasure);');
    expect(section).toContain('useEffect(() => () => measureRef.current(level, null), [level]);');
  });

  it('cannot be flattened away, or it would report nothing', () => {
    // A view whose only job is `onLayout` is exactly what Android's view flattening removes.
    expect(section).toContain('collapsable={false}');
  });
});
