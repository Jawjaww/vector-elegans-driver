import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Feather } from '@expo/vector-icons';

interface Coordinates {
  lat: number;
  lng: number;
}

interface RideRequestMapProps {
  pickup: Coordinates;
  dropoff: Coordinates;
  driverLocation: Coordinates | null;
  onReady?: () => void;
}

// Function to decode Google Maps polyline (if you were fetching from an API)
// Since we don't have a Directions API key configured in the project yet for client-side fetching,
// we will simulate a route for now, but I'll add the structure to support real points.
// IMPORTANT: For a "real" route without an API key, we can't calculate turn-by-turn.
// However, I can make the line look better or use a public OSRM service if network permits.
// For now, I will use a simple straight line but style it to look like a route, 
// as fetching real geometry requires an external service call (OSRM/Google).

// Let's try to fetch a real route using OSRM (Open Source Routing Machine) public API
const fetchRoute = async (start: Coordinates, end: Coordinates) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    console.log('Fetching route from OSRM API:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('OSRM API error:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    console.log('OSRM API response:', data);
    
    if (data.routes && data.routes.length > 0 && data.routes[0].geometry) {
      const coordinates = data.routes[0].geometry.coordinates.map((coord: number[]) => ({
        latitude: coord[1],
        longitude: coord[0],
      }));
      console.log('Route coordinates extracted:', coordinates.length, 'points');
      return coordinates;
    } else {
      console.warn('No valid route found in OSRM response');
    }
  } catch (error) {
    console.error('Error fetching route from OSRM:', error);
  }
  return null;
};

export const RideRequestMap = ({ pickup, dropoff, driverLocation, onReady }: RideRequestMapProps) => {
  const mapRef = useRef<MapView>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [approachCoordinates, setApproachCoordinates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadRoutes = async () => {
        console.log('Loading routes with:', { pickup, dropoff, driverLocation });
        
        // Fetch Trip Route
        if (pickup.lat && pickup.lng && dropoff.lat && dropoff.lng) {
            console.log('Fetching trip route...');
            const trip = await fetchRoute(pickup, dropoff);
            console.log('Trip route result:', trip ? trip.length + ' points' : 'null');
            if (isMounted && trip) setRouteCoordinates(trip);
        }

        // Fetch Approach Route
        if (driverLocation && pickup.lat && pickup.lng) {
            console.log('Fetching approach route...');
            const approach = await fetchRoute(driverLocation, pickup);
            console.log('Approach route result:', approach ? approach.length + ' points' : 'null');
            if (isMounted && approach) setApproachCoordinates(approach);
        }

        // Mark loading as complete
        if (isMounted) {
            setIsLoading(false);
        }
    };

    loadRoutes();

    return () => { isMounted = false; };
  }, [pickup, dropoff, driverLocation]);

  useEffect(() => {
    if (mapRef.current && pickup.lat && pickup.lng && dropoff.lat && dropoff.lng) {
      const coordinates = [
        { latitude: pickup.lat, longitude: pickup.lng },
        { latitude: dropoff.lat, longitude: dropoff.lng },
      ];

      if (driverLocation) {
        coordinates.push({ latitude: driverLocation.lat, longitude: driverLocation.lng });
      }

      // Add some padding to fit the route (reduced padding for tighter zoom)
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [pickup, dropoff, driverLocation]); // Only fit based on pickup/dropoff/driver changes

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: pickup.lat || 48.8566,
          longitude: pickup.lng || 2.3522,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        onMapReady={onReady}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {driverLocation && (
          <>
            <Marker
              coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={3}
            >
              <View style={styles.driverMarker}>
                <Feather name="navigation" size={16} color="white" />
              </View>
            </Marker>
            
            {/* Approach Line - Real Route */}
            {approachCoordinates.length > 0 && (
                <Polyline
                    coordinates={approachCoordinates}
                    strokeColor="rgba(59, 130, 246, 0.7)" // Blue semi-transparent
                    strokeWidth={4}
                    lineDashPattern={[5, 5]} // Still dashed to indicate approach
                />
            )}
            {/* Fallback straight line (only show if OSRM fails AND loading is complete) */}
            {!isLoading && approachCoordinates.length === 0 && driverLocation && (
                <Polyline
                    coordinates={[
                        { latitude: driverLocation.lat, longitude: driverLocation.lng },
                        { latitude: pickup.lat, longitude: pickup.lng }
                    ]}
                    strokeColor="rgba(59, 130, 246, 0.5)"
                    strokeWidth={3}
                    lineDashPattern={[10, 5]}
                />
            )}
          </>
        )}

        {/* Trip Line - Real Route */}
        {routeCoordinates.length > 0 && (
            <Polyline
                coordinates={routeCoordinates}
                strokeColor="#10b981" // Emerald Green
                strokeWidth={5}
            />
        )}
        {/* Fallback straight line (only show if OSRM fails AND loading is complete) */}
        {!isLoading && routeCoordinates.length === 0 && (
            <Polyline
                coordinates={[
                    { latitude: pickup.lat, longitude: pickup.lng },
                    { latitude: dropoff.lat, longitude: dropoff.lng }
                ]}
                strokeColor="#10b981"
                strokeWidth={4}
            />
        )}

        <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} zIndex={2}>
          <View style={styles.pickupMarker}>
            <Feather name="map-pin" size={16} color="white" />
          </View>
        </Marker>

        <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} zIndex={2}>
          <View style={styles.dropoffMarker}>
            <Feather name="flag" size={16} color="white" />
          </View>
        </Marker>
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 0,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  driverMarker: {
    backgroundColor: '#3b82f6',
    padding: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pickupMarker: {
    backgroundColor: '#64748b',
    padding: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dropoffMarker: {
    backgroundColor: '#10b981',
    padding: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});
