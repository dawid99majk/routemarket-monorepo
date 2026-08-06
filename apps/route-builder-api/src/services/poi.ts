export interface PoiCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  score: number;
  wikipedia?: string;
  distanceKm?: number;
  rank?: number;
  openingHours?: string;
  website?: string;
  /** Parkingi: opłata i pojemność decydują o wyborze bardziej niż nazwa. */
  fee?: string;
  capacity?: string;
}


/**
 * Środek ciężkości atrakcji. Geokoder dla dużego miasta zwraca centroid granic
 * administracyjnych: dla Wrocławia wypadał w magazynie na Gądowie, 4,5 km od
 * Rynku, więc cała trasa układała się poza centrum. Mediana najlepiej ocenionych
 * punktów trafia tam, gdzie faktycznie jest co zwiedzać, i jest odporna na
 * pojedyncze atrakcje na obrzeżach.
 */
export function poiClusterCenter(candidates: PoiCandidate[], take = 20): { lat: number; lng: number } | null {
  const top = [...candidates].sort((a, b) => b.score - a.score).slice(0, take);
  if (top.length < 5) return null;
  const median = (nums: number[]) => {
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  return { lat: median(top.map((c) => c.lat)), lng: median(top.map((c) => c.lng)) };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Zmierzone z VPS: overpass-api.de bywa przeciążony (504), maps.mail.ru odpowiada
// stabilnie. Odpytujemy równolegle i bierzemy pierwszą poprawną odpowiedź.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

// Selektory kategorii POI zależne od typu trasy — tylko obiekty z nazwą.
// Działają w globalnym bbox (ustawianym w nagłówku zapytania), bez filtrów around,
// bo te są zbyt kosztowne dla publicznych serwerów Overpass.
const CATEGORY_SELECTORS: Record<string, string[]> = {
  // Spacer zielony: parki, bulwary, nabrzeża — miejsca, przez które się idzie,
  // a nie do których się wchodzi.
  green: [
    'nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]',
    'nwr["landuse"~"^(forest|village_green)$"]["name"]',
    'node["tourism"="viewpoint"]["name"]',
    'nwr["natural"~"^(water|beach|wood)$"]["name"]',
    'nwr["waterway"="riverbank"]["name"]',
    'nwr["highway"="pedestrian"]["name"]'
  ],
  // Wyszukiwarka projektów: jedzenie, wieczory i noclegi
  food: [
    'nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"]["name"]',
    'nwr["shop"~"^(bakery|pastry|deli)$"]["name"]'
  ],
  nightlife: [
    'nwr["amenity"~"^(bar|pub|nightclub|biergarten|theatre|cinema)$"]["name"]',
    'nwr["leisure"="dance"]["name"]'
  ],
  hotel: [
    'nwr["tourism"~"^(hotel|hostel|guest_house|apartment)$"]["name"]'
  ],
  // Parkingi: punkt startu dla przyjeżdżających autem. Prywatnych nie pokazujemy,
  // bo nie da się na nich stanąć.
  parking: [
    'nwr["amenity"="parking"]["access"!~"^(private|no|customers)$"]'
  ],
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
  // Szosa: cele osiągalne na rowerze szosowym — przełęcze drogowe, miasteczka,
  // zabytki. Bez szczytów, jaskiń i sztolni, do których prowadzą tylko szlaki piesze.
  road: [
    'node["mountain_pass"="yes"]["name"]',
    'node["natural"="saddle"]["name"]',
    'node["tourism"="viewpoint"]["name"]',
    'nwr["historic"~"^(castle|monument|city_gate)$"]["name"]',
    'nwr["tourism"="attraction"]["name"]',
    'nwr["waterway"="dam"]["name"]',
    'nwr["natural"="water"]["wikidata"]["name"]'
  ],
  motorcycle: [
    'node["tourism"="viewpoint"]["name"]',
    'node["mountain_pass"="yes"]["name"]',
    'node["natural"="saddle"]["name"]',
    'nwr["tourism"="attraction"]["name"]',
    'nwr["historic"="castle"]["name"]',
    'nwr["waterway"="dam"]["name"]'
  ],
  // Spacer po mieście to nie objazd po kościołach. Sama lista zabytków sakralnych
  // dawała trasy, na których z dzieckiem nie ma czego robić — stąd place, rynki,
  // deptaki, place zabaw, fontanny i zoo obok muzeów i zabytków.
  city_walk: [
    'node["tourism"="viewpoint"]["name"]',
    'nwr["tourism"~"^(attraction|museum|gallery|zoo|aquarium|theme_park)$"]["name"]',
    'nwr["historic"~"^(castle|monument|memorial|city_gate|fort|church|cathedral|tower|bridge)$"]["name"]',
    'nwr["leisure"~"^(park|garden|playground|water_park)$"]["name"]',
    'nwr["place"~"^(square)$"]["name"]',
    'nwr["highway"="pedestrian"]["area"="yes"]["name"]',
    'node["amenity"="fountain"]["name"]',
    'nwr["amenity"~"^(theatre|marketplace)$"]["name"]',
    'nwr["amenity"="place_of_worship"]["wikipedia"]["name"]'
  ]
};

const ROUTE_TYPE_ALIASES: Record<string, string> = {
  green: 'green',
  food: 'food',
  parking: 'parking',
  nightlife: 'nightlife',
  hotel: 'hotel',
  hiking: 'hiking',
  city: 'city_walk',
  city_walk: 'city_walk',
  cycling: 'cycling',
  gravel: 'cycling',
  mtb: 'cycling',
  bicycle: 'cycling',
  road: 'road',
  motorcycle: 'motorcycle',
  car: 'motorcycle'
};

// Domyślny promień poszukiwań POI wokół startu [km]
const DEFAULT_RADIUS_KM: Record<string, number> = {
  green: 8,
  food: 6,
  parking: 5,
  nightlife: 6,
  hotel: 8,
  hiking: 15,
  city_walk: 8,
  cycling: 35,
  road: 45,
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
  /** Promień używany, gdy dystans trasy nie jest jeszcze znany. */
  defaultRadiusKm(routeType: string): number {
    const typeKey = ROUTE_TYPE_ALIASES[routeType] || 'hiking';
    return DEFAULT_RADIUS_KM[typeKey];
  }

  private buildQuery(bbox: string, typeKey: string, notableOnly: boolean): string {
    // notableOnly: tylko obiekty z wpisem w Wikidata — czyli miejsca faktycznie znane,
    // te, których użytkownik oczekuje w trybie "Klasyk".
    const selectors = CATEGORY_SELECTORS[typeKey]
      .map((s) => (notableOnly ? `${s}["wikidata"];` : `${s};`))
      .join('\n');
    // Limit musi być wysoki: `out ... qt N` obcina wyniki w kolejności geograficznej,
    // więc zbyt niski cap wycina całe połacie obszaru (tak wypadał Praděd z Jesioników).
    const cap = notableOnly ? 3000 : 1500;
    return `[out:json][timeout:25][bbox:${bbox}];(\n${selectors}\n);out center qt ${cap};`;
  }

  /**
   * Odpytuje wszystkie mirrory równolegle i bierze pierwszą poprawną odpowiedź —
   * publiczne serwery Overpass bywają przeciążone, a sekwencyjny failover zjadał
   * cały budżet czasu requestu użytkownika.
   */
  private async runQuery(query: string, label: string): Promise<OverpassElement[]> {
    const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RouteMarketBuilderV3/1.0 (routemarket.io)'
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(25000)
      });
      if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}`);
      const data = (await res.json()) as any;
      const elements = data.elements || [];
      if (elements.length === 0) throw new Error(`${endpoint} returned no elements`);
      console.log(`[POI] ${label}: ${elements.length} elements from ${new URL(endpoint).host}`);
      return elements as OverpassElement[];
    });

    try {
      return await Promise.any(attempts);
    } catch (err: any) {
      const reasons = (err.errors || []).map((e: any) => e.message).join('; ');
      throw new Error(`all Overpass mirrors failed (${reasons})`);
    }
  }

  async fetchCandidates(
    center: { lat: number; lng: number },
    routeType: string,
    options: { radiusKm?: number; limit?: number; includeMinor?: boolean } = {}
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

    // Dwa rozdzielne zapytania zamiast jednego: samo `out ... 800` obcina wyniki
    // w kolejności geograficznej, więc przy tysiącach drobnych szczytów klasyki
    // regionu (np. Praděd) mogłyby w ogóle nie trafić do listy.
    // Każde zapytanie samodzielnie znosi awarię — wynik jednego jest wart więcej
    // niż nic, a Overpass potrafi obsłużyć jedno, a wywrócić się na drugim.
    let degraded = false;

    // Zapytanie "notable" szuka obiektów z wpisem w Wikidata. Dla restauracji i
    // parkingów takich po prostu nie ma, więc query zawsze wracało puste albo z
    // timeoutem — a to oznaczało wynik "niepełny", którego nie wolno zapisać w
    // cache'u. Każda tura wywiadu płaciła więc pełny timeout Overpassa za listę,
    // która i tak nigdy nic nie wnosiła.
    const NO_NOTABLE = new Set(['food', 'parking', 'hotel', 'nightlife']);
    const queries: Promise<OverpassElement[]>[] = [];
    if (!NO_NOTABLE.has(typeKey)) {
      queries.push(
        this.runQuery(this.buildQuery(bbox, typeKey, true), `${cacheKey}/notable`).catch((err) => {
          console.warn(`[POI] Notable query failed: ${err.message}`);
          degraded = true;
          return [] as OverpassElement[];
        })
      );
    }
    if (options.includeMinor !== false) {
      queries.push(
        this.runQuery(this.buildQuery(bbox, typeKey, false), `${cacheKey}/all`).catch((err) => {
          console.warn(`[POI] Broad query failed: ${err.message}`);
          degraded = true;
          return [] as OverpassElement[];
        })
      );
    }

    const elements = (await Promise.all(queries)).flat();
    if (elements.length === 0) {
      // Przeterminowany cache jest znacznie lepszy niż brak atrakcji w prompcie
      const stale = cache.get(cacheKey);
      if (stale) {
        console.warn('[POI] Overpass unavailable — serving stale cached candidates.');
        return stale.data.slice(0, limit);
      }
      console.error('[POI] Overpass unavailable and no cached candidates.');
      return [];
    }

    const seen = new Set<string>();
    const candidates: PoiCandidate[] = [];
    for (const el of elements) {
      const tags = el.tags || {};
      const isParking = tags.amenity === 'parking';
      // Większość parkingów w OSM nie ma nazwy własnej. Etykietę składamy z tego,
      // co jest — operatora albo ulicy — bo to tylko podpis: o położeniu decydują
      // współrzędne prosto z OSM, więc nic tu nie trzeba geokodować ani zgadywać.
      const name = tags.name || (isParking
        ? ['Parking', tags.operator || tags['addr:street'] || ''].filter(Boolean).join(' — ')
        : undefined);
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (!name || lat == null || lng == null) continue;
      // Bezimienne parkingi mają tę samą etykietę, więc odsiewamy je po położeniu
      const dedupeKey = tags.name
        ? name.toLowerCase()
        : `${name.toLowerCase()}|${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      candidates.push({
        id: `${el.type}/${el.id}`,
        name,
        lat,
        lng,
        kind: kindOf(tags),
        score: scoreElement(tags),
        wikipedia: tags.wikipedia || tags['wikipedia:pl'],
        openingHours: tags.opening_hours,
        website: tags.website || tags['contact:website'],
        fee: tags.fee,
        capacity: tags.capacity
      });
    }

    // Ranking: rozpoznawalność, ale z karą za oddalenie — atrakcja 50 km za granicą
    // obszaru nie jest lepszym punktem trasy niż porównywalny klasyk tuż obok.
    for (const c of candidates) {
      const distKm = haversineKm(center.lat, center.lng, c.lat, c.lng);
      c.distanceKm = Math.round(distKm * 10) / 10;
      c.rank = c.score - (distKm / radiusKm) * 2.5;
    }
    candidates.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
    // Niepełnego wyniku nie utrwalamy: gdy szersze zapytanie padnie, zostają same
    // obiekty z Wikidaty — znikają zwykłe parki i place (krakowskie Planty), a taka
    // okrojona lista siedziałaby w cache godzinę i psuła kolejne trasy.
    if (degraded) {
      console.warn(`[POI] Incomplete result (${candidates.length} POI) — not caching.`);
    } else {
      cache.set(cacheKey, { at: Date.now(), data: candidates });
    }
    return candidates.slice(0, limit);
  }

  /**
   * Dopasowuje nazwę waypointu z LLM do kandydata OSM (zwraca współrzędne z OSM
   * zamiast zgadywania geokoderem). Porównanie bez diakrytyków i wielkości liter.
   */
  matchCandidate(
    waypointName: string,
    candidates: PoiCandidate[],
    reference?: { lat: number; lng: number }
  ): PoiCandidate | null {
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

    // Zbieramy WSZYSTKIE trafienia, bo w mieście te same wezwania powtarzają się
    // po kilka razy ("Bazylika Wniebowzięcia NMP" jest i przy Rynku, i w Mogile).
    const hits: PoiCandidate[] = [];
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
      if (!hit) continue;
      if (candName.length > bestLen) bestLen = candName.length;
      hits.push(cand);
    }
    if (hits.length === 0) return null;

    // Spośród równie dobrych dopasowań nazwy wybieramy najbliższe punktowi
    // odniesienia. Bez tego trasa po Starym Mieście potrafiła skoczyć 8 km
    // na drugi koniec miasta do kościoła o tym samym wezwaniu.
    const equallyGood = hits.filter((c) => primaryOf(c.name, /[/(]/).length === bestLen);
    const pool = equallyGood.length > 0 ? equallyGood : hits;
    if (!reference || pool.length === 1) return pool[0];

    let best = pool[0];
    let bestDist = haversineKm(reference.lat, reference.lng, best.lat, best.lng);
    for (const cand of pool.slice(1)) {
      const dist = haversineKm(reference.lat, reference.lng, cand.lat, cand.lng);
      if (dist < bestDist) {
        best = cand;
        bestDist = dist;
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
    // Odległość od startu jest dla agenta kluczowa przy dopasowaniu trasy do dystansu
    const fmt = (list: PoiCandidate[]) =>
      list
        .map((p) => `- "${p.name}" (${p.kind}${p.distanceKm != null ? `, ${p.distanceKm} km od startu` : ''}${p.score >= 3 ? ', KLASYK' : ''})`)
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
