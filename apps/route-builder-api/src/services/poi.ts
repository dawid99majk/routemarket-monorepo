export interface PoiCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  score: number;
  wikipedia?: string;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

// Selektory kategorii POI zależne od typu trasy — tylko obiekty z nazwą.
// Działają w globalnym bbox (ustawianym w nagłówku zapytania), bez filtrów around,
// bo te są zbyt kosztowne dla publicznych serwerów Overpass.
const CATEGORY_SELECTORS: Record<string, string[]> = {
  hiking: [
    'node["natural"~"^(peak|saddle|waterfall|cave_entrance)$"]["name"]',
    'node["tourism"="viewpoint"]["name"]',
    'nwr["tourism"~"^(alpine_hut|wilderness_hut|attraction)$"]["name"]',
    'nwr["historic"="castle"]["name"]'
  ],
  cycling: [
    'node["natural"="peak"]["name"]',
    'node["tourism"="viewpoint"]["name"]',
    'node["mountain_pass"="yes"]["name"]',
    'nwr["tourism"="attraction"]["name"]',
    'nwr["historic"="castle"]["name"]',
    'nwr["waterway"="dam"]["name"]'
  ],
  motorcycle: [
    'node["tourism"="viewpoint"]["name"]',
    'node["mountain_pass"="yes"]["name"]',
    'node["natural"="saddle"]["name"]',
    'nwr["tourism"="attraction"]["name"]',
    'nwr["historic"="castle"]["name"]',
    'nwr["waterway"="dam"]["name"]'
  ],
  city_walk: [
    'node["tourism"="viewpoint"]["name"]',
    'nwr["tourism"~"^(attraction|museum|gallery)$"]["name"]',
    'nwr["historic"~"^(castle|monument|memorial|city_gate|fort|church|cathedral)$"]["name"]',
    'nwr["leisure"="park"]["name"]',
    'nwr["amenity"="place_of_worship"]["wikipedia"]["name"]'
  ]
};

const ROUTE_TYPE_ALIASES: Record<string, string> = {
  hiking: 'hiking',
  city: 'city_walk',
  city_walk: 'city_walk',
  cycling: 'cycling',
  gravel: 'cycling',
  mtb: 'cycling',
  bicycle: 'cycling',
  road: 'cycling',
  motorcycle: 'motorcycle',
  car: 'motorcycle'
};

// Domyślny promień poszukiwań POI wokół startu [km]
const DEFAULT_RADIUS_KM: Record<string, number> = {
  hiking: 15,
  city_walk: 8,
  cycling: 35,
  motorcycle: 100
};

const cache = new Map<string, { at: number; data: PoiCandidate[] }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function scoreElement(tags: Record<string, string>): number {
  let score = 0;
  if (tags.wikipedia || tags['wikipedia:pl']) score += 3;
  if (tags.wikidata) score += 2;
  if (tags['name:en']) score += 1;
  if (tags.tourism === 'attraction') score += 1;
  if (tags.heritage) score += 1;
  return score;
}

function kindOf(tags: Record<string, string>): string {
  return (
    tags.natural ||
    tags.tourism ||
    tags.historic ||
    (tags.mountain_pass === 'yes' ? 'mountain_pass' : '') ||
    tags.waterway ||
    tags.leisure ||
    tags.amenity ||
    'poi'
  );
}

export class PoiService {
  async fetchCandidates(
    center: { lat: number; lng: number },
    routeType: string,
    options: { radiusKm?: number; limit?: number } = {}
  ): Promise<PoiCandidate[]> {
    const typeKey = ROUTE_TYPE_ALIASES[routeType] || 'hiking';
    const radiusKm = options.radiusKm || DEFAULT_RADIUS_KM[typeKey];
    const limit = options.limit || 40;

    const cacheKey = `${typeKey}:${center.lat.toFixed(2)}:${center.lng.toFixed(2)}:${radiusKm}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.data.slice(0, limit);
    }

    // bbox wokół centrum: 1 stopień szerokości ≈ 111 km
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
    const bbox = `${(center.lat - dLat).toFixed(4)},${(center.lng - dLng).toFixed(4)},${(center.lat + dLat).toFixed(4)},${(center.lng + dLng).toFixed(4)}`;

    const selectors = CATEGORY_SELECTORS[typeKey].map((s) => `${s};`).join('\n');
    const query = `[out:json][timeout:20][bbox:${bbox}];(\n${selectors}\n);out center qt 800;`;

    let elements: OverpassElement[] = [];
    let lastError: any = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'RouteMarketBuilderV3/1.0 (routemarket.io)'
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(22000)
        });
        if (!res.ok) throw new Error(`Overpass ${endpoint} HTTP ${res.status}`);
        const data = (await res.json()) as any;
        elements = data.elements || [];
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[POI] Overpass endpoint failed: ${endpoint}`, err);
      }
    }
    if (lastError) {
      console.error('[POI] All Overpass endpoints failed:', lastError);
      return [];
    }

    const seen = new Set<string>();
    const candidates: PoiCandidate[] = [];
    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name;
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!name || lat == null || lng == null) continue;
      const dedupeKey = name.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      candidates.push({
        id: `${el.type}/${el.id}`,
        name,
        lat,
        lng,
        kind: kindOf(tags),
        score: scoreElement(tags),
        wikipedia: tags.wikipedia || tags['wikipedia:pl']
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    cache.set(cacheKey, { at: Date.now(), data: candidates });
    return candidates.slice(0, limit);
  }

  /**
   * Dopasowuje nazwę waypointu z LLM do kandydata OSM (zwraca współrzędne z OSM
   * zamiast zgadywania geokoderem). Porównanie bez diakrytyków i wielkości liter.
   */
  matchCandidate(waypointName: string, candidates: PoiCandidate[]): PoiCandidate | null {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Człon główny: LLM dodaje kontekst po przecinku ("Śnieżka, Karkonosze"),
    // a OSM warianty językowe po ukośniku ("Śnieżka / Sněžka") — porównujemy pierwsze człony.
    const primaryOf = (s: string, sep: RegExp) => normalize(s.split(sep)[0]);
    const target = primaryOf(waypointName, /,/);
    if (!target || target.length < 4) return null;

    let best: PoiCandidate | null = null;
    let bestLen = 0;
    for (const cand of candidates) {
      const candName = primaryOf(cand.name, /[/(]/);
      if (!candName || candName.length < 4) continue;
      // Zawieranie targetu w środku dłuższej nazwy kandydata dopuszczamy tylko dla
      // nazw wielowyrazowych — inaczej "Karpacz" łapałby "Anomalia grawitacyjna w Karpaczu".
      const targetWords = target.split(' ').length;
      const hit =
        target === candName ||
        (candName.length >= 6 && target.includes(candName)) ||
        (candName.includes(target) && (targetWords >= 2 || candName.startsWith(target)));
      if (hit && candName.length > bestLen) {
        best = cand;
        bestLen = candName.length;
      }
    }
    return best;
  }

  /**
   * Buduje sekcję promptu z listą zweryfikowanych atrakcji dla trybu popular/wild.
   */
  buildPromptSection(candidates: PoiCandidate[], mode: string | undefined): string {
    if (candidates.length === 0) return '';

    const top = candidates.slice(0, 25);
    const rest = candidates.slice(25);
    const fmt = (list: PoiCandidate[]) =>
      list
        .map((p) => `- "${p.name}" (${p.kind}${p.score >= 3 ? ', KLASYK' : ''})`)
        .join('\n');

    let section = `\n=== ZWERYFIKOWANE ATRAKCJE W OKOLICY (realne dane OpenStreetMap, posortowane wg popularności) ===\n${fmt(top)}`;
    if (rest.length > 0) {
      section += `\nMniej znane miejsca (dla trybu niszowego):\n${fmt(rest)}`;
    }

    section += `\n\nZASADY UŻYCIA TEJ LISTY (BEZWZGLĘDNE!):
1. Punkty trasy dobieraj PRZEDE WSZYSTKIM z powyższej listy — to jedyne miejsca, których istnienie i lokalizacja są zweryfikowane.
2. Kopiuj nazwy DOKŁADNIE tak, jak są na liście (w cudzysłowie), bez zmian — system rozpozna je po nazwie i użyje dokładnych współrzędnych.
3. Spoza listy możesz dodawać tylko miejscowości (start, meta, przejazdowe) — nie atrakcje.`;

    if (mode === 'popular') {
      section += `\n4. TRYB KLASYK: trasa MUSI zawierać jak najwięcej punktów oznaczonych "KLASYK" (najlepiej wszystkie, które da się logicznie połączyć w zadanym dystansie). Pominięcie klasyka bez powodu jest błędem.`;
    } else if (mode === 'wild') {
      section += `\n4. TRYB NISZOWY: unikaj punktów oznaczonych "KLASYK" — wybieraj z sekcji mniej znanych miejsc oraz punkty o niższej popularności.`;
    }
    return section;
  }
}

export const poiService = new PoiService();
