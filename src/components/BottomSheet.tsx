import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Dimensions,
  ScrollView,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { APP_CHROME } from '../lib/theme';
import { AppChromeBackground } from './AppChromeBackground';
import { setBottomSheetTabBarPanGesture } from './bottomSheetGestureBridge';
import { SHEET_PEEK_VISIBLE_H } from '../lib/utils/overlayLane';
import {
  shouldResettleSheet,
  type SheetBodyLevel,
  type SheetSettleState,
} from '../lib/utils/homeSheetSnap';

const WINDOW_H = Dimensions.get('window').height;

/** Align with app/(tabs)/_layout.tsx tabBarStyle.height */
export const TAB_BAR_HEIGHT = 80;

/** Top corner radius — keep modest so the collapsed strip stays flat. */
const SHEET_TOP_RADIUS = 8;

const HANDLE_H = 22;

/** Collapsed strip: rounded lip + handle pill only (px visible above scene bottom). */
const HANDLE_ONLY_VISIBLE = SHEET_PEEK_VISIBLE_H;

/** Invisible upward-drag band at scene bottom (above tab bar). */
export const SCENE_BOTTOM_DRAG_ZONE = 36;

/**
 * Sheet extends below the scene (into tab-bar zone) so the bottom edge
 * stays flush during spring bounce — top-only animation via `top`.
 */
const BOTTOM_EXTENSION = TAB_BAR_HEIGHT + 48;

/** Map strip kept visible at the top when fully expanded */
const TOP_MAP_REVEAL = 48;

/** Single spring — natural overshoot, then settle on target */
const SPRING = {
  damping: 20,
  stiffness: 240,
  mass: 0.85,
  overshootClamping: false,
} as const;

/**
 * Target visible heights (px from bottom of the home scene).
 *
 * peek    — handle / top edge only
 * nav     — navigation mode: handle only (max map)
 * online  — Disponible switch
 * notices — switch + dossier banner
 * trip    — switch + banner slot + active trip controls
 * rides   — + available / deferred ride cards
 * stats   — + day earnings and ride count (last idle palier)
 *
 * The body heights come from `bodies` — measured by the sections themselves — and not from a
 * constant per palier. Those constants described components that changed without them, so a
 * palier could end inside the card it exists to reveal: the bottom of a deferred ride card, and
 * the earnings under it. See `resolveSheetSectionBottoms` for the fallback and `SheetSection` for
 * the measurement.
 *
 * The cap is the one thing that is still a judgement: a scene shorter than its own content has to
 * stop somewhere, and `TOP_MAP_REVEAL` is where. A palier that hits the cap is the one case where
 * this sheet cannot show all of its own content — see the note on `scrollEnabled` below.
 */
function buildSnapY(sceneH: number, bodies: Record<SheetBodyLevel, number>) {
  const maxVisible = Math.max(HANDLE_ONLY_VISIBLE, sceneH - TOP_MAP_REVEAL);
  const cap = (bodyHeight: number) => Math.min(HANDLE_H + bodyHeight, maxVisible);
  return {
    peek: sceneH - HANDLE_ONLY_VISIBLE,
    nav: sceneH - HANDLE_ONLY_VISIBLE,
    online: sceneH - cap(bodies.online),
    notices: sceneH - cap(bodies.notices),
    trip: sceneH - cap(bodies.trip),
    rides: sceneH - cap(bodies.rides),
    stats: sceneH - cap(bodies.stats),
  };
}

export type SheetSnapLevel =
  | 'peek'
  | 'nav'
  | 'online'
  | 'notices'
  | 'trip'
  | 'rides'
  | 'stats';

const SNAP_ORDER: SheetSnapLevel[] = [
  'peek',
  'nav',
  'online',
  'notices',
  'trip',
  'rides',
  'stats',
];

/** Visible height of the nav snap (for HUD placement above the sheet). */
export const NAV_SHEET_VISIBLE_H = HANDLE_ONLY_VISIBLE;

/**
 * Visible body height (px above the scene bottom) for a settled palier.
 *
 * Taken from the same measured boundaries the sheet snaps with, so an overlay placed on top of
 * the sheet cannot disagree with where the sheet actually is. Deliberately **not** capped by
 * `TOP_MAP_REVEAL`: that cap belongs to the snap *target*, where a scene shorter than its own
 * content has to stop somewhere, and callers here are placing a bar above a sheet on a scene that
 * is at least as tall as what the palier shows.
 */
export function sheetVisibleHeight(
  level: SheetSnapLevel,
  bodies: Record<SheetBodyLevel, number>,
): number {
  if (level === 'peek' || level === 'nav') return HANDLE_ONLY_VISIBLE;
  return HANDLE_H + bodies[level];
}

function resolveAllowedOrder(
  allowedSnaps?: readonly SheetSnapLevel[],
): SheetSnapLevel[] {
  if (!allowedSnaps || allowedSnaps.length === 0) return [...SNAP_ORDER];
  const allowed = new Set(allowedSnaps);
  const filtered = SNAP_ORDER.filter((l) => allowed.has(l));
  return filtered.length > 0 ? filtered : [...SNAP_ORDER];
}

interface BottomSheetProps {
  children: React.ReactNode;
  snapLevel?: SheetSnapLevel;
  /** When set, drag only settles on these levels (in SNAP_ORDER sequence). */
  allowedSnaps?: readonly SheetSnapLevel[];
  /**
   * Bottom edge of each body palier, in the sheet's scroll-content space.
   *
   * The whole geometry of the snap rests on this being where the content actually ends. Built by
   * `resolveSheetSectionBottoms`, which answers from the guess for a section that has not measured
   * itself yet; the sections measure through `SheetSection`. The caller owns the state because the
   * dashboard also places the guidance bar and the offer notice above the sheet, and both have to
   * land on the same top edge the sheet is going to snap to.
   */
  bodies: Record<SheetBodyLevel, number>;
  /**
   * Identity of what the sheet must get out of the way for.
   *
   * A changed token re-settles the sheet on its default palier even when that palier has not
   * changed, which is the case the prop exists for: a driver who dragged the sheet up kept it
   * up when the next offer arrived, because the target was `nav` before and after and the
   * snap effect only fires on a change. The token still has to ignore a pure reorder — see
   * `offerSetToken` — or browsing the offer stack would fling the sheet down every swipe.
   */
  collapseToken?: string;
  /**
   * The palier the sheet has actually settled on, including a drag.
   *
   * The parent cannot derive this. `snapLevel` is only the palier the sheet is *asked* for, and
   * a drag settles wherever the driver let go, so a caller that needs to know whether the driver
   * is looking at the sheet — the guidance bar retracts when they are — has no other source.
   */
  onSettle?: (level: SheetSnapLevel) => void;
}

export const BottomSheet = ({
  children,
  snapLevel = 'peek',
  allowedSnaps,
  bodies,
  collapseToken,
  onSettle,
}: BottomSheetProps) => {
  const [sceneH, setSceneH] = useState(WINDOW_H - TAB_BAR_HEIGHT);
  const scrollRef = useRef<ScrollView>(null);
  const snapY = buildSnapY(sceneH, bodies);

  const allowedOrder = useMemo(
    () => resolveAllowedOrder(allowedSnaps),
    [allowedSnaps],
  );

  const expandedSnap = allowedOrder.at(-1) ?? allowedOrder[0];
  const [scrollEnabled, setScrollEnabled] = useState(snapLevel === expandedSnap);

  const effectiveSnap = allowedOrder.includes(snapLevel)
    ? snapLevel
    : allowedOrder[0];

  const translateY = useSharedValue(snapY[effectiveSnap]);
  const context = useSharedValue({ y: 0 });
  const snapYShared = useSharedValue(snapY);
  const allowedOrderShared = useSharedValue(allowedOrder);
  const prevSnap = useRef<SheetSnapLevel>(effectiveSnap);
  const prevSettle = useRef<SheetSettleState>({
    token: collapseToken,
    snapsKey: allowedOrder.join(','),
    snap: effectiveSnap,
  });

  // Held in a ref so `applySnapLevel` — and with it both pan gestures — keeps its identity: a
  // new callback per render would rebuild the gestures mid-drag.
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  // Same reason as `onSettleRef`: `applySnapLevel` must keep its identity, and the expanded
  // palier is `trip` during a ride, not always `stats`.
  const expandedSnapRef = useRef(expandedSnap);
  expandedSnapRef.current = expandedSnap;

  const applySnapLevel = useCallback(
    (level: SheetSnapLevel, report = false) => {
      prevSnap.current = level;
      // Scrolling opens on the fully expanded palier and nowhere else: between two paliers the
      // drag that reveals more is the gesture, and a scrollable body would swallow it. With the
      // boundaries measured, a palier ends exactly where its content ends, so the expanded one has
      // nothing left to scroll to except in the capped case `buildSnapY` describes.
      //
      // That palier is the last allowed snap, not the idle `stats` slot: during a ride the
      // allowed set stops at `trip`, and hard-coding `stats` left the swipe unreachable when
      // `TOP_MAP_REVEAL` capped the target.
      const atExpanded = level === expandedSnapRef.current;
      setScrollEnabled(atExpanded);
      if (!atExpanded) {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      if (report) onSettleRef.current?.(level);
    },
    [],
  );

  // Measure scene, and follow the boundaries: update every snap point, and re-spring only if the
  // palier the sheet is on actually moved. A measurement that lands *after* the palier was chosen
  // is the normal case, not an edge — the sections report one frame after they are laid out — and
  // it is why this effect compares the old and new target instead of only reacting to `sceneH`.
  useEffect(() => {
    const nextSnapY = buildSnapY(sceneH, bodies);
    const level = prevSnap.current;
    const prevTarget = snapYShared.value[level];
    const nextTarget = nextSnapY[level];
    snapYShared.value = nextSnapY;
    if (Math.abs(prevTarget - nextTarget) > 1) {
      translateY.value = withSpring(nextTarget, SPRING);
    }
  }, [sceneH, bodies, snapYShared, translateY]);

  useEffect(() => {
    allowedOrderShared.value = allowedOrder;
  }, [allowedOrder, allowedOrderShared]);

  // Re-settle whenever something the sheet must honour changes: the palier target, the allowed
  // set (idle ↔ trip), or the offer token. See `shouldResettleSheet` — in particular why the
  // token is tested on its own rather than against the palier, which is the bug this fixes: a
  // sheet the driver had dragged up stayed up when the next offer arrived.
  useEffect(() => {
    const next: SheetSettleState = {
      token: collapseToken,
      snapsKey: allowedOrder.join(','),
      snap: effectiveSnap,
    };
    const previous = prevSettle.current;
    prevSettle.current = next;
    applySnapLevel(next.snap);
    if (!shouldResettleSheet(previous, next)) return;
    prevSnap.current = next.snap;
    // The palier the sheet is genuinely moving to, reported **only** here and never on the
    // redundant runs of this effect. Those runs are handed the *target*, and reporting from them
    // would overwrite the palier a drag actually landed on with the one the sheet was asked for —
    // the exact distinction the prop exists to make. A palier change always reaches this line,
    // since `snap` is part of `shouldResettleSheet`.
    onSettleRef.current?.(next.snap);
    translateY.value = withSpring(snapYShared.value[next.snap], SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applySnapLevel is local
  }, [collapseToken, allowedOrder, effectiveSnap, snapYShared, translateY]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - sceneH) > 2) {
      setSceneH(h);
    }
  };

  const buildPanGesture = useCallback(
    (pullUpOnly: boolean) =>
      Gesture.Pan()
        .activeOffsetY(pullUpOnly ? -8 : [-10, 10])
        .failOffsetX([-32, 32])
        .onStart(() => {
          context.value = { y: translateY.value };
        })
        .onUpdate((event) => {
          const order = allowedOrderShared.value;
          const collapsed = snapYShared.value[order[0]];
          const expandedKey = order.at(-1) ?? order[0];
          const expanded = snapYShared.value[expandedKey];
          const next = event.translationY + context.value.y;
          const rubberMin = expanded - 16;
          translateY.value = Math.min(collapsed, Math.max(rubberMin, next));
        })
        .onEnd((event) => {
          const order = allowedOrderShared.value;
          const points = order.map((k) => snapYShared.value[k]);
          let idx = 0;
          let best = Math.abs(translateY.value - points[0]);
          for (let i = 1; i < points.length; i++) {
            const d = Math.abs(translateY.value - points[i]);
            if (d < best) {
              best = d;
              idx = i;
            }
          }
          if (event.velocityY < -900) {
            idx = Math.min(idx + 1, points.length - 1);
          } else if (event.velocityY > 900) {
            idx = Math.max(idx - 1, 0);
          }
          const level = order[idx];
          // `true`: the drag is the one path that knows where the sheet actually ended up, so it
          // is the one that must report it. See `onSettle`.
          scheduleOnRN(applySnapLevel, level, true);
          translateY.value = withSpring(points[idx], {
            ...SPRING,
            velocity: event.velocityY,
          });
        }),
    [applySnapLevel, allowedOrderShared, context, snapYShared, translateY],
  );

  const sheetPan = useMemo(() => buildPanGesture(false), [buildPanGesture]);
  // Two instances: RNGH ties a gesture to one GestureDetector. Reusing the same Pan on the scene
  // strip and the tab bar corrupts activation (sheet stops opening until the tab bar remounts).
  const pullUpPanScene = useMemo(() => buildPanGesture(true), [buildPanGesture]);
  const pullUpPanTabBar = useMemo(() => buildPanGesture(true), [buildPanGesture]);

  useEffect(() => {
    setBottomSheetTabBarPanGesture(pullUpPanTabBar);
    return () => setBottomSheetTabBarPanGesture(null);
  }, [pullUpPanTabBar]);

  const rBottomSheetStyle = useAnimatedStyle(() => ({
    top: translateY.value,
  }));

  return (
    <View style={styles.sceneFill} pointerEvents="box-none" onLayout={onLayout}>
      <GestureDetector gesture={pullUpPanScene}>
        <View style={styles.sceneBottomDragZone} />
      </GestureDetector>
      <GestureDetector gesture={sheetPan}>
        <Animated.View style={[styles.sheet, rBottomSheetStyle]}>
          <AppChromeBackground />
          <View style={styles.handleContainer}>
            <View style={styles.line} />
          </View>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={scrollEnabled}
            bounces={scrollEnabled}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  sceneFill: {
    ...StyleSheet.absoluteFillObject,
    // Above the offer stack (30) and above every map chip, by document order *and* by this number:
    // the sheet is the one panel the driver pulls up on purpose, so nothing on the map may cover
    // it. An iOS `zIndex` alone would not settle it — Android sorts siblings by elevation — which
    // is why both fields are set. offerArrival.test.ts compares the two figures.
    zIndex: 40,
    elevation: 40,
  },
  sceneBottomDragZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCENE_BOTTOM_DRAG_ZONE,
    zIndex: 41,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -BOTTOM_EXTENSION,
    width: '100%',
    backgroundColor: APP_CHROME.surface,
    borderTopLeftRadius: SHEET_TOP_RADIUS,
    borderTopRightRadius: SHEET_TOP_RADIUS,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: APP_CHROME.edge,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 24,
  },
  handleContainer: {
    height: HANDLE_H,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  line: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
    paddingHorizontal: 24,
    paddingTop: 2,
  },
});
