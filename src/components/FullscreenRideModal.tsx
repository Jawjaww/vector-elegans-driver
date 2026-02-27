import React, { useEffect, useState, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, Modal, Dimensions, TouchableOpacity, Alert, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useDriverStore, Ride } from '../lib/stores/driverStore';
import { NeonSwipeButton } from './NeonSwipeButton';
import { RideRequestMap } from './RideRequestMap';
import { NeonProgress } from './NeonProgress';

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

import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

export const FullscreenRideModal = ({ ride, isActive = true, onAccept, onDecline }: FullscreenRideModalProps) => {
  const { t } = useTranslation();
  const { availableRide, currentLocation } = useDriverStore();
  const currentRide = ride || availableRide;
  
  // Memoize RideRequestMap props to prevent unnecessary re-renders from location updates
  const rideRequestMapProps = useMemo(() => ({
    pickup: currentRide ? { lat: currentRide.pickup_lat, lng: currentRide.pickup_lon } : { lat: 0, lng: 0 },
    dropoff: currentRide ? { lat: currentRide.dropoff_lat, lng: currentRide.dropoff_lon } : { lat: 0, lng: 0 },
    driverLocation: currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null,
    onReady: () => setMapReady(true)
  }), [currentRide?.pickup_lat, currentRide?.pickup_lon, currentRide?.dropoff_lat, currentRide?.dropoff_lon, currentLocation?.lat, currentLocation?.lng]);
  const insets = useSafeAreaInsets();
  
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
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

  // Reset when a new ride appears
  useEffect(() => {
    if (currentRide) {
      setCountdown(COUNTDOWN_SECONDS);
      setStartKey(Date.now());
      setMapReady(false);
      // Reset animation values for the new ride
      translateX.value = 0;
      translateY.value = 0;
    }
  }, [currentRide?.id]);

  // Countdown timer
  useEffect(() => {
    if (!currentRide) return;
    
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentRide, onDecline]);

  if (!currentRide) return null;

  // Calculate approach info locally since we don't have the API hook yet
  const driverDistKm = currentLocation 
    ? calculateDistance(currentLocation.lat, currentLocation.lng, currentRide.pickup_lat, currentRide.pickup_lon)
    : 0;
  
  // Assume 30km/h average speed in city for approach time
  const driverTimeMin = driverDistKm > 0 ? (driverDistKm / 30) * 60 : 0;

  const tripDistKm = currentRide.distance ? Number(currentRide.distance) / 1000 : 0;
  const tripTimeMin = currentRide.duration ? Number(currentRide.duration) / 60 : 0;

  return (
    <Modal
      visible={!!currentRide}
      transparent
      animationType="none"
      onRequestClose={onDecline}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          <PanGestureHandler
              onGestureEvent={(event) => {
                const nativeEvent = event.nativeEvent as any;
                const translationX = nativeEvent.translationX as number;
                const translationY = nativeEvent.translationY as number;
                
                // Mettre à jour la position avec un effet de traînée
                translateX.value = translationX;
                translateY.value = translationY;
              }}
              onEnded={(event) => {
                const nativeEvent = event.nativeEvent as any;
                const translationX = nativeEvent.translationX as number;
                const translationY = nativeEvent.translationY as number;
                const velocityX = nativeEvent.velocityX as number;
                const velocityY = nativeEvent.velocityY as number;
                
                const distance = Math.sqrt(translationX * translationX + translationY * translationY);
                const screenDiagonal = Math.sqrt(width * width + height * height);
                
                // Si déplacé de plus de 20% de l'écran OU vitesse élevée → rejet
                if (distance > screenDiagonal * 0.20 || 
                    Math.abs(velocityX) > 800 || 
                    Math.abs(velocityY) > 800) {
                  
                  // Calculer la direction de sortie
                  // On veut projeter la modal hors de l'écran dans la direction du geste
                  const exitDistance = screenDiagonal * 1.5; // Suffisamment loin pour sortir de l'écran
                  
                  // Normaliser le vecteur de direction
                  const magnitude = Math.sqrt(translationX * translationX + translationY * translationY) || 1;
                  const dirX = translationX / magnitude;
                  const dirY = translationY / magnitude;
                  
                  // Si la magnitude est très faible (ex: juste un tap), on utilise la vélocité
                  let targetX, targetY;
                  
                  if (magnitude < 10 && (Math.abs(velocityX) > 100 || Math.abs(velocityY) > 100)) {
                      const vMag = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
                      targetX = (velocityX / vMag) * exitDistance;
                      targetY = (velocityY / vMag) * exitDistance;
                  } else {
                      targetX = dirX * exitDistance;
                      targetY = dirY * exitDistance;
                  }

                  // Animation de sortie rapide
                  translateX.value = withSpring(targetX, { damping: 20, stiffness: 100, velocity: velocityX });
                  translateY.value = withSpring(targetY, { damping: 20, stiffness: 100, velocity: velocityY });
                  
                  // Appeler onDecline après l'animation
                  setTimeout(() => {
                    runOnJS(onDecline)();
                  }, 200);
                } else {
                  // Retour à la position initiale avec animation spring
                  translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
                  translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
                }
              }}
            >
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
                onExpire={onDecline}
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
                    {tripDistKm.toFixed(1)} km · {formatDuration(tripTimeMin)}
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

              {/* Map Area */}
              <View style={styles.mapContainer}>
                <RideRequestMap {...rideRequestMapProps} />

                {/* Overlays: Pickup/Dropoff Addresses */}
                <View style={styles.addressOverlay}>
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

                {/* Loading Spinner for Map */}
                {!mapReady && (
                  <View style={styles.mapLoadingOverlay}>
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
        </PanGestureHandler>
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
    padding: 8,
    gap: 8,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.8)',
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
