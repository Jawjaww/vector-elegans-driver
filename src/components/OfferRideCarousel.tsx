import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Dimensions,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ride, useDriverStore } from '../lib/stores/driverStore';
import {
  OFFER_STACK_LIFT_CAP,
  offerStackExtraHeight,
  offerStackPeekX,
  offerStackPeekY,
  offerStackRestStyle,
  offerStackScale,
  visibleOfferStack,
} from '../lib/utils/offerCarousel';
import {
  computeOfferCardLayout,
  OFFER_CARD_BOTTOM_NUDGE,
  OFFER_CARD_SHEET_GAP,
} from '../lib/utils/offerCardLayout';
import { useOfferDismissGesture } from '../hooks/useOfferDismissGesture';
import { NAV_SHEET_VISIBLE_H } from './BottomSheet';
import { OfferRideCard, OFFER_CARD_WIDTH } from './OfferRideCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OfferRideCarouselProps {
  rides: Ride[];
  chromeVisible?: boolean;
  onActiveIndexChange?: (index: number) => void;
  onOverlayHeightChange?: (height: number) => void;
  onAcceptRide: (rideId: string) => void;
  onDeclineRide: (rideId: string, reason?: 'declined' | 'timeout') => void;
}

function OfferStackLayer({
  ride,
  depth,
  isFront,
  canCycle,
  stackCardLeft,
  cardWidth,
  layout,
  chromeVisible,
  dragProgress,
  onCycle,
  onAccept,
  onDecline,
  onTimeout,
}: Readonly<{
  ride: Ride;
  depth: number;
  isFront: boolean;
  canCycle: boolean;
  stackCardLeft: number;
  cardWidth: number;
  layout: ReturnType<typeof computeOfferCardLayout>;
  chromeVisible: boolean;
  dragProgress: SharedValue<number>;
  onCycle: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onTimeout: () => void;
}>) {
  const restStyle = offerStackRestStyle(depth, stackCardLeft);
  const restScale = offerStackScale(depth);
  const peekX = offerStackPeekX(depth);
  const peekY = offerStackPeekY(depth);

  const { animatedStyle, panGesture } = useOfferDismissGesture({
    enabled: isFront && canCycle,
    rideId: ride.id,
    onCycle,
    dragProgress,
  });

  const liftStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, dragProgress.value));
    return {
      transform: [
        { translateX: -peekX * p * OFFER_STACK_LIFT_CAP },
        { translateY: -peekY * p * OFFER_STACK_LIFT_CAP },
        { scale: restScale },
      ],
    };
  });

  const card = (
    <OfferRideCard
      ride={ride}
      cardWidth={cardWidth}
      layout={layout}
      isActive={isFront}
      chromeVisible={chromeVisible}
      nextPeek={null}
      onAccept={onAccept}
      onDecline={onDecline}
      onTimeout={onTimeout}
    />
  );

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        collapsable={false}
        pointerEvents={isFront ? 'auto' : 'none'}
        style={[
          styles.layer,
          restStyle,
          isFront ? animatedStyle : liftStyle,
        ]}
      >
        {card}
      </Animated.View>
    </GestureDetector>
  );
}

export function OfferRideCarousel({
  rides,
  chromeVisible = true,
  onActiveIndexChange,
  onOverlayHeightChange,
  onAcceptRide,
  onDeclineRide,
}: Readonly<OfferRideCarouselProps>) {
  const insets = useSafeAreaInsets();
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  const cycleAvailableRideToBack = useDriverStore(
    (s) => s.cycleAvailableRideToBack,
  );
  const dragProgress = useSharedValue(0);
  const frontRideId = rides[0]?.id ?? null;
  const canCycle = rides.length >= 2;

  const cardLayout = useMemo(
    () => computeOfferCardLayout(Dimensions.get('window').height, insets),
    [insets.bottom, insets.top],
  );

  const visibleRides = useMemo(() => visibleOfferStack(rides), [rides]);
  const stackExtra = offerStackExtraHeight(visibleRides.length);
  const stackCardLeft = (SCREEN_WIDTH - OFFER_CARD_WIDTH) / 2;
  const sheetClearance =
    NAV_SHEET_VISIBLE_H + OFFER_CARD_SHEET_GAP - OFFER_CARD_BOTTOM_NUDGE;

  useEffect(() => {
    onActiveIndexChangeRef.current = onActiveIndexChange;
  }, [onActiveIndexChange]);

  useEffect(() => {
    onActiveIndexChangeRef.current?.(0);
  }, [frontRideId]);

  const handleDecline = useCallback(
    (rideId: string, reason?: 'declined' | 'timeout') => {
      onDeclineRide(rideId, reason);
    },
    [onDeclineRide],
  );

  const handleStackLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const h = event.nativeEvent.layout.height;
      if (h > 0) {
        onOverlayHeightChange?.(h + sheetClearance);
      }
    },
    [onOverlayHeightChange, sheetClearance],
  );

  if (rides.length === 0) return null;

  // Rear → front so the swipable card paints above the deck.
  const layers = [...visibleRides]
    .map((item, index) => ({ item, depth: index }))
    .reverse();

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View
        style={[styles.container, { paddingBottom: sheetClearance }]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.stack,
            { height: cardLayout.maxCardHeight + stackExtra },
          ]}
          onLayout={handleStackLayout}
          pointerEvents="box-none"
        >
          {layers.map(({ item, depth }) => (
            <OfferStackLayer
              key={item.id}
              ride={item}
              depth={depth}
              isFront={depth === 0}
              canCycle={canCycle}
              stackCardLeft={stackCardLeft}
              cardWidth={OFFER_CARD_WIDTH}
              layout={cardLayout}
              chromeVisible={chromeVisible}
              dragProgress={dragProgress}
              onCycle={cycleAvailableRideToBack}
              onAccept={() => onAcceptRide(item.id)}
              onDecline={() => handleDecline(item.id, 'declined')}
              onTimeout={() => handleDecline(item.id, 'timeout')}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
    overflow: 'visible',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'visible',
  },
  stack: {
    width: SCREEN_WIDTH,
    position: 'relative',
    overflow: 'visible',
  },
  layer: {
    position: 'absolute',
    width: OFFER_CARD_WIDTH,
  },
});

export default OfferRideCarousel;
