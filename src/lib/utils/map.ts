export interface Coordinates {
  lat: number;
  lng: number;
}

export const fetchRoute = async (start: Coordinates, end: Coordinates) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    console.log('Fetching route from OSRM API:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('OSRM API error:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    
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
