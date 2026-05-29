export interface GeocodedPlace {
  name: string;
  lat: number;
  lng: number;
  confidence: number;
  source: string;
  provider: string;
}

export class GeocodingService {
  async geocodePoints(
    startPoint: string,
    endPoint?: string | null,
    options: { loop?: boolean; distanceTargetKm?: number | null } = {}
  ): Promise<GeocodedPlace[]> {
    console.log(`[Geocoding] Geocoding startPoint: "${startPoint}", endPoint: "${endPoint || 'None'}"...`);
    
    const places: GeocodedPlace[] = [];
    
    if (startPoint) {
      const startPlace = await this.geocodeSinglePoint(startPoint, 49.2701, 19.9802);
      places.push(startPlace);
      
      if (endPoint) {
        const endPlace = await this.geocodeSinglePoint(endPoint, 49.3000, 19.9900);
        places.push(endPlace);
      } else if (options.loop) {
        // Generujemy dynamiczny punkt kontrolny pętli w pobliżu punktu startowego
        places.push({
          name: `${startPlace.name} - punkt kontrolny pętli`,
          lat: startPlace.lat + 0.015,
          lng: startPlace.lng + 0.015,
          confidence: 0.85,
          source: 'ai_suggested_loop',
          provider: startPlace.provider
        });
      }
    }
    
    return places;
  }

  private async geocodeSinglePoint(query: string, defaultLat: number, defaultLng: number): Promise<GeocodedPlace> {
    const apiKey = process.env.GRAPHHOPPER_API_KEY || '';
    
    // 1. Próba GraphHopper Geocoding
    if (apiKey) {
      try {
        console.log(`[Geocoding] Trying GraphHopper Geocoding for: "${query}"`);
        const url = `https://graphhopper.com/api/1/geocode?q=${encodeURIComponent(query)}&locale=pl&key=${apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json() as any;
          if (data.hits && data.hits.length > 0) {
            const hit = data.hits[0];
            const displayName = [hit.name, hit.city, hit.country].filter(Boolean).join(', ');
            return {
              name: displayName || query,
              lat: hit.point.lat,
              lng: hit.point.lng,
              confidence: 0.95,
              source: 'graphhopper_api',
              provider: 'graphhopper'
            };
          }
        }
      } catch (err: any) {
        console.warn(`[Geocoding] GraphHopper geocoding failed: ${err.message}`);
      }
    }

    // 2. Fallback do OpenStreetMap Nominatim (darmowy i niezawodny)
    try {
      console.log(`[Geocoding] Trying OSM Nominatim Geocoding for: "${query}"`);
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RouteMarketBuilderV3/1.0' }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data && data.length > 0) {
          const item = data[0];
          return {
            name: item.display_name || query,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            confidence: 0.90,
            source: 'nominatim_api',
            provider: 'nominatim'
          };
        }
      }
    } catch (err: any) {
      console.warn(`[Geocoding] OSM Nominatim geocoding failed: ${err.message}`);
    }

    // 3. Ostateczny fallback do Zakopanego w przypadku braku połączenia
    console.log(`[Geocoding] Falling back to default coordinates for: "${query}"`);
    return {
      name: `${query} (Skalibrowane Zakopane)`,
      lat: defaultLat,
      lng: defaultLng,
      confidence: 0.50,
      source: 'fallback_mock',
      provider: 'mock_google'
    };
  }
}

export const geocodingService = new GeocodingService();
