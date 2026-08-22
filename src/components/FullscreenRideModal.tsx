import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, Text, Modal, Dimensions, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, {
  FadeIn,
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
import { VTCMap } from '../map';
import {
  resolveRideTripMetrics,
  formatPickupDateTime,
} from '../lib/utils/rideMetrics';

const COUNTDOWN_SECONDS = 20;
const { width, height } = Dimensions.get('window');

// Rentability Badge Component (icône seulement)
const RentabilityBadge = ({ distance, price }: { distance: number; price: number }) => {
  const perKm = distance > 0 ? price / distance : 0;
  
  if (perKm >= 2.5) {
    return (
      <View style={[styles.badgeContainer, { backgroundColor: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.3)' }]}>
        <Feather name="trending-up" size={16} color="#34d399" />
      </View>
    );
  } else if (perKm >= 1.5) {
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
  onAccept: () => void;
  onDecline: () => void;
  onTimeout?: () => void;
}

// Helper for formatting
const formatPrice = (price: number | null) => {
  return price ? `${price.toFixed(2)} €` : 'N/A';
};

const formatDuration = (minutes: number | null) => {
  return minutes ? `${Math.round(minutes)} min` : 'N/A';
};

// Helper to calculate distance between two points (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

export const FullscreenRideModal = ({ ride, isActive = true, onAccept, onDecline, onTimeout }: FullscreenRideModalProps) => {
  const { t } = useTranslation();
  const { availableRide, currentLocation } = useDriverStore();
  const currentRide = ride || availableRide;
  
  // Memoize map route endpoints (avoid re-renders from unrelated location ticks)
  const mapStart = useMemo(
    () =>
      currentRide
        ? { lat: currentRide.pickup_lat, lng: currentRide.pickup_lon }
        : undefined,
    [currentRide?.pickup_lat, currentRide?.pickup_lon],
  );
  const mapEnd = useMemo(
    () =>
      currentRide
        ? { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lon }
        : undefined,
    [currentRide?.dropoff_lat, currentRide?.dropoff_lon],
  );
  const mapApproach = useMemo(() => {
    if (!currentLocation) return undefined;
    // Coarse quantize (~50 m) — avoid thrashing OSRM / WebGL in the offer modal
    return {
      lat: Math.round(currentLocation.lat * 2e3) / 2e3,
      lng: Math.round(currentLocation.lng * 2e3) / 2e3,
    };
  }, [currentLocation?.lat, currentLocation?.lng]);
  const insets = useSafeAreaInsets();
  
  const [mapReady, setMapReady] = useState(false);
  const [startKey, setStartKey] = useState(Date.now());
  
  // Animation values for modern drag-to-dismiss
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Animated style for modern drag effect
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
          // Swipe-away = defer to bottomsheet (same as timeout), not hard refuse
          if (onTimeout) onTimeout();
          else onDecline();
        }, 200);
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    })
    .runOnJS(true);

  // Reset when a new ride appears
  useEffect(() => {
    if (currentRide) {
      setStartKey(Date.now());
      setMapReady(false);
      translateX.value = 0;
      translateY.value = 0;
    }
  }, [currentRide?.id]);

  if (!currentRide) return null;

  // Calculate approach info locally since we don't have the API hook yet
  const driverDistKm = currentLocation 
    ? calculateDistance(currentLocation.lat, currentLocation.lng, currentRide.pickup_lat, currentRide.pickup_lon)
    : 0;
  
  // Assume 30km/h average speed in city for approach time
  const driverTimeMin = driverDistKm > 0 ? (driverDistKm / 30) * 60 : 0;

  const tripMetrics = resolveRideTripMetrics(currentRide);
  const tripDistKm = tripMetrics.distanceKm;
  const tripTimeMin = tripMetrics.durationMin;
  const pickupWhen = formatPickupDateTime(currentRide.pickup_time);

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
          <GestureDetector gesture={panGesture}>
            <Animated.View 
              entering={FadeIn.duration(300)} 
              exiting={FadeOut.duration(300)}
              style={[
                styles.modalContent, 
                { 
                  marginTop: insets.top + 10, 
                  marginBottom: insets.bottom + 10,
                  maxHeight: height - (insets.top + insets.bottom + 20)
                },
                animatedStyle
              ]}
            >
          <View style={styles.contentContainer}>
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <NeonProgress
                durationMs={COUNTDOWN_SECONDS * 1000}
                startKey={startKey}
                onExpire={onTimeout || onDecline}
              />
            </View>

            {/* Approach Info */}
            <View style={styles.approachContainer}>
              <LinearGradient
                colors={['rgba(255, 237, 213, 1)', 'rgba(255, 255, 255, 1)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.approachContent}>
                <Feather name="alert-circle" size={20} color="#FF8C00" />
                <Text style={styles.approachText}>
                  APPROCHE ({formatDuration(driverTimeMin)} · {driverDistKm.toFixed(1)} km)
                </Text>
              </View>
            </View>

            {/* Main Card (Price + Map) */}
            <View style={styles.cardContainer}>
              {/* Header: Price & Trip Info */}
              <View style={styles.cardHeader}>
                <LinearGradient
                  colors={['rgba(216, 251, 233, 0.98)', 'rgba(242, 251, 247, 0.92)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.headerContent}>
                  <View style={styles.priceContainer}>
                    <Text style={styles.priceText}>
                      {formatPrice(currentRide.estimated_price)}
                    </Text>
                    {/* Badge de rentabilité à droite du prix quand excellent */}
                    {(currentRide.estimated_price || 0) / (tripDistKm || 1) >= 2.5 && (
                      <View style={styles.rentabilityBadgeInline}>
                        <RentabilityBadge 
                          distance={tripDistKm} 
                          price={currentRide.estimated_price || 0} 
                        />
                      </View>
                    )}
                  </View>
                  <Text style={styles.separator}>|</Text>
                  <Text style={styles.tripText}>
                    {tripDistKm < 10
                      ? tripDistKm.toFixed(1)
                      : Math.round(tripDistKm)}{" "}
                    km · {Math.max(1, Math.round(tripTimeMin))} min
                  </Text>
                  {/* Badge de rentabilité dans le coin droit pour les autres cas */}
                  {(currentRide.estimated_price || 0) / (tripDistKm || 1) < 2.5 && (
                    <View style={styles.rentabilityBadgeContainer}>
                      <RentabilityBadge 
                        distance={tripDistKm} 
                        price={currentRide.estimated_price || 0} 
                      />
                    </View>
                  )}
                </View>
              </View>

              {/* Map Area — MapLibre WebView (works in Expo Go) */}
              <View style={styles.mapContainer}>
                <VTCMap
                  style={StyleSheet.absoluteFill}
                  start={mapStart}
                  end={mapEnd}
                  approachFrom={mapApproach}
                  showRoute
                  followUser={false}
                  routeFitPaddingBottom={120}
                  prefetchConfig={{
                    enabled: false,
                    aggressiveMode: false,
                    debugMode: false,
                  }}
                  onMapReady={() => setMapReady(true)}
                />

                <View style={styles.addressOverlay} pointerEvents="box-none">
                  <RideOfferExtras
                    options={currentRide.options}
                    vehicleType={currentRide.vehicle_type}
                  />
                  {pickupWhen ? (
                    <View style={styles.pickupTimePill}>
                      <Feather name="clock" size={13} color="#b45309" />
                      <Text style={styles.pickupTimePillText} numberOfLines={1}>
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
                    <Text style={[styles.addressText, styles.dropoffText]} numberOfLines={1}>
                      {t('ride.dropoffLabel')} : {currentRide.dropoff_address}
                    </Text>
                  </View>
                </View>

                {!mapReady && (
                  <View style={styles.mapLoadingOverlay} pointerEvents="none">
                    <View style={styles.spinner} />
                    <Text style={styles.loadingText}>{t('ride.loadingRoutes')}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsContainer}>
              <View style={styles.swipeButtonWrapper}>
                <NeonSwipeButton onConfirm={onAccept} />
              </View>
              
              <TouchableOpacity onPress={onDecline} style={styles.declineButton}>
                <Text style={styles.declineText}>{t('ride.decline')}</Text>
              </TouchableOpacity>
            </View>

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
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    // Background et bordures supprimés pour éviter l'effet "parasite"
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.25,
    shadowRadius: 60,
    elevation: 24,
  },
  // glassOverlay supprimé
  contentContainer: {
    padding: 24,
    gap: 16,
    zIndex: 10,
  },
  progressContainer: {
    width: '100%',
    height: 12,
    justifyContent: 'center',
  },
  approachContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    height: 44,
    marginBottom: 12,
  },
  approachContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  approachText: {
    color: '#FF6B00',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardContainer: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    height: 50,
    position: 'relative',
    paddingVertical: 8,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    color: '#065f46',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  separator: {
    color: '#065f46',
    fontSize: 18,
    opacity: 0.5,
  },
  tripText: {
    color: '#065f46',
    fontSize: 16,
    fontWeight: '500',
  },
  rentabilityBadgeContainer: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -12 }],
    zIndex: 10,
  },
  rentabilityBadgeInline: {
    marginLeft: 2,
  },
  mapContainer: {
    height: 410,
    position: 'relative',
    marginTop: 0,
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
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  spinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#cbd5e1',
    borderTopColor: '#10b981',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  actionsContainer: {
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
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
