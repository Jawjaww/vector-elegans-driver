import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FullscreenRideModal } from './FullscreenRideModal';
import { Ride } from '../lib/stores/driverStore';

interface RideStackModalProps {
  rides: Ride[];
  onAcceptRide: (rideId: string) => void;
  onDeclineRide: (rideId: string) => void;
}

export const RideStackModal = ({ rides, onAcceptRide, onDeclineRide }: RideStackModalProps) => {
  const [currentRideIndex, setCurrentRideIndex] = useState(0);

  if (rides.length === 0) return null;

  // Afficher seulement les 3 premières rides pour éviter l'overcrowding
  const visibleRides = rides.slice(0, 3);
  const currentRide = visibleRides[currentRideIndex];

  const handleAccept = () => {
    onAcceptRide(currentRide.id);
    // Passer à la ride suivante ou fermer si c'était la dernière
    if (currentRideIndex < visibleRides.length - 1) {
      setCurrentRideIndex(currentRideIndex + 1);
    }
  };

  const handleDecline = () => {
    onDeclineRide(currentRide.id);
    // Passer à la ride suivante ou fermer si c'était la dernière
    if (currentRideIndex < visibleRides.length - 1) {
      setCurrentRideIndex(currentRideIndex + 1);
    }
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