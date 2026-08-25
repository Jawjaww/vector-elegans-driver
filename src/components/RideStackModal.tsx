import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  FullscreenRideModal,
  type MapViewportHole,
} from './FullscreenRideModal';
import { Ride } from '../lib/stores/driverStore';

interface RideStackModalProps {
  rides: Ride[];
  chromeVisible?: boolean;
  onMapViewportLayout?: (hole: MapViewportHole) => void;
  onAcceptRide: (rideId: string) => void;
  onDeclineRide: (rideId: string, reason?: 'declined' | 'timeout') => void;
}

export const RideStackModal = ({
  rides,
  chromeVisible = false,
  onMapViewportLayout,
  onAcceptRide,
  onDeclineRide,
}: RideStackModalProps) => {
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
    <View style={styles.container} pointerEvents="box-none">
      {visibleRides.map((ride, index) => {
        if (index > currentRideIndex) return null;
        const isActive = index === currentRideIndex;
        return (
          <FullscreenRideModal
            key={ride.id}
            ride={ride}
            isActive={isActive}
            chromeVisible={chromeVisible}
            onMapViewportLayout={onMapViewportLayout}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onTimeout={handleTimeout}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
});
