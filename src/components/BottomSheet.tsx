import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';

const WINDOW_H = Dimensions.get('window').height;

/** Align with app/(tabs)/_layout.tsx tabBarStyle.height */
export const TAB_BAR_HEIGHT = 80;

const HANDLE_H = 36;

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
 * stats   — JOURNÉE + COURSES cards
 * trip    — active trip controls (swipe + addresses fully visible)
 * rides   — ride cards fully visible
 * notices — almost full (notifications / promos), small map strip on top
 */
function buildSnapY(sceneH: number) {
  const peek = HANDLE_H + 8;
  const nav = HANDLE_H + 12;
  const stats = HANDLE_H + 130;
  // Fits ActiveTripSheet (status + addresses + swipe + cancel) without crop
  const trip = HANDLE_H + 236;
  const rides = HANDLE_H + 130 + 36 + 220;
  return {
    peek: sceneH - peek,
    nav: sceneH - nav,
    stats: sceneH - stats,
    trip: sceneH - trip,
    rides: sceneH - rides,
    notices: TOP_MAP_REVEAL,
  };
}

export type SheetSnapLevel =
  | 'peek'
  | 'nav'
  | 'stats'
  | 'trip'
  | 'rides'
  | 'notices';

const SNAP_ORDER: SheetSnapLevel[] = [
  'peek',
  'nav',
  'stats',
  'trip',
  'rides',
  'notices',
];

/** Visible height of the nav snap (for HUD placement above the sheet). */
export const NAV_SHEET_VISIBLE_H = HANDLE_H + 12;

/** Visible height of the trip snap (for HUD placement above the sheet). */
export const TRIP_SHEET_VISIBLE_H = HANDLE_H + 236;

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
}

export const BottomSheet = ({
  children,
  snapLevel = 'peek',
  allowedSnaps,
}: BottomSheetProps) => {
  const [sceneH, setSceneH] = useState(WINDOW_H - TAB_BAR_HEIGHT);
  const [scrollEnabled, setScrollEnabled] = useState(snapLevel === 'notices');
  const scrollRef = useRef<ScrollView>(null);
  const snapY = buildSnapY(sceneH);

  const allowedOrder = useMemo(
    () => resolveAllowedOrder(allowedSnaps),
    [allowedSnaps],
  );

  const effectiveSnap = allowedOrder.includes(snapLevel)
    ? snapLevel
    : allowedOrder[0];

  const translateY = useSharedValue(snapY[effectiveSnap]);
  const context = useSharedValue({ y: 0 });
  const snapYShared = useSharedValue(snapY);
  const allowedOrderShared = useSharedValue(allowedOrder);
  const prevSnap = useRef<SheetSnapLevel>(effectiveSnap);
  const prevAllowedKey = useRef(allowedOrder.join(','));

  const applySnapLevel = (level: SheetSnapLevel) => {
    const atNotices = level === 'notices';
    setScrollEnabled(atNotices);
    if (!atNotices) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  };

  // Measure scene: update snap points; only re-spring if that snap's Y changed
  useEffect(() => {
    const nextSnapY = buildSnapY(sceneH);
    const level = prevSnap.current;
    const prevTarget = snapYShared.value[level];
    const nextTarget = nextSnapY[level];
    snapYShared.value = nextSnapY;
    if (Math.abs(prevTarget - nextTarget) > 1) {
      translateY.value = withSpring(nextTarget, SPRING);
    }
  }, [sceneH, snapYShared, translateY]);

  useEffect(() => {
    allowedOrderShared.value = allowedOrder;
  }, [allowedOrder, allowedOrderShared]);

  // Parent-driven snap (e.g. ride started → nav). Manual drag does not update prevSnap,
  // so we only re-spring when the prop target actually changes.
  useEffect(() => {
    applySnapLevel(effectiveSnap);
    if (prevSnap.current === effectiveSnap) return;
    prevSnap.current = effectiveSnap;
    translateY.value = withSpring(snapYShared.value[effectiveSnap], SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applySnapLevel is local
  }, [effectiveSnap, snapYShared, translateY]);

  // Allowed set changed (idle ↔ trip): force the default snap for the new mode
  useEffect(() => {
    const key = allowedOrder.join(',');
    if (prevAllowedKey.current === key) return;
    prevAllowedKey.current = key;
    prevSnap.current = effectiveSnap;
    applySnapLevel(effectiveSnap);
    translateY.value = withSpring(snapYShared.value[effectiveSnap], SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applySnapLevel is local
  }, [allowedOrder, effectiveSnap, snapYShared, translateY]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - sceneH) > 2) {
      setSceneH(h);
    }
  };

  const sheetPan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-28, 28])
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
      scheduleOnRN(applySnapLevel, level);
      translateY.value = withSpring(points[idx], {
        ...SPRING,
        velocity: event.velocityY,
      });
    });

  const rBottomSheetStyle = useAnimatedStyle(() => ({
    top: translateY.value,
  }));

  return (
    <View style={styles.sceneFill} pointerEvents="box-none" onLayout={onLayout}>
      <GestureDetector gesture={sheetPan}>
        <Animated.View style={[styles.sheet, rBottomSheetStyle]}>
          <LinearGradient
            colors={['#171717', '#1f1f1f']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
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
    // Above map GPS HUDs so a raised sheet covers maneuver / arrival chips
    zIndex: 40,
    elevation: 40,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -BOTTOM_EXTENSION,
    width: '100%',
    backgroundColor: '#171717',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
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
    justifyContent: 'center',
  },
  line: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
});
