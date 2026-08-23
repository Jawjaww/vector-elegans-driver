import React, { useEffect, useRef, useState } from 'react';
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
 * stats   — JOURNÉE + COURSES cards
 * rides   — ride cards fully visible
 * notices — almost full (notifications / promos), small map strip on top
 */
function buildSnapY(sceneH: number) {
  const peek = HANDLE_H + 8;
  const stats = HANDLE_H + 130;
  const rides = HANDLE_H + 130 + 36 + 220;
  return {
    peek: sceneH - peek,
    stats: sceneH - stats,
    rides: sceneH - rides,
    notices: TOP_MAP_REVEAL,
  };
}

export type SheetSnapLevel = 'peek' | 'stats' | 'rides' | 'notices';

const SNAP_ORDER: SheetSnapLevel[] = ['peek', 'stats', 'rides', 'notices'];
const NOTICES_IDX = SNAP_ORDER.length - 1;

interface BottomSheetProps {
  children: React.ReactNode;
  snapLevel?: SheetSnapLevel;
}

export const BottomSheet = ({
  children,
  snapLevel = 'peek',
}: BottomSheetProps) => {
  const [sceneH, setSceneH] = useState(WINDOW_H - TAB_BAR_HEIGHT);
  const [scrollEnabled, setScrollEnabled] = useState(snapLevel === 'notices');
  const scrollRef = useRef<ScrollView>(null);
  const snapY = buildSnapY(sceneH);

  const translateY = useSharedValue(snapY[snapLevel]);
  const context = useSharedValue({ y: 0 });
  const snapYShared = useSharedValue(snapY);
  const snapIdxShared = useSharedValue(SNAP_ORDER.indexOf(snapLevel));
  const prevSnap = useRef<SheetSnapLevel>(snapLevel);

  const applySnapIndex = (idx: number) => {
    const atNotices = idx === NOTICES_IDX;
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
    const idx = SNAP_ORDER.indexOf(snapLevel);
    snapIdxShared.value = idx;
    applySnapIndex(idx);
    if (prevSnap.current === snapLevel) return;
    prevSnap.current = snapLevel;
    translateY.value = withSpring(snapYShared.value[snapLevel], SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applySnapIndex is stable enough for snapLevel sync
  }, [snapLevel, snapIdxShared, translateY, snapYShared]);

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
      const minY = snapYShared.value.notices;
      const maxY = snapYShared.value.peek;
      const next = event.translationY + context.value.y;
      const rubberMin = minY - 16;
      translateY.value = Math.min(maxY, Math.max(rubberMin, next));
    })
    .onEnd((event) => {
      const points = SNAP_ORDER.map((k) => snapYShared.value[k]);
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
      snapIdxShared.value = idx;
      scheduleOnRN(applySnapIndex, idx);
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
    elevation: 16,
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
