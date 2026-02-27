import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { GlassCard } from './GlassCard';
import { SwipeButton } from './SwipeButton';

interface RideRequestCardProps {
  onAccept: () => void;
  onDecline: () => void;
  rideData: {
    price: string;
    duration: string;
    distance: string;
    pickup: string;
    dropoff: string;
    eta?: string;
    etaDistance?: string;
  };
}

export const RideRequestCard = ({ onAccept, onDecline, rideData }: RideRequestCardProps) => {
  const { t } = useTranslation();
  return (
    <GlassCard className="w-full">
      {/* Progress Bar (Mock) */}
      <View style={styles.progressBarContainer}>
        <LinearGradient
          colors={['#10b981', '#34d399']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressBar, { width: '60%' }]}
        />
      </View>

      {/* Alert Box */}
      <LinearGradient
        colors={['rgba(239, 68, 68, 0.2)', 'rgba(239, 68, 68, 0.1)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.alertBox}
      >
        <View style={styles.alertContent}>
          <Feather name="alert-triangle" size={18} color="#fca5a5" />
          <Text style={styles.alertText}>
            APPROCHE ({rideData.eta || '7h43'} • {rideData.etaDistance || '731 km'})
          </Text>
        </View>
      </LinearGradient>

      {/* Price Box */}
      <LinearGradient
        colors={['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.priceBox}
      >
        <Text style={styles.priceText}>
          PRIX COURSE : <Text style={styles.priceValue}>{rideData.price}</Text>
        </Text>
        <Text style={styles.detailsText}>
          {rideData.duration} • {rideData.distance}
        </Text>
      </LinearGradient>

      {/* Map Snippet / Route Info */}
      <View style={styles.routeContainer}>
        {/* Placeholder for Map Snippet or Route Visualization */}
        <View style={styles.routeLineContainer}>
            <View style={styles.routeDotPickup} />
            <View style={styles.routeLine} />
            <View style={styles.routeDotDropoff} />
        </View>
        <View style={styles.routeInfo}>
            <View style={styles.routePoint}>
                <Feather name="map-pin" size={14} color="#94a3b8" />
                <Text style={styles.routeText} numberOfLines={1}>{rideData.pickup}</Text>
            </View>
            <View style={[styles.routePoint, { marginTop: 12 }]}>
                <Feather name="flag" size={14} color="#10b981" />
                <Text style={styles.routeText} numberOfLines={1}>{rideData.dropoff}</Text>
            </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <SwipeButton onSwipeSuccess={onAccept} />
        
        <Text onPress={onDecline} style={styles.declineText}>
          {t('ride.decline')}
        </Text>
      </View>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  progressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  alertBox: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  alertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: {
    color: '#fca5a5',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  priceBox: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  priceText: {
    color: '#d1fae5',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  detailsText: {
    color: '#6ee7b7',
    fontSize: 13,
  },
  routeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 24,
    height: 80,
  },
  routeLineContainer: {
    alignItems: 'center',
    width: 20,
    paddingVertical: 4,
  },
  routeDotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#94a3b8',
  },
  routeLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#475569',
    marginVertical: 4,
    borderStyle: 'dotted', // Dotted line logic needs SVG or custom view, basic view is solid
  },
  routeDotDropoff: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
  },
  routeInfo: {
    flex: 1,
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingVertical: 0,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeText: {
    color: '#e2e8f0',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  actionsContainer: {
    alignItems: 'center',
  },
  declineText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
