import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { ProvisionalOffer } from '../lib/stores/driverStore';
import type { OfferCardLayout } from '../lib/utils/offerCardLayout';
import { MAP_PALETTE } from '../lib/mapPalette';
import { NeonSwipeButton } from './NeonSwipeButton';

const INNER_RADIUS = 12;

interface ProvisionalOfferCardProps {
  preview: ProvisionalOffer;
  cardWidth: number;
  layout: OfferCardLayout;
  onAccept: () => void;
}

/**
 * The offer card painted straight from the notification payload, before the server has
 * answered.
 *
 * It exists because the alternative is a spinner: reading the ride needs a round-trip, and on
 * a cold start the driver would watch nothing happen after deliberately tapping a
 * notification. The payload already carries the pickup, the dropoff and the price — enough to
 * decide — so the card is drawn from it and replaced in place when the real ride lands.
 *
 * Accept stays live on purpose: the accept RPC resolves the ride server-side and reports a
 * dead offer, so a stale card cannot turn into a wrong acceptance.
 */
export function ProvisionalOfferCard({
  preview,
  cardWidth,
  layout,
  onAccept,
}: Readonly<ProvisionalOfferCardProps>) {
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.cardShell,
        { width: cardWidth, maxHeight: layout.maxCardHeight },
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
          { padding: layout.contentPadding, gap: layout.contentGap },
        ]}
      >
        <View style={styles.header}>
          <Text
            style={[
              styles.priceText,
              (preview.priceLabel?.length ?? 0) > 6 && styles.priceTextCompact,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {preview.priceLabel ?? '—'}
          </Text>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.55)" />
        </View>

        {preview.pickupAddress ? (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={14} color={MAP_PALETTE.departure} />
            <Text style={styles.metaText} numberOfLines={2}>
              {preview.pickupAddress}
            </Text>
          </View>
        ) : null}

        {preview.dropoffAddress ? (
          <View style={styles.metaRow}>
            <Feather name="flag" size={14} color={MAP_PALETTE.arrival} />
            <Text style={[styles.metaText, styles.dropoffText]} numberOfLines={2}>
              {preview.dropoffAddress}
            </Text>
          </View>
        ) : null}

        <Text style={styles.pendingText} numberOfLines={1}>
          {t('ride.preparingOffer')}
        </Text>

        <View style={styles.swipeButtonWrapper}>
          <NeonSwipeButton onConfirm={onAccept} resetKey={preview.rideId} />
        </View>
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
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: INNER_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  priceText: {
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  priceTextCompact: {
    fontSize: 15,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  metaText: {
    flex: 1,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    lineHeight: 19,
  },
  dropoffText: {
    fontWeight: '700',
  },
  pendingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  swipeButtonWrapper: {
    marginTop: 4,
  },
});
