import React from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useDriverStore, Ride } from '../lib/stores/driverStore';
import type { OfferCardLayout } from '../lib/utils/offerCardLayout';
import { NeonSwipeButton } from './NeonSwipeButton';
import { NeonProgress } from './NeonProgress';
import { RideOfferExtras } from './RideOfferExtras';
import {
  resolveRideTripMetrics,
  formatPickupDateTime,
  formatMinutesCompact,
  haversineKm,
} from '../lib/utils/rideMetrics';

const COUNTDOWN_SECONDS = 20;
const INNER_RADIUS = 12;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const OFFER_CARD_GAP = 12;
export const OFFER_CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.88);

export interface OfferRideCardProps {
  ride: Ride;
  cardWidth?: number;
  layout: OfferCardLayout;
  isActive?: boolean;
  chromeVisible?: boolean;
  /** Next queued offer — glass peek chip above the swipe (stack hint). */
  nextPeek?: { price: number; distanceKm: number } | null;
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

function RentabilityBadge({
  distance,
  price,
}: Readonly<{ distance: number; price: number }>) {
  const perKm = distance > 0 ? price / distance : 0;
  if (perKm >= 2.5) {
    return (
      <View
        style={[
          styles.badgeContainer,
          { backgroundColor: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.3)' },
        ]}
      >
        <Feather name="trending-up" size={16} color="#34d399" />
      </View>
    );
  }
  if (perKm >= 1.5) {
    return (
      <View
        style={[
          styles.badgeContainer,
          { backgroundColor: 'rgba(251, 191, 36, 0.1)', borderColor: 'rgba(251, 191, 36, 0.3)' },
        ]}
      >
        <Feather name="zap" size={16} color="#fbbf24" />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.badgeContainer,
        { backgroundColor: 'rgba(148, 163, 184, 0.1)', borderColor: 'rgba(148, 163, 184, 0.3)' },
      ]}
    >
      <Feather name="minus" size={16} color="#94a3b8" />
    </View>
  );
}

function OfferCardApproach({
  visible,
  label,
  approachText,
}: Readonly<{ visible: boolean; label: string; approachText: string }>) {
  if (!visible) {
    return <View style={styles.approachPlaceholder} />;
  }
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(0)} style={styles.approachContainer}>
      <View style={styles.approachContent}>
        <Feather name="map-pin" size={13} color="#fb923c" />
        <Text style={styles.approachLabel}>{label}</Text>
        <Text style={styles.approachText} numberOfLines={1}>
          {approachText}
        </Text>
      </View>
    </Animated.View>
  );
}

function OfferCardPriceHeader({
  visible,
  offerPrice,
  incentive,
  tripDistKm,
  tripTimeMin,
  showProgress,
  startKey,
  onExpire,
}: Readonly<{
  visible: boolean;
  offerPrice: number;
  incentive: number;
  tripDistKm: number;
  tripTimeMin: number;
  showProgress: boolean;
  startKey: number;
  onExpire?: () => void;
}>) {
  if (!visible) {
    return <View style={styles.headerPlaceholder} />;
  }
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(80)} style={styles.cardHeader}>
      <View style={styles.headerContent}>
        <View style={styles.priceContainer}>
          <Text
            style={[styles.priceText, offerPrice >= 1000 && styles.priceTextCompact]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatPrice(offerPrice)}
          </Text>
          {incentive > 0 ? (
            <View style={styles.bonusPill}>
              <Text style={styles.bonusText} numberOfLines={1}>
                Bonus +{incentive.toFixed(0)}€
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.separator}>·</Text>
        <Text style={styles.tripText} numberOfLines={1}>
          {formatTripDistanceLabel(tripDistKm)} · {formatMinutesCompact(tripTimeMin)}
        </Text>
        <View style={styles.rentabilityBadgeInline}>
          <RentabilityBadge distance={tripDistKm} price={offerPrice} />
        </View>
      </View>
      {showProgress ? (
        <NeonProgress
          variant="band"
          durationMs={COUNTDOWN_SECONDS * 1000}
          startKey={startKey}
          onExpire={onExpire}
        />
      ) : (
        <View style={styles.progressBandIdle} />
      )}
    </Animated.View>
  );
}

function OfferCardTripDetails({
  visible,
  ride,
  pickupWhen,
}: Readonly<{
  visible: boolean;
  ride: Ride;
  pickupWhen: string | null;
}>) {
  if (!visible) {
    return <View style={styles.detailsPlaceholder} />;
  }
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(140)} style={styles.details}>
      <RideOfferExtras
        options={ride.options}
        vehicleType={ride.vehicle_type}
        variant="dark"
        compact
        selectedOnly
        interactive={false}
      />
      {pickupWhen ? (
        <View style={styles.metaRow}>
          <Feather name="clock" size={13} color="#fdba74" />
          <Text style={styles.metaText} numberOfLines={1}>
            {pickupWhen}
          </Text>
        </View>
      ) : null}
      <View style={styles.metaRow}>
        <Feather name="map-pin" size={14} color="#f97316" />
        <Text style={styles.metaText} numberOfLines={2}>
          {ride.pickup_address}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Feather name="flag" size={14} color="#10b981" />
        <Text style={[styles.metaText, styles.dropoffText]} numberOfLines={2}>
          {ride.dropoff_address}
        </Text>
      </View>
    </Animated.View>
  );
}

function OfferCardActions({
  visible,
  declineLabel,
  resetKey,
  nextPeek,
  onAccept,
  onDecline,
}: Readonly<{
  visible: boolean;
  declineLabel: string;
  resetKey: string;
  nextPeek?: { price: number; distanceKm: number } | null;
  onAccept: () => void;
  onDecline: () => void;
}>) {
  if (!visible) {
    return <View style={styles.actionsPlaceholder} />;
  }
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(200)} style={styles.actionsContainer}>
      {nextPeek ? (
        <>
          <View style={styles.stackDivider} />
          <View style={styles.nextPeekChip}>
            <Text style={styles.nextPeekText} numberOfLines={1}>
              {formatPrice(nextPeek.price)} · {formatTripDistanceLabel(nextPeek.distanceKm)}
            </Text>
          </View>
        </>
      ) : null}
      <View style={styles.swipeButtonWrapper}>
        <NeonSwipeButton onConfirm={onAccept} resetKey={resetKey} />
      </View>
      <TouchableOpacity onPress={onDecline} style={styles.declineButton}>
        <Text style={styles.declineText}>{declineLabel}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function OfferRideCard({
  ride,
  cardWidth = OFFER_CARD_WIDTH,
  layout,
  isActive = false,
  chromeVisible = false,
  nextPeek = null,
  onAccept,
  onDecline,
  onTimeout,
}: Readonly<OfferRideCardProps>) {
  const { t } = useTranslation();
  const { currentLocation } = useDriverStore();
  const [startKey, setStartKey] = React.useState(Date.now());

  React.useEffect(() => {
    setStartKey(Date.now());
  }, [ride.id]);

  const driverDistKm = currentLocation
    ? haversineKm(
        currentLocation.lat,
        currentLocation.lng,
        ride.pickup_lat,
        ride.pickup_lon,
      )
    : 0;
  const approachSpeedKmh = driverDistKm > 40 ? 70 : 30;
  const driverTimeMin =
    driverDistKm > 0 ? (driverDistKm / approachSpeedKmh) * 60 : 0;

  const tripMetrics = resolveRideTripMetrics(ride);
  const offerPrice =
    (ride.estimated_price || 0) + Number(ride.client_incentive ?? 0);
  const approachText =
    driverDistKm > 0
      ? `${formatMinutesCompact(driverTimeMin)} · ${formatTripDistanceLabel(driverDistKm)}`
      : 'Position…';

  return (
    <View
      style={[
        styles.cardShell,
        {
          width: cardWidth,
          maxHeight: layout.maxCardHeight,
        },
      ]}
    >
      <BlurView intensity={64} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(38,38,40,0.94)', 'rgba(20,20,20,0.97)', 'rgba(12,12,12,0.98)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.03)', 'transparent']}
        locations={[0, 0.22, 0.55]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.glassSheen}
      />
      <View
        style={[
          styles.contentContainer,
          {
            padding: layout.contentPadding,
            gap: layout.contentGap,
          },
        ]}
      >
        <OfferCardPriceHeader
          visible={chromeVisible}
          offerPrice={offerPrice}
          incentive={Number(ride.client_incentive ?? 0)}
          tripDistKm={tripMetrics.distanceKm}
          tripTimeMin={tripMetrics.durationMin}
          showProgress={isActive}
          startKey={startKey}
          onExpire={onTimeout || onDecline}
        />

        <OfferCardApproach
          visible={chromeVisible}
          label={t('ride.approach')}
          approachText={approachText}
        />

        <OfferCardTripDetails
          visible={chromeVisible}
          ride={ride}
          pickupWhen={formatPickupDateTime(ride.pickup_time)}
        />

        <OfferCardActions
          visible={chromeVisible && isActive}
          declineLabel={t('ride.decline')}
          resetKey={ride.id}
          nextPeek={isActive ? nextPeek : null}
          onAccept={onAccept}
          onDecline={onDecline}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: '#141414',
  },
  glassSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  contentContainer: {
    padding: 14,
    gap: 8,
  },
  approachContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(251,146,60,0.28)',
  },
  approachPlaceholder: {
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  approachContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  approachLabel: {
    color: '#fb923c',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  approachText: {
    flex: 1,
    color: '#fdba74',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  cardHeader: {
    minHeight: 44,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: INNER_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerPlaceholder: {
    minHeight: 44,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: INNER_RADIUS,
  },
  headerContent: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 10,
    gap: 6,
  },
  progressBandIdle: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  priceContainer: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: '52%',
  },
  priceText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  priceTextCompact: {
    fontSize: 15,
  },
  bonusPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  bonusText: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  separator: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
  },
  tripText: {
    flex: 1,
    flexShrink: 1,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
  },
  rentabilityBadgeInline: {
    marginLeft: 2,
    flexShrink: 0,
  },
  details: {
    gap: 6,
  },
  detailsPlaceholder: {
    height: 88,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    flex: 1,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
  },
  dropoffText: {
    fontWeight: '700',
    color: '#ffffff',
  },
  actionsContainer: {
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  actionsPlaceholder: {
    height: 72,
    marginTop: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  stackDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 2,
  },
  nextPeekChip: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  nextPeekText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  swipeButtonWrapper: {
    width: '100%',
  },
  declineButton: {
    padding: 8,
    opacity: 0.8,
  },
  declineText: {
    color: 'rgba(248, 113, 113, 0.85)',
    fontSize: 14,
    fontWeight: '600',
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
});

export default OfferRideCard;
