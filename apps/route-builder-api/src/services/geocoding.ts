import { waypointEnrichmentService } from './waypoint-enrichment.js';
import { poiService } from './poi.js';

export interface GeocodedPlace {
  name: string;
  lat: number;
  lng: number;
  confidence: number;
  source: string;
  provider: string;
}

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

export class GeocodingService {
  async geocodePoints(
    startPoint: string,
    endPoint?: string | null,
    options: { loop?: boolean; distanceTargetKm?: number | null; intent?: string; routeType?: string; keyWaypoints?: string[] } = {}
  ): Promise<GeocodedPlace[]> {
    console.log(`[Geocoding] Geocoding startPoint: "${startPoint}", endPoint: "${endPoint || 'None'}"...`);
    
    const places: GeocodedPlace[] = [];
    
    if (startPoint) {
      const startPlace = await this.geocodeSinglePoint(startPoint);
      places.push(startPlace);
      
      if (endPoint) {
        const endPlace = await this.geocodeSinglePoint(endPoint);
        
        if (options.intent || (options.keyWaypoints && options.keyWaypoints.length > 0)) {
          return await waypointEnrichmentService.enrichWaypoints(
            startPlace, endPlace, 
            options.intent || '', options.routeType || 'hiking', options.distanceTargetKm || 0, options.keyWaypoints
          );
        } else {
          places.push(endPlace);
        }
      } else if (options.loop) {
        if (options.keyWaypoints && options.keyWaypoints.length > 0) {
          const enriched = await waypointEnrichmentService.enrichWaypoints(
            startPlace, startPlace,
            options.intent || '', options.routeType || 'hiking', options.distanceTargetKm || 0, options.keyWaypoints
          );
          places.push(...enriched.slice(1));
        } else {
          // Brak konkretnych punktów: zamiast sztucznego "punktu kontrolnego" pobieramy
          // realne atrakcje z OSM wokół startu i budujemy pętlę przez najpopularniejsze z nich.
          const routeType = options.routeType || 'hiking';
          const radiusKm = options.distanceTargetKm ? Math.max(3, options.distanceTargetKm / 4) : undefined;
          const pois = await poiService.fetchCandidates(
            { lat: startPlace.lat, lng: startPlace.lng },
            routeType,
            radiusKm ? { radiusKm, limit: 12 } : { limit: 12 }
          );
          if (pois.length > 0) {
            const topPois: GeocodedPlace[] = pois.slice(0, 6).map((p) => ({
              name: p.name,
              lat: p.lat,
              lng: p.lng,
              confidence: 0.95,
              source: 'osm_poi',
              provider: 'overpass'
            }));
            const ordered = await waypointEnrichmentService.enrichWaypoints(
              startPlace, startPlace,
              options.intent || '', routeType, options.distanceTargetKm || 0,
              undefined, topPois
            );
            places.push(...ordered.slice(1));
          } else {
            // Ostateczny fallback bez POI: minimalna pętla przez punkt oddalony o ~1/4 dystansu
            const targetOffset = options.distanceTargetKm ? options.distanceTargetKm / 314 : 0.015;
            places.push({
              name: `${startPlace.name} - punkt kontrolny pętli (${options.distanceTargetKm || '?'} km)`,
              lat: startPlace.lat + targetOffset,
              lng: startPlace.lng + targetOffset,
              confidence: 0.85,
              source: 'ai_suggested_loop',
              provider: startPlace.provider
            });
            places.push(startPlace);
          }
        }
      }
    }
    
    return places;
  }

  /**
   * Geokodowanie z progresywnym skracaniem zapytania. LLM dopisuje kontekst po przecinku,
   * często egzonim, którego OSM nie zna ("Vidly, Jesioniki" — nazwa Jesioniki nie istnieje
   * w bazie). Zamiast gubić punkt, próbujemy kolejno krótszych wariantów; biasPoint
   * pilnuje, żeby skrócona nazwa nie trafiła w inną część Europy.
   */
  /**
   * Geokodowanie miejscowości startowej. W odróżnieniu od zwykłych punktów trasy
   * ograniczamy wynik do osad (featuretype=settlement) — luźne frazy w rodzaju
   * "Złotych Hor i okolicy" potrafią inaczej dopasować się do przypadkowego obiektu
   * po drugiej stronie kraju i przenieść całą trasę w zły region.
   */
  async geocodeSettlement(query: string): Promise<GeocodedPlace> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&featuretype=settlement&addressdetails=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'RouteMarketBuilderV3/1.0' } });
      if (res.ok) {
        const data = await res.json() as any;
        if (data && data.length > 0) {
          const item = data[0];
          return {
            name: item.display_name || query,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            confidence: 0.95,
            source: 'nominatim_settlement',
            provider: 'nominatim'
          };
        }
      }
    } catch (err: any) {
      console.warn(`[Geocoding] Settlement lookup failed for "${query}": ${err.message}`);
    }
    return this.geocodeSinglePoint(query);
  }

  async geocodeSinglePoint(query: string, biasPoint?: {lat: number, lng: number}): Promise<GeocodedPlace> {
    const parts = query.split(',').map((p) => p.trim()).filter(Boolean);
    const variants: string[] = [query];
    // "A, B, C" -> "A, B" -> "A"
    for (let take = parts.length - 1; take >= 1; take--) {
      const variant = parts.slice(0, take).join(', ');
      if (variant && !variants.includes(variant)) variants.push(variant);
    }

    let lastError: any = null;
    // Najpierw wszystkie warianty nazwy w obrębie regionu trasy, dopiero potem
    // wyszukiwanie globalne — inaczej pospolita nazwa trafia w drugi koniec kraju.
    const passes = biasPoint ? [true, false] : [false];
    for (const bounded of passes) {
      for (const variant of variants) {
        try {
          return await this.geocodeExact(variant, biasPoint, variant !== query ? query : undefined, bounded);
        } catch (err) {
          lastError = err;
        }
      }
      if (bounded) {
        console.warn(`[Geocoding] "${query}" not found within the route region, widening search...`);
      }
    }
    throw lastError;
  }

  private async geocodeExact(query: string, biasPoint?: {lat: number, lng: number}, originalName?: string, boundedToRegion = false): Promise<GeocodedPlace> {
    const apiKey = process.env.GRAPHHOPPER_API_KEY || '';

    // 1. Główne geokodowanie - OpenStreetMap Nominatim (świetny do POI, dzielnic, zabytków)
    try {
      console.log(`[Geocoding] Trying OSM Nominatim Geocoding for: "${query}"${biasPoint ? ` near ${biasPoint.lat},${biasPoint.lng}` : ''}${boundedToRegion ? ' [bounded]' : ''}`);
      const limit = biasPoint ? 10 : 1;
      let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}`;
      if (biasPoint && boundedToRegion) {
        // Zamknięcie wyszukiwania w okolicy trasy. Pospolite nazwy ("Kępa", "Stawno")
        // występują w Polsce dziesiątki razy i sortowanie wyników po odległości nie
        // pomaga, jeśli Nominatim w ogóle nie zwróci tego właściwego w pierwszej
        // dziesiątce. bounded=1 odcina resztę kraju.
        const dLat = 0.45;
        const dLng = 0.45 / Math.max(0.2, Math.cos((biasPoint.lat * Math.PI) / 180));
        const left = (biasPoint.lng - dLng).toFixed(4);
        const right = (biasPoint.lng + dLng).toFixed(4);
        const top = (biasPoint.lat + dLat).toFixed(4);
        const bottom = (biasPoint.lat - dLat).toFixed(4);
        url += `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
      }
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RouteMarketBuilderV3/1.0' }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data && data.length > 0) {
          let item = data[0];
          if (biasPoint && data.length > 1) {
            const sorted = [...data].sort((a, b) => {
              const distA = getDistance(parseFloat(a.lat), parseFloat(a.lon), biasPoint.lat, biasPoint.lng);
              const distB = getDistance(parseFloat(b.lat), parseFloat(b.lon), biasPoint.lat, biasPoint.lng);
              return distA - distB;
            });
            item = sorted[0];
          }
          return {
            name: originalName || item.display_name || query,
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

    // 2. Fallback do GraphHopper (lepszy tylko dla ścisłych adresów z numerami domów).
    // W przebiegu ograniczonym do regionu pomijamy go — nie ma parametru bbox, więc
    // odesłałby odległy wynik i zniweczył sens zawężenia obszaru.
    if (apiKey && !boundedToRegion) {
      try {
        console.log(`[Geocoding] Trying GraphHopper Geocoding for: "${query}"${biasPoint ? ` near ${biasPoint.lat},${biasPoint.lng}` : ''}`);
        let url = `https://graphhopper.com/api/1/geocode?q=${encodeURIComponent(query)}&locale=pl&key=${apiKey}`;
        if (biasPoint) {
          url += `&point=${biasPoint.lat},${biasPoint.lng}`;
        }
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json() as any;
          if (data.hits && data.hits.length > 0) {
            let hits = data.hits;
            if (biasPoint) {
              hits = [...hits].sort((a, b) => {
                const distA = getDistance(a.point.lat, a.point.lng, biasPoint.lat, biasPoint.lng);
                const distB = getDistance(b.point.lat, b.point.lng, biasPoint.lat, biasPoint.lng);
                return distA - distB;
              });
            }
            const hit = hits[0];
            const displayName = [hit.name, hit.city, hit.country].filter(Boolean).join(', ');
            return {
              name: originalName || displayName || query,
              lat: hit.point.lat,
              lng: hit.point.lng,
              confidence: 0.85,
              source: 'graphhopper_api',
              provider: 'graphhopper'
            };
          }
        }
      } catch (err: any) {
        console.warn(`[Geocoding] GraphHopper geocoding failed: ${err.message}`);
      }
    }

    throw new Error(`Nie udało się odnaleźć punktu "${query}". Doprecyzuj nazwę miejsca, dodaj kraj/region albo użyj dokładniejszych danych wejściowych.`);
  }
}

export const geocodingService = new GeocodingService();
