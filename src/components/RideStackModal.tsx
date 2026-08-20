import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FullscreenRideModal } from './FullscreenRideModal';
import { Ride } from '../lib/stores/driverStore';

interface RideStackModalProps {
  rides: Ride[];
  onAcceptRide: (rideId: string) => void;
  onDeclineRide: (rideId: string, reason?: 'declined' | 'timeout') => void;
}

export const RideStackModal = ({ rides, onAcceptRide, onDeclineRide }: RideStackModalProps) => {
  const [currentRideIndex] = useState(0);

  if (rides.length === 0) return null;

  const visibleRides = rides.slice(0, 3);
  const safeIndex = Math.min(currentRideIndex, visibleRides.length - 1);
  const currentRide = visibleRides[safeIndex];

  const handleAccept = () => {
    onAcceptRide(currentRide.id);
  };

  const handleDecline = () => {
    onDeclineRide(currentRide.id, 'declined');
  };

  const handleTimeout = () => {
    onDeclineRide(currentRide.id, 'timeout');
  };

  return (
    <View style={styles.container}>
      {/* Effet d'empilement visuel avec les rides en arrière-plan */}
      {visibleRides.map((ride, index) => {
        if (index <= currentRideIndex) {
          const isActive = index === currentRideIndex;
          const offset = (visibleRides.length - 1 - index) * 8; // Décalage progressif
          const scale = 1 - (visibleRides.length - 1 - index) * 0.02; // Réduction progressive
          const opacity = isActive ? 1 : 0.8;

          return (
            <View
              key={ride.id}
              style={[
                styles.stackedCard,
                {
                  transform: [{ translateY: offset }, { scale }],
                  opacity,
                  zIndex: visibleRides.length - index,
                },
              ]}
            >
              <FullscreenRideModal
                ride={ride}
                isActive={isActive}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onTimeout={handleTimeout}
              />
            </View>
          );
        }
        return null;
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stackedCard: {
    position: 'absolute',
    width: '90%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
});