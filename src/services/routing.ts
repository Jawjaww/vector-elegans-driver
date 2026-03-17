import type { LatLng } from '../map/types';

export interface OSRMRoute {
  geometry: {
    coordinates: [number, number][];
  };
  distance: number;
  duration: number;
  legs: Array<{
    distance: number;
    duration: number;
    steps: Array<{
      distance: number;
      duration: number;
      name: string;
      maneuver: {
        type: string;
        modifier?: string;
        location: [number, number];
      };
    }>;
  }>;
}

export async function getRouteOSRM(start: LatLng, end: LatLng): Promise<OSRMRoute | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&steps=true&overview=full&annotations=true`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('OSRM API error:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      return data.routes[0] as OSRMRoute;
    }
    
    console.warn('No route found in OSRM response');
    return null;
  } catch (error) {
    console.error('Error fetching route from OSRM:', error);
    return null;
  }
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  }
  return `${minutes} min`;
}
