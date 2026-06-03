import { GeocodedPlace, geocodingService } from './geocoding.js';

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
      console.log(`[WaypointEnrichment] Geocoding ${keyWaypoints.length} key waypoints from AI...`);
      const geocoded = await Promise.all(
        keyWaypoints.map(wp => geocodingService.geocodeSinglePoint(wp).catch(err => {
          console.warn(`[WaypointEnrichment] Failed to geocode waypoint "${wp}": ${err.message}`);
          return null;
        }))
      );
      
      const validWaypoints = geocoded.filter((p): p is GeocodedPlace => p !== null);
      return [startPoint, ...validWaypoints, endPoint].filter((p): p is GeocodedPlace => p !== null);
    }
    
    return [startPoint, endPoint].filter((p): p is GeocodedPlace => p !== null);
  }
}

export const waypointEnrichmentService = new WaypointEnrichmentService();
