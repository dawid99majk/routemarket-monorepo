import { GeocodedPlace } from './geocoding.js';
import { GraphHopperRoutingProvider, GoogleRoutesRoutingProvider, RoutingProfile } from '@routemarket/atlas-gis';

export interface RouteResult {
  distance_km: number;
  duration_h: number;
  trackPoints: [number, number, number?][]; // [lat, lng, ele?]
  geometry?: {
    type: 'LineString';
    coordinates: number[][];
  };
  waypoints?: GeocodedPlace[];
}

export class RoutingService {
  private ghProvider = new GraphHopperRoutingProvider();
  private googleProvider = new GoogleRoutesRoutingProvider();

  async getRoute(
    places: GeocodedPlace[], 
    routeType: string,
    options?: {
      intent?: string;
      surfacePreferences?: string[];
      distanceTargetKm?: number;
      difficulty?: string;
    }
  ): Promise<RouteResult> {
    console.log(`[Routing] getRoute: Generating ${routeType} route for ${places.length} waypoints using Atlas Engine...`);
    
    if (places.length < 2) {
      throw new Error('Za mało punktów do wyznaczenia trasy (minimum 2).');
    }

    // We trust the AI (or the user's manual input) for the order of waypoints.
    // Nearest Neighbor optimization ruins logical loops (e.g., outbound ridge, inbound valley).
    const optimizedPlaces = places;

    // Mapped routing profile for internal engines
    const profileMap: Record<string, RoutingProfile> = {
      'cycling': 'bike', 'gravel': 'bike', 'mtb': 'bike', 
      'hiking': 'hiking', 'city_walk': 'hiking', 'city': 'hiking',
      'car': 'motorcycle', 'motorcycle': 'motorcycle'
    };
    const profile = profileMap[routeType] || 'bike';

    // PRIMARY: Google Maps for car and motorcycle
    if (routeType === 'car' || routeType === 'motorcycle') {
      try {
        const result = await this.googleProvider.getRoute(optimizedPlaces, profile);
        return {
          distance_km: result.distanceKm,
          duration_h: result.estimatedTimeH,
          trackPoints: result.points.map(p => [p.lat, p.lng, (p as any).ele || 0]),
          geometry: result.geometryGeoJson,
          waypoints: optimizedPlaces
        };
      } catch (err: any) {
        console.warn(`[Routing] Google Maps routing failed, trying GraphHopper: ${err.message}`);
      }
    }

    // GraphHopper for all non-motorized (hiking, gravel, cycling) and fallback for motorized
    try {
      const result = await this.ghProvider.getRoute(optimizedPlaces, profile);
      
      return {
        distance_km: result.distanceKm,
        duration_h: result.estimatedTimeH,
        trackPoints: result.points.map(p => [p.lat, p.lng, (p as any).ele || 0]),
        geometry: result.geometryGeoJson,
        waypoints: optimizedPlaces
      };
    } catch (err: any) {
      console.warn(`[Routing] GraphHopper failed: ${err.message}`);
    }

    // FALLBACK: Mathematical mock route (deterministic, no Math.random to prevent route jumping)
    const start = places[0];
    const end = places[places.length - 1];
    
    const points: [number, number][] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const wave = Math.sin(ratio * Math.PI) * 0.004;
      // Using deterministic sine-based offsets instead of Math.random
      const jitterLat = Math.sin(i * 1.5) * 0.0005;
      const jitterLng = Math.cos(i * 1.5) * 0.0005;
      const lat = start.lat + (end.lat - start.lat) * ratio + wave + jitterLat;
      const lng = start.lng + (end.lng - start.lng) * ratio + wave * 0.6 + jitterLng;
      points.push([lat, lng]);
    }

    await new Promise(r => setTimeout(r, 200));

    return {
      distance_km: 12.5,
      duration_h: 3.5,
      trackPoints: points.map(p => [p[0], p[1], 0]),
      geometry: {
        type: 'LineString',
        coordinates: points.map(p => [p[1], p[0]])
      },
      waypoints: optimizedPlaces
    };
  }

  private optimizeWaypointsLocal(places: GeocodedPlace[]): GeocodedPlace[] {
    if (places.length <= 3) return places;
    
    const start = places[0];
    const end = places[places.length - 1];
    
    const intermediates = places.slice(1, -1);
    const n = intermediates.length;
    
    // If there are too many intermediate points, fall back to nearest neighbor to prevent CPU lockups
    if (n > 9) {
      return this.optimizeWaypointsLocalNearestNeighbor(places);
    }
    
    let bestPath: GeocodedPlace[] = [];
    let minTotalDist = Infinity;
    
    const getDistance = (p1: GeocodedPlace, p2: GeocodedPlace) => {
      const R = 6371; // Earth's radius in km
      const dLat = (p2.lat - p1.lat) * Math.PI / 180;
      const dLon = (p2.lng - p1.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    const permute = (arr: GeocodedPlace[], memo: GeocodedPlace[] = []) => {
      if (arr.length === 0) {
        let currentDist = 0;
        let lastPt = start;
        for (const pt of memo) {
          currentDist += getDistance(lastPt, pt);
          lastPt = pt;
        }
        currentDist += getDistance(lastPt, end);
        
        if (currentDist < minTotalDist) {
          minTotalDist = currentDist;
          bestPath = [...memo];
        }
        return;
      }
      
      for (let i = 0; i < arr.length; i++) {
        const curr = arr.splice(i, 1);
        permute(arr.slice(), memo.concat(curr));
        arr.splice(i, 0, curr[0]);
      }
    };
    
    permute(intermediates);
    
    return [start, ...bestPath, end];
  }

  private optimizeWaypointsLocalNearestNeighbor(places: GeocodedPlace[]): GeocodedPlace[] {
    const start = places[0];
    const end = places[places.length - 1];
    
    const intermediates = places.slice(1, -1);
    const optimized: GeocodedPlace[] = [start];
    let current = start;
    
    while (intermediates.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;
      
      for (let i = 0; i < intermediates.length; i++) {
        const candidate = intermediates[i];
        const R = 6371;
        const dLat = (candidate.lat - current.lat) * Math.PI / 180;
        const dLon = (candidate.lng - current.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(current.lat * Math.PI / 180) * Math.cos(candidate.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const dist = R * c;
        
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }
      
      current = intermediates[nearestIdx];
      optimized.push(current);
      intermediates.splice(nearestIdx, 1);
    }
    
    optimized.push(end);
    return optimized;
  }

  async getRouteAlternatives(places: GeocodedPlace[], routeType: string, preferences: string[] = []): Promise<any[]> {
    console.log(`[Routing] getRouteAlternatives: Generating 3 alternatives for ${routeType} using Atlas Engine...`);
    
    if (places.length < 2) {
      throw new Error('Za mało punktów do wyznaczenia trasy (minimum 2).');
    }

    const start = places[0];
    const end = places[places.length - 1];
    const isLoop = places.length > 2 && start.lat === end.lat && start.lng === end.lng;

    try {
      console.log(`[Routing] Generating real road-snapped alternatives using Atlas Engine...`);
      
      let dLat: number;
      let dLng: number;
      let midLat: number;
      let midLng: number;
      
      if (isLoop) {
        const checkpoint = places[1];
        dLat = checkpoint.lat - start.lat;
        dLng = checkpoint.lng - start.lng;
        midLat = checkpoint.lat;
        midLng = checkpoint.lng;
      } else {
        dLat = end.lat - start.lat;
        dLng = end.lng - start.lng;
        midLat = (start.lat + end.lat) / 2;
        midLng = (start.lng + end.lng) / 2;
      }
      
      const shiftScenicLat = midLat - dLng * 0.22;
      const shiftScenicLng = midLng + dLat * 0.22;
      
      const shiftChallengeLat = midLat + dLng * 0.25;
      const shiftChallengeLng = midLng - dLat * 0.25;

      const scenicWaypoints: GeocodedPlace[] = [
        start,
        { name: 'Obejście widokowe', lat: shiftScenicLat, lng: shiftScenicLng, confidence: 1, source: 'derived', provider: 'derived' },
        end
      ];
      
      const challengeWaypoints: GeocodedPlace[] = [
        start,
        { name: 'Odcinek techniczny', lat: shiftChallengeLat, lng: shiftChallengeLng, confidence: 1, source: 'derived', provider: 'derived' },
        end
      ];
      
      const fastWaypoints: GeocodedPlace[] = isLoop ? [start, places[1], end] : [start, end];

      // Fetch alternatives using the internal method which now maps to GraphHopper/Google
      const [scenicRoute, challengeRoute, fastRoute] = await Promise.all([
        this.getRoute(scenicWaypoints, routeType).catch(err => {
          console.error(`[Routing] Scenic route fetch failed, falling back: ${err.message}`);
          return null;
        }),
        this.getRoute(challengeWaypoints, routeType).catch(err => {
          console.error(`[Routing] Challenge route fetch failed, falling back: ${err.message}`);
          return null;
        }),
        this.getRoute(fastWaypoints, routeType).catch(err => {
          console.error(`[Routing] Fast route fetch failed, falling back: ${err.message}`);
          return null;
        })
      ]);

      const alternatives: any[] = [];

      if (scenicRoute) {
        alternatives.push({
          id: 'variant-a',
          name: 'Trasa Krajobrazowa (Widokowa)',
          color: '#10b981', // Szmaragdowy
          distance_km: scenicRoute.distance_km,
          duration_h: scenicRoute.duration_h,
          track: scenicRoute.trackPoints,
          pois: [
            { name: 'Punkt Widokowy', lat: shiftScenicLat, lng: shiftScenicLng },
            { name: 'Schronisko i Kawiarnia', lat: scenicRoute.trackPoints[Math.floor(scenicRoute.trackPoints.length * 0.6)][0], lng: scenicRoute.trackPoints[Math.floor(scenicRoute.trackPoints.length * 0.6)][1] }
          ]
        });
      }

      if (challengeRoute) {
        alternatives.push({
          id: 'variant-b',
          name: routeType === 'motorcycle' ? 'Trasa Kręta (Techniczna)' : 'Trasa Wyzwanie (Górska)',
          color: '#06b6d4', // Błękitny
          distance_km: challengeRoute.distance_km,
          duration_h: challengeRoute.duration_h,
          track: challengeRoute.trackPoints,
          pois: [
            { name: routeType === 'motorcycle' ? 'Przełęcz Zakrętów' : 'Szczyt Górski', lat: shiftChallengeLat, lng: shiftChallengeLng }
          ]
        });
      }

      if (fastRoute) {
        alternatives.push({
          id: 'variant-c',
          name: 'Trasa Szybka (Klasyczna)',
          color: '#f59e0b', // Bursztynowy
          distance_km: fastRoute.distance_km,
          duration_h: fastRoute.duration_h,
          track: fastRoute.trackPoints,
          pois: isLoop ? [
            { name: 'Start/Koniec pętli', lat: start.lat, lng: start.lng },
            { name: 'Punkt zwrotny pętli', lat: places[1].lat, lng: places[1].lng }
          ] : [
            { name: 'Punkt Kontrolny Start', lat: start.lat, lng: start.lng },
            { name: 'Punkt Kontrolny Meta', lat: end.lat, lng: end.lng }
          ]
        });
      }

      if (alternatives.length > 0) {
        return alternatives;
      }
    } catch (err: any) {
      console.warn(`[Routing] Real Atlas alternatives failed, falling back to mock sinusoid: ${err.message}`);
    }

    // --- FALLBACK MATEMATYCZNY (Gdy brak klucza API lub zapytanie zawiedzie) ---
    const generateVariantTrack = (varianceFactor: number, detourType: string): [number, number][] => {
      const points: [number, number][] = [];
      const steps = 15;
      for (let i = 0; i <= steps; i++) {
        const ratio = i / steps;
        const wave = Math.sin(ratio * Math.PI) * varianceFactor;
        const lat = start.lat + (end.lat - start.lat) * ratio + wave + (Math.random() - 0.5) * 0.0005;
        const lng = start.lng + (end.lng - start.lng) * ratio + wave * 0.7 + (Math.random() - 0.5) * 0.0005;
        points.push([lat, lng]);
      }
      return points;
    };

    return [
      {
        id: 'variant-a',
        name: 'Trasa Krajobrazowa (Widokowa) (Mock)',
        color: '#10b981',
        distance_km: parseFloat((12.5 + Math.random() * 2).toFixed(2)),
        duration_h: parseFloat((3.5 + Math.random() * 0.8).toFixed(2)),
        track: generateVariantTrack(0.012, 'scenic'),
        pois: [
          { name: 'Punkt Widokowy', lat: start.lat + (end.lat - start.lat) * 0.3 + 0.006, lng: start.lng + (end.lng - start.lng) * 0.3 + 0.006 },
          { name: 'Schronisko Przyjazne', lat: start.lat + (end.lat - start.lat) * 0.7 - 0.003, lng: start.lng + (end.lng - start.lng) * 0.7 + 0.003 }
        ]
      },
      {
        id: 'variant-b',
        name: routeType === 'motorcycle' ? 'Trasa Kręta (Techniczna) (Mock)' : 'Trasa Wyzwanie (Górska) (Mock)',
        color: '#06b6d4',
        distance_km: parseFloat((14.2 + Math.random() * 3).toFixed(2)),
        duration_h: parseFloat((4.0 + Math.random() * 1.2).toFixed(2)),
        track: generateVariantTrack(-0.016, 'technical'),
        pois: [
          { name: routeType === 'motorcycle' ? 'Przełęcz Zakrętów' : 'Szczyt Górski', lat: start.lat + (end.lat - start.lat) * 0.5 - 0.008, lng: start.lng + (end.lng - start.lng) * 0.5 - 0.008 }
        ]
      },
      {
        id: 'variant-c',
        name: 'Trasa Szybka (Klasyczna) (Mock)',
        color: '#f59e0b',
        distance_km: 11.0,
        duration_h: 3.0,
        track: generateVariantTrack(0.002, 'fast'),
        pois: []
      }
    ];
  }

}

export const routingService = new RoutingService();
