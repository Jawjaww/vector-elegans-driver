import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, Modal, Dimensions, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';

import { useDriverStore, Ride } from '../lib/stores/driverStore';
import { NeonSwipeButton } from './NeonSwipeButton';
import { NeonProgress } from './NeonProgress';
import { RideOfferExtras } from './RideOfferExtras';
import {
  resolveRideTripMetrics,
  formatPickupDateTime,
  formatMinutesCompact,
  haversineKm,
} from '../lib/utils/rideMetrics';

import Svg, { Path } from 'react-native-svg';

const COUNTDOWN_SECONDS = 20;
const SCRIM = 'rgba(0,0,0,0.8)';
const MAP_HOLE_RADIUS = 12;
const { width, height } = Dimensions.get('window');

export type MapViewportHole = { x: number; y: number; w: number; h: number };

/** Map hole: square top (flush under price header), rounded bottom only. */
function mapHolePath(
  x: number,
  y: number,
  w: number,
  h: number,
  bottomRadius: number,
): string {
  const rr = Math.min(bottomRadius, w / 2, h / 2);
  return [
    `M${x},${y}`,
    `H${x + w}`,
    `V${y + h - rr}`,
    `A${rr},${rr} 0 0 1 ${x + w - rr},${y + h}`,
    `H${x + rr}`,
    `A${rr},${rr} 0 0 1 ${x},${y + h - rr}`,
    'Z',
  ].join(' ');
}

/** Scrim with map viewport hole — home map shows through (bottom corners only). */
function MapHoleScrim({ hole }: Readonly<{ hole: MapViewportHole | null }>) {
  if (!hole) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]} />;
  }
  const outer = `M0,0 H${width} V${height} H0 Z`;
  const inner = mapHolePath(hole.x, hole.y, hole.w, hole.h, MAP_HOLE_RADIUS);
  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      <Path d={`${outer} ${inner}`} fill={SCRIM} fillRule="evenodd" />
    </Svg>
  );
}

const RentabilityBadge = ({ distance, price }: { distance: number; price: number }) => {
  const perKm = distance > 0 ? price / distance : 0;
  if (perKm >= 2.5) {
    return (
      <View style={[styles.badgeContainer, { backgroundColor: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.3)' }]}>
        <Feather name="trending-up" size={16} color="#34d399" />
      </View>
    );
  }
  if (perKm >= 1.5) {
    return (
      <View style={[styles.badgeContainer, { backgroundColor: 'rgba(251, 191, 36, 0.1)', borderColor: 'rgba(251, 191, 36, 0.3)' }]}>
        <Feather name="zap" size={16} color="#fbbf24" />
      </View>
    );
  }
  return (
    <View style={[styles.badgeContainer, { backgroundColor: 'rgba(148, 163, 184, 0.1)', borderColor: 'rgba(148, 163, 184, 0.3)' }]}>
      <Feather name="minus" size={16} color="#94a3b8" />
    </View>
  );
};

interface FullscreenRideModalProps {
  ride?: Ride;
  isActive?: boolean;
  chromeVisible?: boolean;
  onMapViewportLayout?: (hole: MapViewportHole) => void;
  onAccept: () => void;
  onDecline: () => void;
  onTimeout?: () => void;
}

const formatPrice = (price: number | null) => {
  if (price == null || !Number.isFinite(price)) return 'N/A';
  if (price >= 1000) return `${price.toFixed(0)} €`;
  return `${price.toFixed(2)} €`;
};

function formatTripDistanceLabel(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '—';
  if (km >= 100) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}

/**
 * Offer modal card — warm home WebView visible through the map viewport hole.
 */
export const FullscreenRideModal = ({
  ride,
  isActive = true,
  chromeVisible = false,
  onMapViewportLayout,
  onAccept,
  onDecline,
  onTimeout,
}: FullscreenRideModalProps) => {
  const { t } = useTranslation();
  const { availableRide, currentLocation } = useDriverStore();
  const currentRide = ride || availableRide;
  const insets = useSafeAreaInsets();
  const [startKey, setStartKey] = useState(Date.now());
  const [mapHole, setMapHole] = useState<MapViewportHole | null>(null);
  const mapViewportRef = useRef<View>(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const measureMapHole = useCallback(() => {
    const publish = () => {
      mapViewportRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) {
          const hole = { x, y, w, h };
          setMapHole(hole);
          onMapViewportLayout?.(hole);
        }
      });
    };
    publish();
    // Second pass after modal layout settles (padding / safe area).
    requestAnimationFrame(publish);
  }, [onMapViewportLayout]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const translationX = event.translationX;
      const translationY = event.translationY;
      const velocityX = event.velocityX;
      const velocityY = event.velocityY;

      const distance = Math.hypot(translationX, translationY);
      const screenDiagonal = Math.hypot(width, height);

      if (
        distance > screenDiagonal * 0.2 ||
        Math.abs(velocityX) > 800 ||
        Math.abs(velocityY) > 800
      ) {
        const exitDistance = screenDiagonal * 1.5;
        const magnitude = Math.hypot(translationX, translationY) || 1;
        const dirX = translationX / magnitude;
        const dirY = translationY / magnitude;

        let targetX: number;
        let targetY: number;

        if (
          magnitude < 10 &&
          (Math.abs(velocityX) > 100 || Math.abs(velocityY) > 100)
        ) {
          const vMag = Math.hypot(velocityX, velocityY);
          targetX = (velocityX / vMag) * exitDistance;
          targetY = (velocityY / vMag) * exitDistance;
        } else {
          targetX = dirX * exitDistance;
          targetY = dirY * exitDistance;
        }

        translateX.value = withSpring(targetX, {
          damping: 20,
          stiffness: 100,
          velocity: velocityX,
        });
        translateY.value = withSpring(targetY, {
          damping: 20,
          stiffness: 100,
          velocity: velocityY,
        });

        setTimeout(() => {
          if (onTimeout) onTimeout();
          else onDecline();
        }, 200);
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    })
    .runOnJS(true);

  useEffect(() => {
    if (currentRide) {
      setStartKey(Date.now());
      translateX.value = 0;
      translateY.value = 0;
      setMapHole(null);
    }
  }, [currentRide?.id]);

  useEffect(() => {
    const t1 = setTimeout(measureMapHole, 50);
    const t2 = setTimeout(measureMapHole, 220);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [currentRide?.id, chromeVisible, measureMapHole]);

  if (!currentRide || !isActive) return null;

  const driverDistKm = currentLocation
    ? haversineKm(
        currentLocation.lat,
        currentLocation.lng,
        currentRide.pickup_lat,
        currentRide.pickup_lon,
      )
    : 0;
  const approachSpeedKmh = driverDistKm > 40 ? 70 : 30;
  const driverTimeMin =
    driverDistKm > 0 ? (driverDistKm / approachSpeedKmh) * 60 : 0;

  const tripMetrics = resolveRideTripMetrics(currentRide);
  const tripDistKm = tripMetrics.distanceKm;
  const tripTimeMin = tripMetrics.durationMin;
  const pickupWhen = formatPickupDateTime(currentRide.pickup_time);
  const offerPrice =
    (currentRide.estimated_price || 0) +
    Number(currentRide.client_incentive ?? 0);

  return (
    <Modal
      visible={!!currentRide}
      transparent
      animationType="none"
      onRequestClose={() => {
        if (onTimeout) onTimeout();
        else onDecline();
      }}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          <MapHoleScrim hole={mapHole} />

          <GestureDetector gesture={panGesture}>
            <Animated.View
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(300)}
              style={[
                styles.modalContent,
                {
                  marginTop: insets.top + 10,
                  marginBottom: insets.bottom + 10,
                  maxHeight: height - (insets.top + insets.bottom + 20),
                },
                animatedStyle,
              ]}
            >
              <View style={styles.contentContainer}>
                <View style={styles.progressContainer}>
                  <NeonProgress
                    durationMs={COUNTDOWN_SECONDS * 1000}
                    startKey={startKey}
                    onExpire={onTimeout || onDecline}
                  />
                </View>

                {chromeVisible ? (
                  <Animated.View
                    entering={FadeInDown.duration(220).delay(0)}
                    style={styles.approachContainer}
                  >
                    <LinearGradient
                      colors={['rgba(255, 237, 213, 1)', 'rgba(255, 255, 255, 1)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.approachContent}>
                      <Text style={styles.approachLabel}>{t('ride.approach')}</Text>
                      <Text style={styles.approachText} numberOfLines={1}>
                        {driverDistKm > 0
                          ? `${formatMinutesCompact(driverTimeMin)} · ${formatTripDistanceLabel(driverDistKm)}`
                          : 'Position…'}
                      </Text>
                    </View>
                  </Animated.View>
                ) : (
                  <View style={styles.approachPlaceholder} />
                )}

                <View style={styles.cardContainer}>
                  {chromeVisible ? (
                    <Animated.View
                      entering={FadeInDown.duration(220).delay(80)}
                      style={styles.cardHeader}
                    >
                      <LinearGradient
                        colors={[
                          'rgba(216, 251, 233, 0.98)',
                          'rgba(242, 251, 247, 0.92)',
                        ]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.headerContent}>
                        <View style={styles.priceContainer}>
                          <Text
                            style={[
                              styles.priceText,
                              offerPrice >= 1000 && styles.priceTextCompact,
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                          >
                            {formatPrice(offerPrice)}
                          </Text>
                          {Number(currentRide.client_incentive ?? 0) > 0 ? (
                            <Text style={styles.bonusText} numberOfLines={1}>
                              +{Number(currentRide.client_incentive).toFixed(0)}€
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.separator}>·</Text>
                        <Text style={styles.tripText} numberOfLines={1}>
                          {formatTripDistanceLabel(tripDistKm)} ·{' '}
                          {formatMinutesCompact(tripTimeMin)}
                        </Text>
                        <View style={styles.rentabilityBadgeInline}>
                          <RentabilityBadge
                            distance={tripDistKm}
                            price={offerPrice}
                          />
                        </View>
                      </View>
                    </Animated.View>
                  ) : (
                    <View style={styles.headerPlaceholder} />
                  )}

                  <View
                    ref={mapViewportRef}
                    style={styles.mapContainer}
                    pointerEvents="box-none"
                    onLayout={measureMapHole}
                  >
                    {chromeVisible ? (
                      <Animated.View
                        entering={FadeIn.duration(220).delay(140)}
                        style={styles.addressOverlay}
                        pointerEvents="box-none"
                      >
                        <RideOfferExtras
                          options={currentRide.options}
                          vehicleType={currentRide.vehicle_type}
                        />
                        {pickupWhen ? (
                          <View style={styles.pickupTimePill}>
                            <Feather name="clock" size={13} color="#b45309" />
                            <Text
                              style={styles.pickupTimePillText}
                              numberOfLines={1}
                            >
                              {pickupWhen}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.addressPill}>
                          <Feather name="map-pin" size={14} color="#94a3b8" />
                          <Text style={styles.addressText} numberOfLines={1}>
                            {t('ride.pickupLabel')} : {currentRide.pickup_address}
                          </Text>
                        </View>
                        <View style={styles.addressPill}>
                          <Feather name="flag" size={14} color="#10b981" />
                          <Text
                            style={[styles.addressText, styles.dropoffText]}
                            numberOfLines={1}
                          >
                            {t('ride.dropoffLabel')} :{' '}
                            {currentRide.dropoff_address}
                          </Text>
                        </View>
                      </Animated.View>
                    ) : null}
                  </View>
                </View>

                {chromeVisible ? (
                  <Animated.View
                    entering={FadeInDown.duration(220).delay(200)}
                    style={styles.actionsContainer}
                  >
                    <View style={styles.swipeButtonWrapper}>
                      <NeonSwipeButton onConfirm={onAccept} />
                    </View>
                    <TouchableOpacity
                      onPress={onDecline}
                      style={styles.declineButton}
                    >
                      <Text style={styles.declineText}>{t('ride.decline')}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                ) : (
                  <View style={styles.actionsPlaceholder} />
                )}
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 2,
  },
  contentContainer: {
    padding: 24,
    gap: 16,
    zIndex: 10,
  },
  progressContainer: {
    width: '100%',
    height: 12,
    justifyContent: 'center',
    backgroundColor: SCRIM,
    borderRadius: 6,
  },
  approachContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    height: 36,
    marginBottom: 8,
  },
  approachPlaceholder: {
    height: 36,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: SCRIM,
  },
  approachContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  approachLabel: {
    color: '#ea580c',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  approachText: {
    flex: 1,
    color: '#c2410c',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  cardContainer: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'transparent',
    borderBottomLeftRadius: MAP_HOLE_RADIUS,
    borderBottomRightRadius: MAP_HOLE_RADIUS,
  },
  cardHeader: {
    minHeight: 48,
    position: 'relative',
    paddingVertical: 8,
  },
  headerPlaceholder: {
    minHeight: 48,
    backgroundColor: SCRIM,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  priceContainer: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    maxWidth: '48%',
  },
  priceText: {
    color: '#065f46',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  priceTextCompact: {
    fontSize: 15,
  },
  bonusText: {
    color: '#b45309',
    fontSize: 10,
    fontWeight: '700',
  },
  separator: {
    color: '#065f46',
    fontSize: 14,
    opacity: 0.45,
  },
  tripText: {
    flex: 1,
    flexShrink: 1,
    color: '#065f46',
    fontSize: 13,
    fontWeight: '600',
  },
  rentabilityBadgeInline: {
    marginLeft: 2,
    flexShrink: 0,
  },
  mapContainer: {
    height: 410,
    position: 'relative',
    marginTop: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderBottomLeftRadius: MAP_HOLE_RADIUS,
    borderBottomRightRadius: MAP_HOLE_RADIUS,
  },
  addressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 4,
    gap: 4,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    gap: 8,
  },
  pickupTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 247, 237, 0.96)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
    gap: 6,
  },
  pickupTimePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },
  addressText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  dropoffText: {
    fontWeight: 'bold',
    color: '#0f172a',
  },
  actionsContainer: {
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  actionsPlaceholder: {
    height: 72,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: SCRIM,
  },
  swipeButtonWrapper: {
    width: '100%',
  },
  declineButton: {
    padding: 8,
    opacity: 0.8,
  },
  declineText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
});
