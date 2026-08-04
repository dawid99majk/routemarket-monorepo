import { GeocodedPlace } from './geocoding.js';
import { GraphHopperRoutingProvider, GoogleRoutesRoutingProvider, RoutingProfile } from '@routemarket/atlas-gis';
import { brouterProvider } from './brouter-provider.js';

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

    // Motocykl: najpierw BRouter z własnym profilem. Google z avoidHighways tylko
    // omija autostrady — dalej prowadzi krajową, bo liczy czas. Kręta wojewódzka
    // przez przełęcz wymaga kary za klasę drogi, a tę da się wyrazić wyłącznie
    // w profilu BRoutera. Na testowym odcinku w Beskidach: 36 km/47 min główną
    // drogą kontra 48 km/66 min trasą widokową.
    if (routeType === 'motorcycle') {
      try {
        const result = await brouterProvider.getRoute(optimizedPlaces, routeType);
        return {
          distance_km: result.distanceKm,
          duration_h: result.estimatedTimeH,
          trackPoints: result.points.map(p => [p.lat, p.lng, p.ele || 0]),
          geometry: result.geometryGeoJson,
          waypoints: optimizedPlaces
        };
      } catch (err: any) {
        console.warn(`[Routing] Profil motocyklowy BRoutera zawiódł, przechodzę na Google: ${err.message}`);
      }
    }

    // PRIMARY: Google Maps for car and motorcycle.
    // Motocykl: unikamy autostrad/ekspresówek — motocyklista chce krętych, malowniczych dróg.
    if (routeType === 'car' || routeType === 'motorcycle') {
      try {
        const result = await this.googleProvider.getRoute(optimizedPlaces, profile, {
          avoidHighways: routeType === 'motorcycle'
        });
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

    // Spacer po mieście: GraphHopper zna infrastrukturę pieszą — chodniki,
    // przejścia, deptaki i strefy ruchu pieszego. BRouter dostawał tu profil
    // `shortest`, który liczy wyłącznie metry, więc prowadził tą samą ulicą tam
    // i z powrotem, omijając nadmorski bulwar o kilkadziesiąt metrów dłuższy.
    if (routeType === 'city_walk' || routeType === 'city') {
      try {
        const result = await this.ghProvider.getRoute(optimizedPlaces, 'hiking');
        return {
          distance_km: result.distanceKm,
          duration_h: result.estimatedTimeH,
          trackPoints: result.points.map(p => [p.lat, p.lng, (p as any).ele || 0]),
          geometry: result.geometryGeoJson,
          waypoints: optimizedPlaces
        };
      } catch (err: any) {
        console.warn(`[Routing] GraphHopper foot failed, falling back to BRouter: ${err.message}`);
      }
    }

    // PRIMARY dla tras niemotorowych: BRouter — profile pod szlaki piesze/rowerowe
    // i brak limitu punktów pośrednich (GraphHopper free tier tnie trasę na kawałki po 5).
    if (brouterProvider.supportsRouteType(routeType)) {
      try {
        const result = await brouterProvider.getRoute(optimizedPlaces, routeType);
        return {
          distance_km: result.distanceKm,
          duration_h: result.estimatedTimeH,
          trackPoints: result.points.map(p => [p.lat, p.lng, p.ele || 0]),
          geometry: result.geometryGeoJson,
          waypoints: optimizedPlaces
        };
      } catch (err: any) {
        console.warn(`[Routing] BRouter failed, trying GraphHopper: ${err.message}`);
      }
    }

    // GraphHopper as universal fallback
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
      // Żadnych matematycznych mocków — sztuczna trasa (sinusoida) jest gorsza niż uczciwy błąd.
      throw new Error(`Nie udało się wyznaczyć trasy po drogach (${err.message}). Spróbuj ponownie lub zmień punkty.`);
    }
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

  /**
   * Warianty trasy oparte wyłącznie o realny routing przez faktyczne waypointy.
   * Żadnych sztucznych objazdów przez wymyślone punkty ani mocków — jeśli routing
   * się nie powiedzie, rzucamy błąd (wywołujący decyduje o fallbacku).
   */
  async getRouteAlternatives(places: GeocodedPlace[], routeType: string, preferences: string[] = []): Promise<any[]> {
    console.log(`[Routing] getRouteAlternatives: Generating alternatives for ${routeType}...`);

    if (places.length < 2) {
      throw new Error('Za mało punktów do wyznaczenia trasy (minimum 2).');
    }

    const start = places[0];
    const end = places[places.length - 1];
    const isLoop = places.length > 2 && start.lat === end.lat && start.lng === end.lng;
    const realPois = places.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng }));

    // Wariant pełny: przez wszystkie punkty (atrakcje)
    const fullRoute = await this.getRoute(places, routeType);

    const alternatives: any[] = [{
      id: 'variant-a',
      name: 'Trasa Pełna (wszystkie atrakcje)',
      color: '#10b981',
      distance_km: fullRoute.distance_km,
      duration_h: fullRoute.duration_h,
      track: fullRoute.trackPoints,
      pois: realPois
    }];

    // Wariant skrócony: tylko najważniejsze punkty (co drugi pośredni) — sensowny
    // dopiero przy min. 3 punktach pośrednich, inaczej dublowałby trasę pełną
    if (places.length >= 5) {
      const reducedPlaces = [start, ...places.slice(1, -1).filter((_, i) => i % 2 === 0), end];
      try {
        const reducedRoute = await this.getRoute(reducedPlaces, routeType);
        alternatives.push({
          id: 'variant-b',
          name: 'Trasa Skrócona (kluczowe punkty)',
          color: '#f59e0b',
          distance_km: reducedRoute.distance_km,
          duration_h: reducedRoute.duration_h,
          track: reducedRoute.trackPoints,
          pois: reducedPlaces.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng }))
        });
      } catch (err: any) {
        console.warn(`[Routing] Reduced variant failed, skipping: ${err.message}`);
      }
    }

    // Wariant bezpośredni: start -> meta (lub start -> punkt zwrotny -> start dla pętli)
    if (places.length > 2) {
      const directPlaces = isLoop ? [start, places[Math.floor(places.length / 2)], end] : [start, end];
      try {
        const directRoute = await this.getRoute(directPlaces, routeType);
        alternatives.push({
          id: 'variant-c',
          name: 'Trasa Bezpośrednia (minimum przystanków)',
          color: '#06b6d4',
          distance_km: directRoute.distance_km,
          duration_h: directRoute.duration_h,
          track: directRoute.trackPoints,
          pois: directPlaces.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng }))
        });
      } catch (err: any) {
        console.warn(`[Routing] Direct variant failed, skipping: ${err.message}`);
      }
    }

    return alternatives;
  }

}

export const routingService = new RoutingService();
