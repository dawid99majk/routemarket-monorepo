import { GeocodedPlace } from './geocoding.js';

export interface RouteResult {
  distance_km: number;
  duration_h: number;
  trackPoints: [number, number][]; // [lat, lng]
  geometry?: {
    type: 'LineString';
    coordinates: number[][];
  };
}

export class RoutingService {
  private readonly orsApiKey = process.env.OPENROUTESERVICE_API_KEY || '';
  private readonly orsBaseUrl = 'https://api.openrouteservice.org/v2/directions';
  // GraphHopper kept as fallback
  private readonly ghApiKey = process.env.GRAPHHOPPER_API_KEY || '';
  private readonly ghBaseUrl = 'https://graphhopper.com/api/1/route';

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
    console.log(`[Routing] getRoute: Generating ${routeType} route for ${places.length} waypoints...`);
    
    if (places.length < 2) {
      throw new Error('Za mało punktów do wyznaczenia trasy (minimum 2).');
    }

    // PRIMARY: OpenRouteService (50 waypoints, cycling-mountain profile for gravel)
    if (this.orsApiKey) {
      try {
        return await this.fetchOrsRoute(places, routeType, options);
      } catch (err: any) {
        console.warn(`[Routing] ORS request failed, trying GraphHopper: ${err.message}`);
      }
    }

    // SECONDARY: GraphHopper (max 5 waypoints on free tier)
    if (this.ghApiKey) {
      try {
        const MAX_GH_POINTS = 5;
        let routePlaces = places;
        if (places.length > MAX_GH_POINTS) {
          const start = places[0];
          const end = places[places.length - 1];
          const middle = places.slice(1, -1);
          const step = middle.length / (MAX_GH_POINTS - 2);
          const sampled = Array.from({ length: MAX_GH_POINTS - 2 }, (_, i) => 
            middle[Math.round(i * step)]
          );
          routePlaces = [start, ...sampled, end];
          console.log(`[Routing] Trimmed to ${routePlaces.length} for GH free tier.`);
        }
        return await this.fetchGraphHopperRoute(routePlaces, routeType, options);
      } catch (err: any) {
        console.warn(`[Routing] GraphHopper also failed, using mock: ${err.message}`);
      }
    }

    // FALLBACK: Mathematical mock route
    const start = places[0];
    const end = places[places.length - 1];
    
    const points: [number, number][] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const wave = Math.sin(ratio * Math.PI) * 0.004;
      const lat = start.lat + (end.lat - start.lat) * ratio + wave + (Math.random() - 0.5) * 0.001;
      const lng = start.lng + (end.lng - start.lng) * ratio + wave * 0.6 + (Math.random() - 0.5) * 0.001;
      points.push([lat, lng]);
    }

    await new Promise(r => setTimeout(r, 200));

    return {
      distance_km: 12.5,
      duration_h: 3.5,
      trackPoints: points,
      geometry: {
        type: 'LineString',
        coordinates: points.map(p => [p[1], p[0]])
      }
    };
  }

  private mapOrsProfile(routeType: string): string {
    switch (routeType) {
      case 'motorcycle': return 'driving-car';
      case 'cycling':    return 'cycling-regular';
      case 'gravel':     return 'cycling-mountain'; // Best for gravel/MTB!
      case 'mtb':        return 'cycling-mountain';
      case 'hiking':     return 'foot-hiking';
      case 'city_walk':  return 'foot-walking';
      default:           return 'cycling-mountain';
    }
  }

  private async fetchOrsRoute(
    places: GeocodedPlace[],
    routeType: string,
    options?: { intent?: string; surfacePreferences?: string[] }
  ): Promise<RouteResult> {
    const profile = this.mapOrsProfile(routeType);
    
    // ORS expects [lng, lat] coordinate pairs
    const coordinates = places.map(p => [p.lng, p.lat]);

    const body: any = {
      coordinates,
      instructions: false,
      elevation: true,
      units: 'km',
      language: 'pl'
    };

    // For gravel/mountain biking: prefer unpaved surfaces
    if (routeType === 'gravel' || routeType === 'mtb') {
      body.options = {
        avoid_features: ['ferries'],
        profile_params: {
          weightings: {
            // steepness_difficulty: { level: 1 } // optional for MTB
          }
        }
      };
    }

    const url = `${this.orsBaseUrl}/${profile}/geojson`;
    console.log(`[ORS] Routing via profile=${profile} with ${places.length} waypoints`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.orsApiKey
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ORS API returned ${res.status}: ${errText}`);
    }

    const data = await res.json() as any;
    const feature = data.features?.[0];
    if (!feature) throw new Error('ORS returned no features.');

    const coordinates_out = feature.geometry.coordinates as number[][];
    const trackPoints = coordinates_out.map(c => [c[1], c[0]] as [number, number]);
    const summary = feature.properties?.summary;

    console.log(`[ORS] Route OK: ${summary?.distance?.toFixed(1)}km, ${summary?.duration?.toFixed(0)}s`);

    return {
      distance_km: parseFloat(((summary?.distance || 0) / 1000).toFixed(2)),
      duration_h: parseFloat(((summary?.duration || 0) / 3600).toFixed(2)),
      trackPoints,
      geometry: feature.geometry // GeoJSON LineString [lng, lat] - correct for GeoJSON
    };
  }

  private async fetchGraphHopperRoute(
    places: GeocodedPlace[], 
    routeType: string,
    options?: {
      intent?: string;
      surfacePreferences?: string[];
    }
  ): Promise<RouteResult> {
    const profileMap: Record<string, string> = {
      motorcycle: 'car', cycling: 'bike', gravel: 'bike', hiking: 'hike', city_walk: 'foot'
    };
    const profile = profileMap[routeType] || 'bike';
    const body: any = {
      points: places.map(p => [p.lng, p.lat]),
      profile,
      locale: 'pl',
      points_encoded: false,
      instructions: false,
      elevation: true
    };

    const url = `${this.ghBaseUrl}?key=${this.ghApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GraphHopper API returned ${res.status}: ${errText}`);
    }

    const data = await res.json() as any;
    if (!data.paths || data.paths.length === 0) throw new Error('GraphHopper returned empty paths.');

    const path = data.paths[0];
    const coordinates = path.points.coordinates as number[][];
    const trackPoints = coordinates.map(c => [c[1], c[0]] as [number, number]);

    return {
      distance_km: parseFloat((path.distance / 1000).toFixed(2)),
      duration_h: parseFloat((path.time / 3600000).toFixed(2)),
      trackPoints,
      geometry: { type: 'LineString', coordinates }
    };
  }

  async getRouteAlternatives(places: GeocodedPlace[], routeType: string, preferences: string[] = []): Promise<any[]> {
    console.log(`[Routing] getRouteAlternatives: Generating 3 alternatives for ${routeType} (API key present: ${!!this.apiKey})...`);
    
    if (places.length < 2) {
      throw new Error('Za mało punktów do wyznaczenia trasy (minimum 2).');
    }

    const start = places[0];
    const end = places[places.length - 1];
    const isLoop = places.length > 2 && start.lat === end.lat && start.lng === end.lng;

    // Jeśli posiadamy klucz GraphHopper, generujemy 3 prawdziwe trasy
    if (this.apiKey) {
      try {
        console.log(`[Routing] Generating real road-snapped alternatives via GraphHopper...`);
        
        let dLat: number;
        let dLng: number;
        let midLat: number;
        let midLng: number;
        
        if (isLoop) {
          // Dla pętli punkt odniesienia (checkpoint) to środkowy punkt trasy
          const checkpoint = places[1];
          dLat = checkpoint.lat - start.lat;
          dLng = checkpoint.lng - start.lng;
          midLat = checkpoint.lat;
          midLng = checkpoint.lng;
        } else {
          // Dla standardowej trasy punkt odniesienia to środek między startem a końcem
          dLat = end.lat - start.lat;
          dLng = end.lng - start.lng;
          midLat = (start.lat + end.lat) / 2;
          midLng = (start.lng + end.lng) / 2;
        }
        
        // Wektor prostopadły do przesunięć: (-dLng, dLat)
        // Przesunięcie o ok. 22% w jedną stronę dla Scenic
        const shiftScenicLat = midLat - dLng * 0.22;
        const shiftScenicLng = midLng + dLat * 0.22;
        
        // Przesunięcie o ok. 25% w drugą stronę dla Challenge
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

        // Wywołujemy 3 zapytania HTTP do GraphHoppera równolegle
        const [scenicRoute, challengeRoute, fastRoute] = await Promise.all([
          this.fetchRealGraphHopperRoute(scenicWaypoints, routeType).catch(err => {
            console.error(`[Routing] Scenic route fetch failed, falling back: ${err.message}`);
            return null;
          }),
          this.fetchRealGraphHopperRoute(challengeWaypoints, routeType).catch(err => {
            console.error(`[Routing] Challenge route fetch failed, falling back: ${err.message}`);
            return null;
          }),
          this.fetchRealGraphHopperRoute(fastWaypoints, routeType).catch(err => {
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
        console.warn(`[Routing] Real GraphHopper alternatives failed, falling back to mock sinusoid: ${err.message}`);
      }
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
