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
    keyWaypoints?: string[],
    preGeocoded?: GeocodedPlace[]
  ): Promise<GeocodedPlace[]> {

    // 0. Punkty z gotowymi współrzędnymi (np. POI z OSM) → tylko optymalizacja kolejności
    if (preGeocoded && preGeocoded.length > 0) {
      const orderedPre = this.orderWaypoints(startPoint, preGeocoded, endPoint || startPoint);
      return [startPoint, ...orderedPre, endPoint].filter((p): p is GeocodedPlace => p !== null);
    }

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

      const ordered = this.orderWaypoints(startPoint, validWaypoints, endPoint || startPoint);

      return [startPoint, ...ordered, endPoint].filter((p): p is GeocodedPlace => p !== null);
    }

    return [startPoint, endPoint].filter((p): p is GeocodedPlace => p !== null);
  }

  /**
   * Optymalizacja kolejności: Nearest Neighbor + poprawka 2-opt.
   * Sam NN psuje pętle (wraca tą samą doliną); 2-opt usuwa przecięcia trasy.
   */
  private orderWaypoints(startPoint: GeocodedPlace, points: GeocodedPlace[], endPoint: GeocodedPlace): GeocodedPlace[] {
    const unvisited = [...points];
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

    return this.twoOptImprove(startPoint, optimized, endPoint);
  }

  /**
   * Klasyczna poprawka 2-opt: odwraca segmenty trasy dopóki zmniejsza to jej łączną
   * długość — eliminuje przecięcia ("pajęczyny") zostawione przez Nearest Neighbor.
   * Start i meta pozostają nieruchome.
   */
  private twoOptImprove(start: GeocodedPlace, middle: GeocodedPlace[], end: GeocodedPlace): GeocodedPlace[] {
    if (middle.length < 3) return middle;
    const route = [start, ...middle, end];
    let improvement = true;
    let guard = 0;

    while (improvement && guard < 50) {
      improvement = false;
      guard += 1;
      for (let i = 1; i < route.length - 2; i++) {
        for (let j = i + 1; j < route.length - 1; j++) {
          const before =
            getDistance(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng) +
            getDistance(route[j].lat, route[j].lng, route[j + 1].lat, route[j + 1].lng);
          const after =
            getDistance(route[i - 1].lat, route[i - 1].lng, route[j].lat, route[j].lng) +
            getDistance(route[i].lat, route[i].lng, route[j + 1].lat, route[j + 1].lng);
          if (after < before - 0.01) {
            // Odwróć segment i..j
            let left = i;
            let right = j;
            while (left < right) {
              const tmp = route[left];
              route[left] = route[right];
              route[right] = tmp;
              left += 1;
              right -= 1;
            }
            improvement = true;
          }
        }
      }
    }
    return route.slice(1, -1);
  }
}

export const waypointEnrichmentService = new WaypointEnrichmentService();
