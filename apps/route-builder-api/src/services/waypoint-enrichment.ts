import { GeocodedPlace, geocodingService } from './geocoding.js';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export class WaypointEnrichmentService {
  
  async enrichWaypoints(
    startPoint: GeocodedPlace,
    endPoint: GeocodedPlace | null,
    intent: string,
    routeType: string,
    distanceKm: number,
    keyWaypoints?: string[]
  ): Promise<GeocodedPlace[]> {
    
    // 1. Jeśli AI interview dostarczył key_waypoints → geokoduj je
    if (keyWaypoints && keyWaypoints.length > 0) {
      // Ogranicz do 15 punktów ze względu na rozsądny limit zapytań do geokodera (ORS pozwala na 50 punktów)
      const limitedWaypoints = keyWaypoints.slice(0, 15);
      console.log(`[WaypointEnrichment] Geocoding ${limitedWaypoints.length} key waypoints from AI...`);
      const geocoded = await Promise.all(
        limitedWaypoints.map(wp => geocodingService.geocodeSinglePoint(wp, { lat: startPoint.lat, lng: startPoint.lng }).catch(err => {
          console.warn(`[WaypointEnrichment] Failed to geocode waypoint "${wp}": ${err.message}`);
          return null;
        }))
      );
      
      const validWaypoints = geocoded.filter((p): p is GeocodedPlace => p !== null);
      
      // 2. Optymalizacja przestrzenna (Nearest Neighbor), aby uniknąć plątaniny (tzw. problem komiwojażera)
      const unvisited = [...validWaypoints];
      const optimized: GeocodedPlace[] = [];
      let current = startPoint;
      
      while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minDistance = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
          const dist = getDistance(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
          if (dist < minDistance) {
            minDistance = dist;
            nearestIdx = i;
          }
        }
        current = unvisited[nearestIdx];
        optimized.push(current);
        unvisited.splice(nearestIdx, 1);
      }
      
      return [startPoint, ...optimized, endPoint].filter((p): p is GeocodedPlace => p !== null);
    }
    
    return [startPoint, endPoint].filter((p): p is GeocodedPlace => p !== null);
  }
}

export const waypointEnrichmentService = new WaypointEnrichmentService();
