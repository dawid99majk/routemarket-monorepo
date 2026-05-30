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
      const startPlace = await this.geocodeSinglePoint(startPoint);
      places.push(startPlace);
      
      if (endPoint) {
        const endPlace = await this.geocodeSinglePoint(endPoint);
        places.push(endPlace);
      } else if (options.loop) {
        // Generujemy dynamiczny punkt kontrolny pętli w pobliżu punktu startowego
        // Aby uzyskać pętlę o dystansie X, potrzebujemy segmentu X/2.
        // Przesunięcie o D stopni w lat i lng daje segment D * 1.41 * 111 km.
        // D = (X/2) / (1.41 * 111) = X / 314.
        const targetOffset = options.distanceTargetKm ? options.distanceTargetKm / 314 : 0.015;
        
        places.push({
          name: `${startPlace.name} - punkt kontrolny pętli (${options.distanceTargetKm || '?'} km)`,
          lat: startPlace.lat + targetOffset,
          lng: startPlace.lng + targetOffset,
          confidence: 0.85,
          source: 'ai_suggested_loop',
          provider: startPlace.provider
        });

        // Powrót do startu dla pętli
        places.push(startPlace);
      }
    }
    
    return places;
  }

  private async geocodeSinglePoint(query: string): Promise<GeocodedPlace> {
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

    throw new Error(`Nie udało się odnaleźć punktu "${query}". Doprecyzuj nazwę miejsca, dodaj kraj/region albo użyj dokładniejszych danych wejściowych.`);
  }
}

export const geocodingService = new GeocodingService();
