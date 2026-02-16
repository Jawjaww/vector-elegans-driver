import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useDriverStore } from '../lib/stores/driverStore';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { useRealtimeRides } from '../hooks/useRealtimeRides';
import { isUserDriver } from '../lib/utils/auth-helpers';
import { formatPrice } from '../lib/utils/driverUtils';
import type { StackNavigationProp } from '@react-navigation/stack';

type DashboardScreenProps = {
  navigation: StackNavigationProp<any>;
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);

  const {
    isOnline,
    setIsOnline,
    stats,
    currentLocation,
    availableRide,
    activeRide,
  } = useDriverStore();

  useDriverLocation(isOnline);
  const { acceptRide, declineRide, hasPendingRide } = useRealtimeRides();

  useEffect(() => {
    const fetchDriverStatus = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          navigation.replace('Auth');
          return;
        }

        const { data: driver } = await supabase
          .from('drivers')
          .select('status, first_name, last_name')
          .eq('user_id', user.id)
          .single();

        if (driver) {
          setDriverStatus(driver.status);
          if (driver.status !== 'active') {
            navigation.replace('ProfileSetup');
          }
        } else {
          navigation.replace('ProfileSetup');
        }
      } catch (error) {
        console.error('Error fetching driver status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDriverStatus();
  }, [navigation]);

  const handleToggleOnline = () => {
    setIsOnline(!isOnline);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('dashboard.title')}</Text>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isOnline ? '#4CAF50' : '#9E9E9E' },
            ]}
          />
          <Text style={styles.statusText}>
            {isOnline ? t('dashboard.online') : t('dashboard.offline')}
          </Text>
        </View>
      </View>

      {currentLocation && (
        <Text style={styles.locationText}>
          📍 {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
        </Text>
      )}

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatPrice(stats.todayEarnings)}</Text>
          <Text style={styles.statLabel}>{t('dashboard.todayEarnings')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.todayRides}</Text>
          <Text style={styles.statLabel}>{t('dashboard.todayRides')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.rating.toFixed(1)}</Text>
          <Text style={styles.statLabel}>{t('dashboard.rating')}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.toggleButton,
          isOnline ? styles.goOfflineButton : styles.goOnlineButton,
        ]}
        onPress={handleToggleOnline}
      >
        <Text style={styles.toggleButtonText}>
          {isOnline ? t('dashboard.goOffline') : t('dashboard.goOnline')}
        </Text>
      </TouchableOpacity>

      {hasPendingRide && availableRide && (
        <View style={styles.rideRequestCard}>
          <Text style={styles.rideRequestTitle}>{t('ride.newRide')}</Text>
          <Text style={styles.rideRequestText}>
            📍 {availableRide.pickupLocation}
          </Text>
          <Text style={styles.rideRequestText}>
            🏁 {availableRide.dropoffLocation}
          </Text>
          {availableRide.estimatedPrice && (
            <Text style={styles.ridePrice}>
              {formatPrice(availableRide.estimatedPrice)}
            </Text>
          )}
          <View style={styles.rideRequestButtons}>
            <TouchableOpacity
              style={[styles.rideButton, styles.acceptButton]}
              onPress={() => acceptRide(availableRide.id)}
            >
              <Text style={styles.rideButtonText}>{t('ride.accept')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rideButton, styles.declineButton]}
              onPress={declineRide}
            >
              <Text style={styles.rideButtonText}>{t('ride.decline')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {activeRide && (
        <View style={styles.activeRideCard}>
          <Text style={styles.activeRideTitle}>{t('dashboard.activeRide')}</Text>
          <Text style={styles.rideRequestText}>
            📍 {activeRide.pickupLocation}
          </Text>
          <Text style={styles.rideRequestText}>
            🏁 {activeRide.dropoffLocation}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#666',
  },
  locationText: {
    padding: 10,
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
  },
  statCard: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 100,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  toggleButton: {
    margin: 20,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  goOnlineButton: {
    backgroundColor: '#4CAF50',
  },
  goOfflineButton: {
    backgroundColor: '#F44336',
  },
  toggleButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  rideRequestCard: {
    backgroundColor: '#FFF',
    margin: 20,
    padding: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  rideRequestTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 10,
  },
  rideRequestText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  ridePrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  rideRequestButtons: {
    flexDirection: 'row',
    marginTop: 15,
  },
  rideButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#F44336',
  },
  rideButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  activeRideCard: {
    backgroundColor: '#FFF3E0',
    margin: 20,
    padding: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  activeRideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF9800',
    marginBottom: 10,
  },
});
