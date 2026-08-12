import { waypointEnrichmentService } from './waypoint-enrichment.js';
import { poiService } from './poi.js';

export interface GeocodedPlace {
  name: string;
  lat: number;
  lng: number;
  confidence: number;
  source: string;
  provider: string;
  /** Dwuliterowy kod kraju z Nominatim, np. "pl". Nominatim i tak go zwraca. */
  countryCode?: string | null;
}

/**
 * Nominatim wymaga nagłówka, po którym da się zidentyfikować aplikację i
 * skontaktować z jej autorem — anonimowy ruch bywa blokowany bez ostrzeżenia.
 */
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || 'RouteMarket/1.0 (+https://routemarket.io; kontakt@routemarket.io)';

/**
 * Cache wyników geokodowania. Jedna rozmowa potrafi pytać o te same nazwy
 * wielokrotnie (korekta dystansu geokoduje punkty od nowa), a kolejne trasy w
 * tym samym regionie trafiają w ten sam zestaw miejsc. Pojedyncze zapytanie o
 * punkt to nawet kilka wywołań HTTP (warianty nazwy × przebieg zawężony i
 * globalny), więc trafienie w cache oszczędza sporo czasu i limitów.
 *
 * Nieudane wyszukiwania też zapamiętujemy, ale krócej: nazwa zmyślona przez
 * model nie zacznie istnieć w OSM w ciągu kwadransa, a bez tego każdy taki
 * punkt kosztuje pełną serię prób.
 */
interface CacheEntry {
  at: number;
  place?: GeocodedPlace;
  error?: string;
}

const geocodeCache = new Map<string, CacheEntry>();
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;

function cacheKey(query: string, biasPoint?: { lat: number; lng: number }, maxRadiusKm?: number): string {
  const bias = biasPoint ? `${biasPoint.lat.toFixed(2)},${biasPoint.lng.toFixed(2)}` : '-';
  return `${query.trim().toLowerCase()}|${bias}|${maxRadiusKm ?? '-'}`;
}

function readCache(key: string): CacheEntry | null {
  const entry = geocodeCache.get(key);
  if (!entry) return null;
  const ttl = entry.place ? HIT_TTL_MS : MISS_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    geocodeCache.delete(key);
    return null;
  }
  return entry;
}

function writeCache(key: string, entry: CacheEntry) {
  // Najstarszy klucz wypada pierwszy — Map zachowuje kolejność wstawiania.
  if (geocodeCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest !== undefined) geocodeCache.delete(oldest);
  }
  geocodeCache.set(key, entry);
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
  /**
   * Środek miasta. Nominatim zwraca dla dużych miast KILKA pasujących granic
   * administracyjnych — dla Wrocławia obwód gminy (addresstype=administrative,
   * środek wypada na Gądowie, 4,5 km od Rynku) oraz samo miasto
   * (addresstype=city, środek przy Rynku). Kolejność wyników bywa różna między
   * zapytaniami, więc branie pierwszego z brzegu dawało raz jeden punkt, raz
   * drugi — i cała trasa układała się wtedy poza centrum.
   *
   * Dlatego nie polegamy na kolejności, tylko wybieramy po typie obiektu.
   */
  async geocodeSettlement(query: string): Promise<GeocodedPlace> {
    const PREFERRED = ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb'];
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=5&addressdetails=1`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) {
        const data = await res.json() as any[];
        if (Array.isArray(data) && data.length > 0) {
          const preferred = PREFERRED
            .map((type) => data.find((d) => d.addresstype === type))
            .find(Boolean);
          const item = preferred || data[0];
          if (preferred && item !== data[0]) {
            console.log(`[Geocoding] "${query}": wybrano ${item.addresstype} zamiast ${data[0].addresstype}`);
          }
          return {
            name: item.display_name || query,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            confidence: 0.95,
            source: 'nominatim_settlement',
            provider: 'nominatim',
            countryCode: item.address?.country_code
              ? String(item.address.country_code).toUpperCase()
              : null
          };
        }
      }
    } catch (err: any) {
      console.warn(`[Geocoding] Settlement lookup failed for "${query}": ${err.message}`);
    }
    return this.geocodeSinglePoint(query);
  }

  async geocodeSinglePoint(query: string, biasPoint?: {lat: number, lng: number}, maxRadiusKm?: number): Promise<GeocodedPlace> {
    const key = cacheKey(query, biasPoint, maxRadiusKm);
    const cached = readCache(key);
    if (cached) {
      if (cached.place) return cached.place;
      throw new Error(cached.error);
    }

    try {
      const place = await this.geocodeSinglePointUncached(query, biasPoint, maxRadiusKm);
      writeCache(key, { at: Date.now(), place });
      return place;
    } catch (err: any) {
      writeCache(key, { at: Date.now(), error: err?.message || `Nie udało się odnaleźć punktu "${query}".` });
      throw err;
    }
  }

  private async geocodeSinglePointUncached(query: string, biasPoint?: {lat: number, lng: number}, maxRadiusKm?: number): Promise<GeocodedPlace> {
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
          return await this.geocodeExact(variant, biasPoint, variant !== query ? query : undefined, bounded, maxRadiusKm);
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

  private async geocodeExact(query: string, biasPoint?: {lat: number, lng: number}, originalName?: string, boundedToRegion = false, maxRadiusKm?: number): Promise<GeocodedPlace> {
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
        // Okno skalowane do zasięgu trasy: dla spaceru po mieście 50 km promienia
        // wpuszczało imienników z drugiego końca aglomeracji.
        const spanKm = Math.min(50, Math.max(3, (maxRadiusKm ?? 50) * 1.5));
        const dLat = spanKm / 111;
        const dLng = dLat / Math.max(0.2, Math.cos((biasPoint.lat * Math.PI) / 180));
        const left = (biasPoint.lng - dLng).toFixed(4);
        const right = (biasPoint.lng + dLng).toFixed(4);
        const top = (biasPoint.lat + dLat).toFixed(4);
        const bottom = (biasPoint.lat - dLat).toFixed(4);
        url += `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
      }
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
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
