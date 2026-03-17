import { ViewStyle, StyleProp } from 'react-native';

export type LatLng = {
  lat: number;
  lng: number;
};

export interface DriverMarker {
  id: string;
  position: LatLng;
  heading?: number;
  status?: 'idle' | 'en_route' | 'on_trip';
  name?: string;
}

export interface MapProps {
  initialCenter?: LatLng;
  initialZoom?: number;
  start?: LatLng;
  end?: LatLng;
  drivers?: DriverMarker[];
  followUser?: boolean;
  showRoute?: boolean;
  style?: StyleProp<ViewStyle>;
  onMapPress?: (coord: LatLng) => void;
  onRouteReady?: (distanceMeters: number, durationSeconds: number) => void;
  onLocationUpdate?: (coord: LatLng) => void;
  onMapReady?: () => void;
}
