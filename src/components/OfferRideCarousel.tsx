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
  OFFER_STACK_VISIBLE_MAX,
  offerStackExtraHeight,
  offerStackPeekX,
  offerStackPeekY,
  offerStackRestStyle,
  offerStackScale,
  visibleOfferStack,
} from '../lib/utils/offerCarousel';
import {
  computeOfferCardLayout,
  offerDeckClearance,
} from '../lib/utils/offerCardLayout';
import { useOfferDismissGesture } from '../hooks/useOfferDismissGesture';
import { logOfferStage } from '../lib/notifications/offerPipelineDiag';
import type { ProvisionalOffer } from '../lib/stores/driverStore';
import { NAV_SHEET_VISIBLE_H } from './BottomSheet';
import { OfferRideCard, OFFER_CARD_WIDTH } from './OfferRideCard';
import { ProvisionalOfferCard } from './ProvisionalOfferCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Ride ids whose first on-screen layout has already been recorded.
 *
 * Module scope, not a ref: the carousel is unmounted and remounted when the dashboard boot
 * resolves, and a ref would then log a second "first paint" for the same ride. Only the
 * first paint is the latency the driver experiences. Bounded because a session only ever
 * sees a handful of offers.
 */
const paintedRideIds = new Set<string>();
const MAX_PAINTED_TRACKED = 20;

interface OfferRideCarouselProps {
  rides: Ride[];
  /**
   * Card painted from the notification payload while the ride is still being read. Sits in
   * front of the deck and does not join it: it has no coordinates, no status and no TTL.
   */
  provisional?: ProvisionalOffer | null;
  /** Disable entry motion on the cards (notification arrival). */
  instantEntry?: boolean;
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
  stackExtra,
  cardWidth,
  layout,
  chromeVisible,
  dragProgress,
  onCycle,
  onAccept,
  onDecline,
  onTimeout,
  instantEntry,
}: Readonly<{
  ride: Ride;
  depth: number;
  isFront: boolean;
  canCycle: boolean;
  stackCardLeft: number;
  stackExtra: number;
  cardWidth: number;
  layout: ReturnType<typeof computeOfferCardLayout>;
  chromeVisible: boolean;
  dragProgress: SharedValue<number>;
  onCycle: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onTimeout: () => void;
  instantEntry: boolean;
}>) {
  const restStyle = offerStackRestStyle(depth, stackCardLeft, stackExtra);
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
      instantEntry={instantEntry}
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
  provisional = null,
  instantEntry = false,
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
  // The provisional card is what is on screen when it exists: it is the ride the driver just
  // tapped, and the deck behind it is not yet the subject.
  const hasProvisional = provisional !== null;
  const depthOffset = hasProvisional ? 1 : 0;
  const frontRideId = provisional?.rideId ?? rides[0]?.id ?? null;
  const canCycle = rides.length >= 2;

  const cardLayout = useMemo(
    () => computeOfferCardLayout(Dimensions.get('window').height, insets),
    [insets.bottom, insets.top],
  );

  // The provisional card occupies the front slot, so one fewer real card fits in the deck.
  const visibleRides = useMemo(
    () =>
      visibleOfferStack(
        rides,
        hasProvisional ? OFFER_STACK_VISIBLE_MAX - 1 : OFFER_STACK_VISIBLE_MAX,
      ),
    [rides, hasProvisional],
  );
  const deckSize = visibleRides.length + depthOffset;
  const stackExtra = offerStackExtraHeight(deckSize);
  const stackCardLeft = (SCREEN_WIDTH - OFFER_CARD_WIDTH) / 2;
  const sheetClearance = offerDeckClearance(NAV_SHEET_VISIBLE_H, deckSize);

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
        // The offer layer now has a non-zero size on screen. This is the boundary that
        // separates "the ride is in the store" from "the driver can see it" — the gap the
        // boot gate and the entry animations used to hide.
        if (frontRideId && !paintedRideIds.has(frontRideId)) {
          if (paintedRideIds.size >= MAX_PAINTED_TRACKED) paintedRideIds.clear();
          paintedRideIds.add(frontRideId);
          logOfferStage(
            'offer_painted',
            { source: instantEntry ? 'notification' : 'in_app', provisional: hasProvisional },
            frontRideId,
          );
        }
      }
    },
    [onOverlayHeightChange, sheetClearance, frontRideId, instantEntry, hasProvisional],
  );

  if (rides.length === 0 && !provisional) return null;

  // Rear → front so the swipable card paints above the deck.
  const layers = [...visibleRides]
    .map((item, index) => ({ item, depth: index + depthOffset }))
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
              stackExtra={stackExtra}
              cardWidth={OFFER_CARD_WIDTH}
              layout={cardLayout}
              chromeVisible={chromeVisible}
              dragProgress={dragProgress}
              onCycle={cycleAvailableRideToBack}
              onAccept={() => onAcceptRide(item.id)}
              onDecline={() => handleDecline(item.id, 'declined')}
              onTimeout={() => handleDecline(item.id, 'timeout')}
              instantEntry={instantEntry}
            />
          ))}
          {provisional ? (
            <View
              key={provisional.rideId}
              style={[
                styles.layer,
                offerStackRestStyle(0, stackCardLeft, stackExtra),
              ]}
              pointerEvents="box-none"
            >
              <ProvisionalOfferCard
                preview={provisional}
                cardWidth={OFFER_CARD_WIDTH}
                layout={cardLayout}
                onAccept={() => onAcceptRide(provisional.rideId)}
              />
            </View>
          ) : null}
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
