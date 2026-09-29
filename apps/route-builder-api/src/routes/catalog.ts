import { Hono } from 'hono';
import { repo } from '../db/repository.js';
import { geocodingService } from '../services/geocoding.js';
import { poiService, poiClusterCenter, type PoiCandidate } from '../services/poi.js';
import { callGeminiTracked } from '../services/ai-usage.js';
import { jezykZadania, JEZYKI_UI, type KodJezyka } from '../services/jezyki.js';
import { przetlumaczPaczke } from '../services/tlumaczenia.js';
import { fetchNearbyPhotos, odczytajNieudaneCommons, wyzerujNieudaneCommons } from '../services/photos.js';
import { placeSlug, VIBE_TAGS, kategoriaZRodzaju } from '../services/katalog-helpers.js';
import { STYL_OPISU } from '../services/styl-opisow.js';

export const catalogRouter = new Hono<{ Variables: { user: any, userId: string } }>();

/**
 * Wpis w katalogu miejsc. Do tej pory miejsce istniało wyłącznie jako wiersz
 * przypięty do tablicy: to samo muzeum na trzech tablicach było trzema bytami,
 * bez wspólnej strony i bez możliwości policzenia, ile osób je przypięło.
 * Rozpoznajemy po identyfikatorze z OSM, a gdy go brak — po nazwie i położeniu.
 */
catalogRouter.post('/catalog/upsert', async (c) => {
  try {
    const body = await c.req.json() as {
      name: string; lat: number; lng: number; city?: string; country?: string;
      category?: string; kind?: string; description?: string; wiki_extract?: string;
      photos?: string[]; opening_hours?: string; website?: string; visit_minutes?: number;
      osm_id?: string;
    };
    if (!body?.name || body.lat == null || body.lng == null) {
      return c.json({ error: 'name, lat i lng są wymagane' }, 400);
    }

    const slug = placeSlug(body.name, body.city ?? null, body.lat, body.lng);
    const row = {
      slug,
      name: body.name.trim(),
      city: body.city ?? null,
      country: body.country ?? null,
      lat: body.lat,
      lng: body.lng,
      category: body.category || 'attraction',
      kind: body.kind ?? null,
      description: body.description || '',
      wiki_extract: body.wiki_extract ?? null,
      photos: body.photos ?? [],
      opening_hours: body.opening_hours ?? null,
      website: body.website ?? null,
      visit_minutes: body.visit_minutes ?? null,
      osm_id: body.osm_id ?? null,
      updated_at: new Date().toISOString()
    };

    const existing = await repo.findCatalogPlace(body.osm_id ?? null, slug);
    if (existing) {
      // Nie nadpisujemy tego, co już mamy, pustkami z gorszego źródła
      const merged: Record<string, unknown> = { updated_at: row.updated_at };
      for (const key of ['description', 'wiki_extract', 'opening_hours', 'website', 'visit_minutes', 'kind', 'city', 'country'] as const) {
        if (!existing[key] && row[key]) merged[key] = row[key];
      }
      if ((!existing.photos || existing.photos.length === 0) && row.photos.length > 0) merged.photos = row.photos;
      const updated = await repo.updateCatalogPlace(existing.id, merged);
      return c.json({ id: existing.id, slug: existing.slug, created: false, place: updated ?? existing });
    }

    const created = await repo.insertCatalogPlace(row);
    console.log(`[catalog] Nowe miejsce: "${row.name}" (${slug})`);
    return c.json({ id: created.id, slug: created.slug, created: true, place: created });
  } catch (err: any) {
    console.error('[catalog/upsert] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});

/**
 * Tłumaczenie opisów katalogu na języki interfejsu.
 *
 * Opisy są współdzielone, a nie generowane na żądanie, więc język nie może być
 * parametrem pojedynczego zapytania: pierwszy Niemiec, który zasiałby miasto,
 * nadpisałby opisy wszystkim pozostałym. Stąd osobny wymiar w danych
 * (description_i18n) i osobna, jednorazowa operacja, która go wypełnia.
 *
 * Idzie paczkami po piętnaście, sekwencyjnie. Równolegle byłoby szybciej i
 * skończyłoby się limitem po stronie modelu w połowie katalogu — a wtedy nie
 * wiadomo, co się zapisało, a co nie.
 */
catalogRouter.post('/catalog/translate-descriptions', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { languages?: string[]; limit?: number };
    const cele = (body.languages ?? JEZYKI_UI.filter((j) => j !== 'pl')) as KodJezyka[];
    const nieznane = cele.filter((j) => !(JEZYKI_UI as readonly string[]).includes(j));
    if (nieznane.length) return c.json({ error: `Nieznane języki: ${nieznane.join(', ')}` }, 400);

    const limit = Math.min(body.limit ?? 500, 1000);
    const PACZKA = 15;
    const raport: Record<string, { przetlumaczono: number; pominieto: number }> = {};

    for (const jezyk of cele) {
      const doZrobienia = await repo.listOpisyDoTlumaczenia(jezyk, limit);
      let zrobione = 0;
      for (let i = 0; i < doZrobienia.length; i += PACZKA) {
        const paczka = doZrobienia.slice(i, i + PACZKA);
        const wejscie = paczka.map((r: any) => ({
          id: r.id,
          name: r.name,
          tekst: String(r.description_i18n?.pl ?? r.description ?? ''),
        })).filter((x) => x.tekst);
        if (!wejscie.length) continue;

        let mapa: Record<string, string> = {};
        try {
          mapa = await przetlumaczPaczke(wejscie, jezyk, c.get('userId') || null);
        } catch (err: any) {
          console.warn(`[tlumaczenia] ${jezyk}, paczka ${i / PACZKA + 1}: ${err.message}`);
          continue;
        }

        for (const r of paczka) {
          const tekst = mapa[r.id];
          if (!tekst) continue;
          // updateCatalogPlace odrzuca łatki jednopolowe, a przy okazji chcemy
          // znacznik czasu — stąd dwa pola zamiast jednego.
          await repo.updateCatalogPlace(r.id, {
            description_i18n: { ...(r.description_i18n ?? {}), [jezyk]: tekst },
            updated_at: new Date().toISOString(),
          });
          zrobione++;
        }
      }
      raport[jezyk] = { przetlumaczono: zrobione, pominieto: doZrobienia.length - zrobione };
      console.log(`[tlumaczenia] ${jezyk}: ${zrobione}/${doZrobienia.length}`);
    }

    const pokrycie = await repo.pokrycieJezykow([...JEZYKI_UI]);
    return c.json({ raport, pokrycie });
  } catch (e: any) {
    console.error('[catalog/translate-descriptions]', e);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Zasilenie katalogu miejscami z danego miasta. Feed odkrywczy bez treści jest
 * pustą półką, a treść musi skądś przyjść — bierzemy ją z OSM (fakty i
 * współrzędne) plus jedno wywołanie modelu na opisy i znaczniki dla całej partii.
 */
/**
 * Zdjęcia dla świeżo zebranych miejsc, poza odpowiedzią /catalog/seed.
 * Partiami po pięć z przerwą — Commons przycina ruch przy kilkudziesięciu
 * zapytaniach pod rząd (ta sama zasada co w /catalog/refresh-photos).
 */
async function dociagnijZdjecia(
  city: string,
  lista: { id: string; name: string; lat: number; lng: number; wikipedia?: string | null }[],
): Promise<void> {
  const t0 = Date.now();
  let zdjecia = 0;
  for (let i = 0; i < lista.length; i += 5) {
    const batch = lista.slice(i, i + 5);
    const zestawy = await Promise.all(batch.map((m) =>
      fetchNearbyPhotos(m.name, m.lat, m.lng, 3, city, m.wikipedia ?? undefined).catch(() => [] as string[])));
    await Promise.all(batch.map(async (m, j) => {
      if (!zestawy[j]?.length) return;
      zdjecia++;
      await repo.updateCatalogPlace(m.id, { photos: zestawy[j], updated_at: new Date().toISOString() })
        .catch((err: any) => console.warn(`[catalog/seed] Zdjęcia "${m.name}": ${err.message}`));
    }));
    if (i + 5 < lista.length) await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`[catalog/seed] ${city}: zdjęcia w tle dla ${zdjecia} z ${lista.length} miejsc w ${Date.now() - t0} ms`);
}

/**
 * Wersja reguł zbierania. Podbicie sprawia, że pętla dozbierania przejdzie jeszcze
 * raz przez wszystkie miasta. v2 (28.09.2026): ranking zwiedzania po liczbie wersji
 * językowych Wikipedii, polskie nazwy, jedna karta na obiekt Wikidanych.
 */
const WERSJA_ZBIERANIA = 2;

type Kategoria = 'zwiedzanie' | 'jedzenie' | 'wieczory' | 'noclegi';
const KATEGORIE: Kategoria[] = ['zwiedzanie', 'jedzenie', 'wieczory', 'noclegi'];

/** Promień zwiedzania. 4 km odcinało Schönbrunn (4,6 km od katedry św. Szczepana). */
const PROMIEN_ZWIEDZANIA_KM = 5;

const NIE_WIKIPEDIA = new Set(['commonswiki', 'specieswiki', 'metawiki', 'wikidatawiki', 'sourceswiki',
  'incubatorwiki', 'mediawikiwiki', 'foundationwiki', 'outreachwiki']);

/**
 * Q-id → liczba wersji językowych Wikipedii i polska etykieta. Ta sama miara co
 * waznosc.py, tylko liczona PRZED odcięciem kandydatów. Wcześniej o tym, co trafi
 * do katalogu, decydowała ocena z tagów OSM — prawie płaska (6–8) — więc wygrywała
 * odległość od centrum: pręgierz przy rynku wchodził, katedra poznańska 1,1 km dalej
 * (52. miejsce) nie, a ważność liczona później nie miała już czego ułożyć.
 */
async function rozpoznawalnosc(qidy: string[]): Promise<Map<string, { ile: number; pl?: string }>> {
  const wynik = new Map<string, { ile: number; pl?: string }>();
  const unikalne = [...new Set(qidy.filter((q) => /^Q\d+$/.test(q)))];
  for (let i = 0; i < unikalne.length; i += 50) {
    const u = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
      action: 'wbgetentities', ids: unikalne.slice(i, i + 50).join('|'),
      props: 'sitelinks|labels', languages: 'pl', format: 'json',
    });
    try {
      const r = await fetch(u, {
        headers: { 'User-Agent': 'RouteMarket/1.0 (https://routemarket.io)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: any = await r.json();
      for (const [q, e] of Object.entries<any>(d.entities ?? {})) {
        if (e.missing !== undefined) continue;
        const ile = Object.keys(e.sitelinks ?? {})
          .filter((k) => /^[a-z][a-z0-9_-]*wiki$/.test(k) && !NIE_WIKIPEDIA.has(k)).length;
        wynik.set(q, { ile, pl: e.labels?.pl?.value });
      }
    } catch (err: any) {
      console.warn(`[catalog/seed] Wikidane nie odpowiedziały: ${err.message}`);
    }
  }
  return wynik;
}

const bezOgonkow = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** „Katedra św. Szczepana w Wiedniu” → „Katedra św. Szczepana”: miasto i tak stoi przy nazwie. */
export function bezMiasta(etykieta: string, miasto: string): string {
  // Odmiana zmienia spółgłoskę: Ryga → w Rydze, Haga → w Hadze. Krótkie nazwy: 2 litery.
  const rdzen = bezOgonkow(miasto).slice(0, miasto.length <= 4 ? 2 : 3);
  const w = etykieta.match(/^(.+?)\s+we?\s+([A-ZĄĆĘŁŃÓŚŹŻ].*)$/);
  // Jedno słowo po obcięciu („Katedra”) nic nie mówi — wtedy miasto zostaje.
  if (w && bezOgonkow(w[2]).startsWith(rdzen) && w[1].includes(' ')) return w[1];
  const n = etykieta.match(/^(.+?)\s+\(([^)]+)\)$/);
  if (n && bezOgonkow(n[2]).startsWith(rdzen) && n[1].includes(' ')) return n[1];
  return etykieta;
}

/**
 * Polska nazwa dla karty za granicą: „Colosseo” → „Koloseum”. Najpierw `name:pl`
 * z OSM, potem polska etykieta Wikidanych — ale tylko dla atrakcji: bar w Durrës
 * z tagiem wikidata amfiteatru nazwałby się „Amfiteatr”.
 */
const slowa = (s: string) => new Set(bezOgonkow(s).match(/[a-z0-9]+/g) ?? []);
/** „Casa di Colombo” wobec „Casa di Cristoforo Colombo”: skrót tej samej nazwy, nie przekład. */
function tenSamJezyk(a: string, b: string): boolean {
  const sa = slowa(a), sb = slowa(b);
  const zawiera = (x: Set<string>, y: Set<string>) => [...x].every((w) => y.has(w));
  return sa.size > 0 && sb.size > 0 && (zawiera(sa, sb) || zawiera(sb, sa));
}

function nazwaPolska(p: PoiCandidate, miasto: string, kraj: string | null,
  wd: Map<string, { ile: number; pl?: string }>): string | null {
  if (kraj === 'PL') return null;
  let n = bezMiasta(p.namePl?.trim() || '', miasto);
  if (!n && p.wikidata && kategoriaZRodzaju(p.kind) === 'attraction') {
    const pl = wd.get(p.wikidata)?.pl?.trim();
    if (pl && pl.length <= 60) n = bezMiasta(pl, miasto);
    if (n && tenSamJezyk(n, p.name)) n = '';
  }
  // „Matki Bożej Śnieżnej” to dopełniacz wyjęty z nazwy kościoła, nie nazwa.
  if (/^(Matki|Świętego|Świętej|Najświętszej|Najświętszego|Panny|Pana)\b/.test(n)) return null;
  return n && n.toLowerCase() !== p.name.toLowerCase() ? n : null;
}

/** Zwiedzanie po rozpoznawalności; jeden obiekt Wikidanych = jedna karta. */
function uporzadkujZwiedzanie(lista: PoiCandidate[], wd: Map<string, { ile: number }>): PoiCandidate[] {
  const ocenione = lista.map((p) => {
    const ile = p.wikidata ? wd.get(p.wikidata)?.ile ?? 0 : 0;
    const odl = Math.min(1, (p.distanceKm ?? 0) / PROMIEN_ZWIEDZANIA_KM);
    // Rozpoznawalność rządzi, odległość tylko hamuje. Bez artykułu — na koniec,
    // w dawnej kolejności z tagów.
    const ocena = ile > 0 ? ile * (1 - 0.35 * odl) : -1 + (p.rank ?? 0) / 100;
    return { p, ocena };
  }).sort((a, b) => b.ocena - a.ocena);
  const widziane = new Set<string>();
  const wynik: PoiCandidate[] = [];
  for (const { p } of ocenione) {
    // „Zamek Cesarski” i „Zamek Cesarski w Poznaniu” to dwa obiekty OSM jednego zamku.
    if (p.wikidata) {
      if (widziane.has(p.wikidata)) continue;
      widziane.add(p.wikidata);
    }
    wynik.push(p);
  }
  return wynik;
}

/**
 * Jedna kategoria z Overpassa. `proby` > 1 tylko tam, gdzie brak boli najbardziej
 * (zwiedzanie) — 504 trwa ~25 s, a użytkownik czeka na ekranie zbierania. Resztę
 * ponawia pętla dozbierania w tle.
 */
async function pobierzKategorie(pt: { lat: number; lng: number }, kat: Kategoria, take: number, proby = 1):
  Promise<{ lista: PoiCandidate[]; niepelny: boolean }> {
  const [typ, opcje] = ({
    zwiedzanie: ['city_walk', { radiusKm: PROMIEN_ZWIEDZANIA_KM, limit: 300 }],
    // Promień dla jedzenia mniejszy: knajpa cztery kilometry za centrum nie jest
    // odpowiedzią na pytanie „gdzie zjeść przy okazji zwiedzania”.
    jedzenie: ['food', { radiusKm: 2, limit: Math.max(6, Math.round(take / 2)) }],
    wieczory: ['nightlife', { radiusKm: 2, limit: Math.max(4, Math.round(take / 4)) }],
    // Noclegów garść, nie lista do przeglądania: mają służyć podpowiedziom
    // punktu startowego, nie wypełniać feedu.
    noclegi: ['hotel', { radiusKm: 3, limit: 10 }],
  } as const)[kat];
  for (let proba = 0; proba < proby; proba++) {
    if (proba > 0) await new Promise((r) => setTimeout(r, 5000 * proba));
    const stan = { niepelny: false };
    const lista = await poiService.fetchCandidates(pt, typ, { ...opcje, stan })
      .catch((err: any) => { console.warn(`[catalog/seed] ${kat}: ${err.message}`); stan.niepelny = true; return []; });
    if (lista.length > 0 || !stan.niepelny) return { lista, niepelny: false };
  }
  return { lista: [], niepelny: true };
}

/** Miasta zbierane w tej chwili — pętla w tle nie wchodzi w drogę użytkownikowi. */
const zbieraneTeraz = new Set<string>();

export async function zbierzMiasto(miasto: string, opcje: { take?: number; tylko?: Kategoria[]; ponowienie?: boolean } = {}) {
  const city = miasto.trim();
  const klucz = city.toLowerCase();
  zbieraneTeraz.add(klucz);
  try {
    // Pomiar etapów: bez niego "trwa 40-60 s" jest odczuciem, a nie liczbą.
    const t0 = Date.now();
    const etapy: Record<string, number> = {};
    let tEtap = Date.now();
    let center = await geocodingService.geocodeSettlement(city);
    etapy.geokoder = Date.now() - tEtap;
    const take = Math.min(40, Math.max(6, opcje.take ?? 30));
    const kategorie = opcje.tylko?.length ? opcje.tylko : KATEGORIE;
    const pelne = kategorie.length === KATEGORIE.length;
    tEtap = Date.now();

    const pobierzWszystko = (pt: { lat: number; lng: number }) =>
      Promise.all(kategorie.map((k) => pobierzKategorie(pt, k, take, k === 'zwiedzanie' ? 2 : 1)));
    let wyniki = await pobierzWszystko(center);
    const z = (k: Kategoria) => wyniki[kategorie.indexOf(k)] ?? { lista: [], niepelny: false };

    // Geokoder dla rozległego miasta bywa oddaje centroid granic administracyjnych
    // zamiast realnego centrum (patrz poiClusterCenter). Środek ciężkości atrakcji
    // koryguje go, gdy odchylenie jest realne (>1 km), i wtedy pytamy jeszcze raz.
    if (kategorie.includes('zwiedzanie')) {
      const cluster = poiClusterCenter(z('zwiedzanie').lista);
      if (cluster) {
        const dLat = (cluster.lat - center.lat) * 111;
        const dLng = (cluster.lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
        const shiftKm = Math.sqrt(dLat * dLat + dLng * dLng);
        if (shiftKm > 1) {
          console.log(`[catalog/seed] ${city}: środek atrakcji przesunięty o ${shiftKm.toFixed(1)} km: `
            + `${center.lat.toFixed(4)},${center.lng.toFixed(4)} -> ${cluster.lat.toFixed(4)},${cluster.lng.toFixed(4)}`);
          center = { ...center, lat: cluster.lat, lng: cluster.lng };
          wyniki = await pobierzWszystko(center);
        }
      }
    }
    etapy.overpass = Date.now() - tEtap;

    tEtap = Date.now();
    const surowe = z('zwiedzanie').lista;
    const wd = await rozpoznawalnosc([...surowe, ...z('jedzenie').lista, ...z('wieczory').lista]
      .map((p) => p.wikidata).filter((q): q is string => !!q));
    const zwiedzanie = uporzadkujZwiedzanie(surowe, wd).slice(0, take);
    const jedzenie = z('jedzenie').lista, wieczory = z('wieczory').lista, noclegi = z('noclegi').lista;
    etapy.wikidane = Date.now() - tEtap;

    const braki = kategorie.filter((k) => z(k).niepelny);
    // „Sprawdzone”: Overpass odpowiedział. Pętla nie ponawia takiej kategorii, nawet
    // gdy nic nowego nie doszło — wcześniej pytała o nią co dwie godziny bez końca.
    const puste = kategorie.filter((k) => !z(k).niepelny);

    // Ten sam obiekt bywa w kilku zapytaniach — bar w zabytkowej kamienicy wraca
    // i jako nightlife, i jako food. Pierwsze wystąpienie wygrywa.
    const widziane = new Set<string>();
    // Obiekty wykluczone świadomie — duplikaty scalone ręcznie i wpisy odrzucone.
    // Bez tej listy scalenie duplikatu jest nietrwałe: seed wstawiłby je z powrotem.
    const wykluczone = await repo.listCatalogExclusions();
    // Kategoria z zapytania, z którego miejsce przyszło. Zapytanie o wieczory zwraca
    // też kina i teatry, a kategoriaZRodzaju() robiła z nich atrakcje: w Kopenhadze
    // kino Empire Bio stało w zwiedzaniu, a Haga, Lyon, Lipsk i Wiedeń miały 0
    // wieczorów mimo ośmiu pobranych — pętla dozbierania ponawiała je bez końca.
    const zrodlo = new Map<PoiCandidate, Kategoria>();
    zwiedzanie.forEach((p) => zrodlo.set(p, 'zwiedzanie'));
    jedzenie.forEach((p) => zrodlo.set(p, 'jedzenie'));
    wieczory.forEach((p) => zrodlo.set(p, 'wieczory'));
    noclegi.forEach((p) => zrodlo.set(p, 'noclegi'));
    const kategoriaMiejsca = (p: PoiCandidate) => {
      const zRodzaju = kategoriaZRodzaju(p.kind);
      switch (zrodlo.get(p)) {
        case 'wieczory': return 'nightlife';
        case 'jedzenie': return zRodzaju === 'nightlife' ? 'nightlife' : 'food';
        case 'noclegi': return 'hotel';
        default: return p.kind === 'cinema' ? 'nightlife' : zRodzaju;
      }
    };

    const candidates = [...zwiedzanie, ...jedzenie, ...wieczory, ...noclegi].filter((p) => {
      if (p.id && wykluczone.has(String(p.id))) return false;
      const k = String(p.id ?? `${p.name}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`);
      if (widziane.has(k)) return false;
      widziane.add(k);
      return true;
    });

    // Zapis BEZ zdjęć i opisów: jedno i drugie dochodzi w tle (dociagnijZdjecia,
    // dokonczMiasto). Nazwy, godziny i położenie są gotowe od razu.
    const saved: any[] = [];
    const doZdjec: { id: string; name: string; lat: number; lng: number; wikipedia?: string | null }[] = [];
    tEtap = Date.now();
    const kraj = center.countryCode ?? null;
    const BATCH = 10;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      await Promise.all(batch.map(async (p) => {
        const polska = nazwaPolska(p, city, kraj, wd);
        const nazwa = polska ?? p.name;
        const slug = placeSlug(nazwa, city, p.lat, p.lng);
        const row = {
          slug,
          name: nazwa,
          nazwa_lokalna: polska ? p.name : null,
          city,
          country: kraj,
          lat: p.lat,
          lng: p.lng,
          category: kategoriaMiejsca(p),
          kind: p.kind,
          // Ważność od razu, z tej samej miary co waznosc.py (wersje językowe
          // Wikipedii). Skrypt bierze tagi z Overpassa, a ten potrafi pół dnia
          // odpowiadać 504 — Kopenhaga miała wtedy 0 z 46 ocen i przypadkową kolejność.
          ...(p.wikidata && wd.has(p.wikidata)
            ? { waznosc: wd.get(p.wikidata)!.ile, waznosc_zrodlo: 'osm-wikidata' } : {}),
          description: '',
          photos: [] as string[],
          opening_hours: p.openingHours ?? null,
          website: p.website ?? null,
          // Tag trafia do bazy od razu: bez niego odświeżanie zdjęć szuka po
          // nazwie i okolicy, a to bierze zdjęcie sąsiedniego budynku.
          wikipedia: p.wikipedia ?? null,
          visit_minutes: null,
          osm_id: p.id,
          vibe_tags: [] as string[],
          updated_at: new Date().toISOString()
        };
        try {
          const existing = await repo.findCatalogPlace(p.id, slug);
          if (existing) {
            const patch: Record<string, unknown> = { updated_at: row.updated_at };
            if (!existing.wikipedia && row.wikipedia) patch.wikipedia = row.wikipedia;
            if (!existing.opening_hours && row.opening_hours) patch.opening_hours = row.opening_hours;
            if (existing.waznosc == null && (row as any).waznosc != null) {
              patch.waznosc = (row as any).waznosc;
              patch.waznosc_zrodlo = 'osm-wikidata';
            }
            // Polska nazwa dla miejsca zebranego po staremu — tylko gdy nikt nie
            // zmieniał nazwy ręcznie (wciąż ta z OSM). Adres strony zostaje.
            if (polska && existing.name === p.name) {
              patch.name = polska;
              patch.nazwa_lokalna = p.name;
            }
            await repo.updateCatalogPlace(existing.id, patch);
            saved.push(existing);
            if (!existing.photos || existing.photos.length === 0) {
              doZdjec.push({ id: existing.id, name: p.name, lat: p.lat, lng: p.lng, wikipedia: existing.wikipedia ?? p.wikipedia });
            }
          } else {
            const nowy = await repo.insertCatalogPlace(row);
            saved.push({ ...nowy, __nowe: true });
            // Zdjęć szukamy po nazwie z OSM — Commons opisuje je po miejscowemu.
            doZdjec.push({ id: nowy.id, name: p.name, lat: p.lat, lng: p.lng, wikipedia: p.wikipedia });
          }
        } catch (err: any) {
          console.warn(`[catalog/seed] Pominięte "${p.name}": ${err.message}`);
        }
      }));
    }
    void dociagnijZdjecia(city, doZdjec);
    etapy.zapis = Date.now() - tEtap;

    const nowe = saved.filter((s) => s.__nowe).length;
    await repo.zapiszStanMiasta(city, {
      ostatnia_proba: new Date().toISOString(),
      braki,
      puste,
      // Wersję podbija tylko pełne zbieranie, w którym zwiedzanie się udało.
      ...(pelne && !braki.includes('zwiedzanie') ? { wersja_zbierania: WERSJA_ZBIERANIA } : {}),
    });

    // Jedno ponowienie po półtorej minuty, samo, bez użytkownika. Zapytanie o jedzenie
    // padało przy każdym zbieraniu (Zamość, Wrocław, Poznań): idzie równolegle z trzema
    // innymi, a Overpass limituje równoległe zapytania z jednego adresu. Osobno,
    // chwilę później, zwykle przechodzi; jeśli nie — zajmie się nim pętla dozbierania.
    if (braki.length && !opcje.ponowienie) {
      setTimeout(() => {
        zbierzMiasto(city, { tylko: braki, ponowienie: true })
          .then(() => dokonczMiasto(city))
          .catch((err: any) => console.warn(`[catalog/seed] ${city}: ponowienie ${braki.join(', ')}: ${err.message}`));
      }, 90_000);
    }

    console.log(`[catalog/seed] ${city}: zapisano ${saved.length} miejsc, nowych ${nowe} `
      + `(zwiedzanie ${zwiedzanie.length}, jedzenie ${jedzenie.length}, `
      + `wieczory ${wieczory.length}, noclegi ${noclegi.length})`
      + (braki.length ? `, NIE PRZYSZŁO: ${braki.join(', ')}` : '')
      + ` w ${Date.now() - t0} ms `
      + `(${Object.entries(etapy).map(([k, v]) => `${k} ${v}ms`).join(', ')}, kandydatów ${candidates.length})`);
    return { city, added: saved.length, nowe, braki, center: { lat: center.lat, lng: center.lng } };
  } finally {
    zbieraneTeraz.delete(klucz);
  }
}

/** Miasta, dla których właśnie powstają opisy — drugi przebieg nie płaci drugi raz. */
const dokanczane = new Set<string>();

/**
 * Opisy i wyróżniki po zbieraniu — na serwerze, w tle. Wcześniej wołał je front,
 * a oba endpointy są tylko dla administratora: każdy inny użytkownik dostawał nowe
 * miasto bez jednego opisu (audyt 10 — testy szły z konta administratora).
 */
export async function dokonczMiasto(city: string): Promise<void> {
  const klucz = city.trim().toLowerCase();
  if (dokanczane.has(klucz)) return;
  dokanczane.add(klucz);
  try {
    // Jedno wywołanie opisuje najwyżej 24 miejsca; limit rund chroni przed pętlą.
    for (let runda = 0; runda < 10; runda++) {
      const o = await opiszBraki(city, 24, null);
      if (!o.enriched || !o.remaining) break;
    }
    // Wyróżniki DOPIERO TERAZ: zdanie „czym to się różni od sąsiadów” potrzebuje
    // opisów i tagów, które powstają wyżej. Partia bez zapisu kończy przebieg.
    for (let runda = 0; runda < 10; runda++) {
      const o = await dopiszWyrozniki(city, 20, null);
      if (!o.opisane || !o.pozostalo) break;
    }
  } catch (err: any) {
    console.warn(`[catalog/dokoncz] ${city}: ${err.message}`);
  } finally {
    dokanczane.delete(klucz);
  }
}

catalogRouter.post('/catalog/seed', async (c) => {
  try {
    const { city, limit } = await c.req.json() as { city: string; limit?: number };
    if (!city?.trim()) return c.json({ error: 'city jest wymagane' }, 400);
    if (!process.env.GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    const w = await zbierzMiasto(city, { take: limit });
    void dokonczMiasto(w.city);
    // opisy_w_tle: front nie woła już /catalog/enrich (tylko dla administratora),
    // tylko odświeża listę, aż opisy dojdą.
    return c.json({ ...w, needs_enrich: w.added > 0, opisy_w_tle: true });
  } catch (err: any) {
    console.error('[catalog/seed] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});

/**
 * Dozbieranie w tle. Co kilka minut jedno miasto, któremu czegoś brakuje:
 *  - zebrane starszą wersją reguł → pełne zbieranie (dochodzą pominięte zabytki),
 *  - kategoria, która padła na 504 albo nigdy nie była zbierana → tylko ona,
 *  - miejsca bez opisu (np. restart w trakcie) → same opisy.
 * Jedno miasto naraz i nie częściej niż co dwie godziny to samo — Overpass jest
 * współdzielony, a 504 w szczycie to norma. Kategorię, dla której Overpass
 * odpowiedział poprawnie i pusto, zostawiamy w spokoju (`puste`).
 */
let dozbieranieWToku = false;
async function dozbierajJednoMiasto(): Promise<void> {
  if (dozbieranieWToku || !process.env.GEMINI_API_KEY) return;
  dozbieranieWToku = true;
  try {
    const teraz = Date.now();
    const DWIE_GODZINY = 2 * 3600_000;
    const kolejka = (await repo.katalogBraki())
      .filter((m: any) => !zbieraneTeraz.has(String(m.city).toLowerCase()))
      .filter((m: any) => !m.ostatnia_proba || teraz - Date.parse(m.ostatnia_proba) > DWIE_GODZINY)
      .map((m: any) => {
        const puste = new Set<string>(m.puste ?? []);
        if ((m.wersja ?? 0) < WERSJA_ZBIERANIA) return { m, tylko: [...KATEGORIE] };
        const tylko: Kategoria[] = [];
        if (!m.jedzenie && !puste.has('jedzenie')) tylko.push('jedzenie');
        if (!m.wieczory && !puste.has('wieczory')) tylko.push('wieczory');
        if (!m.noclegi && !puste.has('noclegi')) tylko.push('noclegi');
        return { m, tylko };
      })
      .filter(({ m, tylko }: any) => tylko.length > 0 || Number(m.bez_opisu) > 0)
      // Najpierw braki kategorii (użytkownik widzi pusty filtr), potem stare wersje.
      .sort((a: any, b: any) => Number(b.tylko.length < KATEGORIE.length && b.tylko.length > 0)
        - Number(a.tylko.length < KATEGORIE.length && a.tylko.length > 0));
    const nast = kolejka[0];
    if (!nast) return;
    const { m, tylko } = nast;
    if (tylko.length) {
      console.log(`[catalog/dozbieranie] ${m.city}: ${tylko.length === KATEGORIE.length ? 'pełne zbieranie v' + WERSJA_ZBIERANIA : tylko.join(', ')}`);
      await zbierzMiasto(m.city, { tylko: tylko.length === KATEGORIE.length ? undefined : tylko });
    } else {
      await repo.zapiszStanMiasta(m.city, { ostatnia_proba: new Date().toISOString() });
    }
    await dokonczMiasto(m.city);
  } catch (err: any) {
    console.warn('[catalog/dozbieranie]', err.message);
  } finally {
    dozbieranieWToku = false;
  }
}
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => { void dozbierajJednoMiasto(); }, 90_000);
  setInterval(() => { void dozbierajJednoMiasto(); }, 6 * 60_000);
}

/**
 * Uzupełnienie kraju tam, gdzie go brakuje. Kolumna istniała od początku, ale
 * zbieranie jej nie wypełniało, więc katalog nie potrafił odróżnić Wrocławia
 * od Berat inaczej niż nazwą miasta — a przy mieszanej liście to za mało.
 */
catalogRouter.post('/catalog/backfill-country', async (c) => {
  try {
    const wszystkie = await repo.listCatalogAll(null, 1000);
    const bezKraju = wszystkie.filter((m: any) => !m.country && m.city);
    const miasta = [...new Set(bezKraju.map((m: any) => String(m.city)))];

    const wynik: Record<string, string | null> = {};
    for (const miasto of miasta) {
      try {
        const g = await geocodingService.geocodeSettlement(miasto);
        wynik[miasto] = g.countryCode ?? null;
      } catch {
        wynik[miasto] = null;
      }
    }

    let zmienione = 0;
    for (const m of bezKraju) {
      const kod = wynik[String(m.city)];
      if (!kod) continue;
      await repo.updateCatalogPlace(m.id, { country: kod, updated_at: new Date().toISOString() });
      zmienione++;
    }

    console.log(`[catalog/backfill-country] uzupełniono ${zmienione} wpisów w ${miasta.length} miastach`);
    return c.json({ updated: zmienione, cities: wynik });
  } catch (e: any) {
    console.error('[catalog/backfill-country]', e);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Drugi etap zbierania: opisy, znaczniki klimatu i czas zwiedzania dla miejsc,
 * które mają już fakty z OpenStreetMap, ale nie mają jeszcze treści. Rozdzielone
 * od /catalog/seed, bo to zapytanie do modelu trwa dwadzieścia kilka sekund i nie
 * ma powodu, żeby użytkownik patrzył przez ten czas na pustą stronę — karty mogą
 * już stać, a opisy dochodzą do nich w tle.
 */
/**
 * Wyróżnik: jedno zdanie o tym, czym miejsce różni się od sąsiadów.
 *
 * Pasek podobnych miejsc postawił pytanie, na które karta nie odpowiadała:
 * skoro obok Mauritshuis stoi Ridderzaal, Vredespaleis i Paleis Noordeinde,
 * to czemu miałbym wybrać akurat to? Opis mówi, CZYM miejsce jest — nie mówi,
 * czym jest INNE.
 *
 * Rusza wyłącznie pozycje, które mają już opis, a nie mają wyróżnika. Opisów
 * nie dotyka.
 */
export async function dopiszWyrozniki(city: string, limit = 20, userId: string | null = null): Promise<{ city: string; opisane: number; odrzucone?: number; pozostalo: number }> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

  const wszystkie = await repo.listCatalogAll(city.trim(), 200);
  const opis = (m: any) => String(m.description_i18n?.pl ?? m.description ?? '').trim();
  const maWyroznik = (m: any) =>
    !!String(m.wyroznik_i18n?.pl ?? m.wyroznik ?? '').trim();
  // Bez opisu nie ma z czym kontrastować — takie miejsca idą najpierw przez
  // /catalog/enrich, nie tędy.
  const brakujace = wszystkie.filter((m: any) => opis(m) && !maWyroznik(m));
  const doOpisania = brakujace.slice(0, limit);
  if (doOpisania.length === 0) return { city, opisane: 0, pozostalo: 0 };

  // Sąsiedzi liczą się tą samą funkcją, która zasila pasek na karcie —
  // model kontrastuje z tym, co użytkownik naprawdę zobaczy pod spodem.
  const sasiedzi = await Promise.all(
    doOpisania.map((m: any) => repo.podobneNazwy(m.id, 4).catch(() => [] as string[]))
  );

  const lista = doOpisania.map((p: any, i: number) => {
    const obok = sasiedzi[i].length ? sasiedzi[i].join(', ') : 'brak podobnych w katalogu';
    return `${i + 1}. ${p.name}\n   podobne obok: ${obok}\n   opis: ${opis(p).slice(0, 400)}`;
  }).join('\n\n');

  const prompt = `Piszesz PO POLSKU dla serwisu planowania wyjazdów. Miasto: ${city}.

Dla każdego miejsca napisz JEDNO zdanie z faktem, który ODRÓŻNIA je od podobnych
miejsc wymienionych obok.

Lista podobnych służy Tobie do wyboru faktu, nie do zacytowania. Użytkownik
NIE WIDZI żadnej listy — czyta samo zdanie pod nazwą miejsca.

Zasady:
- Nazwę sąsiada wstaw TYLKO wtedy, gdy porównanie wnosi realną wartość dla podróżnika:
"W przeciwieństwie do zatłoczonego rynku, ma ukryty ogród w cieniu starych drzew" — tak.
"w odróżnieniu od Muzeum Narodowego" doklejone sztucznie na końcu — nie, to puste.
- ZAKAZANE zwroty: "wśród wymienionych", "z wymienionych", "spośród podobnych".
Użytkownik nie wie, o jakiej liście mowa.
- NIE ZACZYNAJ od nazwy tego miejsca. Nazwa stoi na karcie tuż nad tym zdaniem. Zacznij od cechy lub doświadczenia.
- Wskazuj na autentyczną cechę: klimat, widok, unikalne danie, rodzaj doświadczenia (interaktywne vs tradycyjne, kameralne vs monumentalne), sekretne wejście, specyfikę pory dnia.
- ZAKAZANE słowa: wyjątkowy, niesamowity, magiczny, klejnot, perła, must-see, "warto zobaczyć", "nie do przegapienia".
- NIE POWTARZAJ faktów z opisu.
- Konkret, nie nastrój: co tam jest albo co tam robisz. Bez „szeptów historii”,
ruin, które „opowiadają”, „oaz ciszy” i „tętniącego życiem” placu.
- NIE KOŃCZ zdania dopiskiem „w odróżnieniu od innych …” / „w przeciwieństwie do
innych …” — skoro zdanie podaje różnicę, dopisek niczego nie dodaje.
- Jedno zdanie, najwyżej 25 słów. Nie zaczynaj od "Wybierz", "Odwiedź", "Zobacz".

Dobre zdania:
"W odróżnieniu od tradycyjnych galerii, wszystkiego można tu dotknąć i samodzielnie eksperymentować."
"Jedyny punkt widokowy w dzielnicy z otwartym tarasem 360° bez szyb i bez konieczności rezerwacji."
"Zamiast gwarnych sal oferuje kameralny dziedziniec z własną rzemieślniczą palarnią kawy."

Miejsca:
${lista}

Odpowiedz WYŁĄCZNIE obiektem JSON: {"places": [{"name": "...", "wyroznik": "..."}]}`;

  const data = await callGeminiTracked(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            places: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, wyroznik: { type: 'string' } },
                required: ['name', 'wyroznik']
              }
            }
          },
          required: ['places']
        },
        // Tyle samo co /catalog/enrich. Przy 8192 partia dwudziestu miejsc
        // potrafiła urwać się w środku JSON-a: model liczy do tego limitu
        // także tokeny rozumowania, nie samą odpowiedź.
        maxOutputTokens: 32768
      }
    },
    { operation: 'catalog-wyrozniki', model: 'gemini-2.5-flash', userId: userId }
  );

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let wynik: any[] = [];
  try {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) wynik = JSON.parse(cleaned.slice(first, last + 1)).places || [];
  } catch {
    console.warn('[catalog/wyrozniki] Nie udało się sparsować odpowiedzi');
  }

  /* Czy zdanie to przebranie opisu. Liczymy tylko słowa 6+ znaków, bo krótkie
     to spójniki i przyimki, które siedzą wszędzie. Próg 70% wyszedł z pomiaru
     pierwszego przebiegu: przy tej wartości odpadają streszczenia, a zostają
     zdania niosące nowy fakt. */
  const przebranieOpisu = (zdanie: string, tekstOpisu: string) => {
    const slowa = zdanie.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 6);
    if (slowa.length === 0) return false;
    const opisMaly = tekstOpisu.toLowerCase();
    return slowa.filter((w) => opisMaly.includes(w)).length / slowa.length >= 0.7;
  };

  const wgNazwy = new Map(wynik.map((d: any) => [String(d.name).trim().toLowerCase(), d]));
  let zmienione = 0;
  let odrzucone = 0;
  for (const m of doOpisania) {
    const klucz = String(m.name).trim().toLowerCase();
    // Ten sam zapas co przy opisach: model potrafi dokleić adnotację do nazwy,
    // a nazwa źródłowa jest wtedy przedrostkiem.
    const d = wgNazwy.get(klucz)
      ?? wynik.find((o: any) => String(o.name ?? '').trim().toLowerCase().startsWith(klucz));
    // Model dokleja na końcu „, w odróżnieniu od innych muzeów.” mimo zakazu
    // w prompcie — w Toruniu co drugie zdanie. Dopisek bez nazwy niczego nie
    // porównuje, więc go ucinamy; zdanie przed nim zostaje.
    const zdanie = String(d?.wyroznik ?? '').trim()
      .replace(/,?\s*(w odróżnieniu|w przeciwieństwie) (od|do) (innych|pozostałych|okolicznych|typowych|tradycyjnych)[^.,;]*\.?$/i, '.')
      .replace(/\.\.$/, '.');
    // Puste pole jest dozwoloną odpowiedzią: nie każde miejsce ma czym się
    // różnić i wolimy nie pokazać wiersza, niż pokazać pusty komunał.
    if (!zdanie) continue;
    if (przebranieOpisu(zdanie, opis(m))) {
      // Treść, nie tylko licznik: bez niej nie da się ocenić, czy próg wycina
      // streszczenia, czy dobre zdania.
      console.log(`[catalog/wyrozniki] odrzucone (powtarza opis) "${m.name}": ${zdanie.slice(0, 90)}`);
      odrzucone++; continue;
    }
    /* Zdanie zdradzające konstrukcję promptu. Użytkownik nie widzi żadnej listy
       "wymienionych", więc takie odniesienie jest dla niego bez sensu. Instrukcja
       w prompcie to za mało — w poprzednim przebiegu przeszło sześć takich. */
    if (/w[śs]r[óo]d wymienionych|z wymienionych|spo[śs]r[óo]d podobnych|wymienionych (obok|powy[żz]ej)/i.test(zdanie)) {
      console.log(`[catalog/wyrozniki] odrzucone (framing promptu) "${m.name}": ${zdanie.slice(0, 90)}`);
      odrzucone++; continue;
    }
    /* Słowa z listy zakazanych. Prompt ich zabrania, ale prompt to prośba:
       na 411 gotowych zdań dwa przemyciły „barokowe perły" i „o jego
       wyjątkowości". Ta sama lekcja co przy powtórzeniach opisu — reguła,
       która ma obowiązywać, musi stać po stronie serwera. */
    if (/wyj[ąa]tkow|niesamowit|magiczn|klejnot|per[łl][ayąe]|must-see|warto zobaczy[ćc]|nie do przegapienia|szepcz|niezapomnian|zachwyc|urzek|oaz[aęy] (ciszy|spokoju)|t[ęe]tni[ąa]c/i.test(zdanie)) {
      console.log(`[catalog/wyrozniki] odrzucone (zakazane słowo) "${m.name}": ${zdanie.slice(0, 90)}`);
      odrzucone++; continue;
    }
    await repo.updateCatalogPlace(m.id, {
      wyroznik: zdanie,
      wyroznik_i18n: { ...(m.wyroznik_i18n ?? {}), pl: zdanie },
      updated_at: new Date().toISOString()
    });
    zmienione++;
  }

  /* `pozostalo` liczy się od zapisanych, nie od przetworzonych. Odrzucone
     zostają w puli i trafią do kolejnej partii — to celowe, bo przy następnym
     losowaniu model bywa trafniejszy. Przed zapętleniem chroni warunek po
     stronie wołającego: partia, która nie zapisała NICZEGO, kończy przebieg. */
  const pozostalo = Math.max(0, brakujace.length - zmienione);
  console.log(`[catalog/wyrozniki] ${city}: zapisano ${zmienione}, odrzucono ${odrzucone} `
    + `(powtórzenie opisu) z ${doOpisania.length}, zostaje ${pozostalo}`);
  return { city, opisane: zmienione, odrzucone, pozostalo };
}

catalogRouter.post('/catalog/wyrozniki', async (c) => {
  try {
    const { city, limit = 20 } = await c.req.json() as { city: string; limit?: number };
    if (!city?.trim()) return c.json({ error: 'city jest wymagane' }, 400);
    return c.json(await dopiszWyrozniki(city, limit, c.get('userId') || null));
  } catch (e: any) {
    console.error('[catalog/wyrozniki]', e);
    return c.json({ error: e.message }, 500);
  }
});

export async function opiszBraki(city: string, limit = 24, userId: string | null = null): Promise<{ city: string; enriched: number; remaining: number }> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

  const wszystkie = await repo.listCatalogAll(city.trim(), 200);
  // Opis moze siedziec w starej kolumnie albo w wymiarze jezykowym — brak
  // liczy sie dopiero wtedy, gdy nie ma go w zadnym z tych miejsc.
  const bezOpisu = (m: any) =>
    !String(m.description ?? '').trim() && !String(m.description_i18n?.pl ?? '').trim();
  const brakujace = wszystkie.filter(bezOpisu);
  const doOpisania = brakujace.slice(0, limit);
  if (doOpisania.length === 0) return { city, enriched: 0, remaining: 0 };

  const prompt = `Piszesz praktyczny przewodnik po mieście ${city} dla ludzi, którzy układają plan wyjazdu. Piszesz PO POLSKU niezależnie od kraju.

Miejsca (nazwy skopiuj DOKŁADNIE):
${doOpisania.map((p: any, i: number) => `${i + 1}. ${p.name}${p.kind ? ` (${p.kind})` : ''}`).join('\n')}

Dla każdego zwróć:
- "name": nazwa dokładnie jak wyżej
- "description": 2-3 zdania: czym jest to miejsce, co tam realnie robisz i dla kogo to jest. Daty budowy i style architektoniczne tylko wtedy, gdy to z ich powodu ludzie tam idą.

Kolejne opisy nie mogą zaczynać się tą samą konstrukcją (zawsze od nazwy,
zawsze od „To miejsce…”) — użytkownik czyta karty jedna po drugiej i powtarzalne
otwarcie zdradza szablon.
- "vibe_tags": 2-4 znaczniki WYŁĄCZNIE z tej listy: ${VIBE_TAGS.join(', ')}
- "visit_minutes": ile realnie zajmuje pobyt

${STYL_OPISU}
Odpowiedz WYŁĄCZNIE obiektem JSON: {"places": [...]}`;

  const data = await callGeminiTracked(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            places: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  vibe_tags: { type: 'array', items: { type: 'string' } },
                  visit_minutes: { type: 'integer' }
                },
                required: ['name']
              }
            }
          },
          required: ['places']
        },
        maxOutputTokens: 32768
      }
    },
    { operation: 'catalog-enrich', model: 'gemini-2.5-flash', userId: userId }
  );

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let opisane: any[] = [];
  try {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) opisane = JSON.parse(cleaned.slice(first, last + 1)).places || [];
  } catch {
    console.warn('[catalog/enrich] Nie udało się sparsować odpowiedzi');
  }

  const wgNazwy = new Map(opisane.map((d: any) => [String(d.name).trim().toLowerCase(), d]));
  let zmienione = 0;
  for (const m of doOpisania) {
    const klucz = String(m.name).trim().toLowerCase();
    // Dopasowanie dokładne najpierw. Model czasem doklejał adnotację rodzaju
    // z listy z powrotem do nazwy -- "Aereo Lockheed F104-S (Starfighter)"
    // (rodzaj: monument) wracało jako "Aereo Lockheed F104-S (Starfighter)
    // (monument)", więc dokładny klucz nie trafiał mimo poprawnego opisu.
    // Nazwa źródłowa jest zawsze prefiksem takiej pomyłki, więc to bezpieczny
    // fallback -- nie zgadujemy, tylko akceptujemy dopisek na końcu.
    const d = wgNazwy.get(klucz)
      ?? opisane.find((o: any) => String(o.name ?? '').trim().toLowerCase().startsWith(klucz));
    if (!d?.description) continue;
    const tags = Array.isArray(d.vibe_tags)
      ? d.vibe_tags.filter((t: string) => VIBE_TAGS.includes(t)).slice(0, 4)
      : [];
    // Zapis w obie strony: stara kolumna zostaje jako zapas dla miejsc, ktore
    // czytaja ja wprost, a wymiar jezykowy jest tym, z ktorego korzysta front
    // i z ktorego tlumaczy sie na pozostale jezyki.
    await repo.updateCatalogPlace(m.id, {
      description: d.description,
      description_i18n: { ...(m.description_i18n ?? {}), pl: d.description },
      vibe_tags: tags,
      visit_minutes: d.visit_minutes ?? m.visit_minutes ?? null,
      updated_at: new Date().toISOString()
    });
    zmienione++;
  }

  // `remaining` mówi wołającemu, że jedno wywołanie NIE WYSTARCZYŁO. Bez tego
  // pola front pytał raz i uznawał sprawę za zamkniętą -- Haga (42 miejsca)
  // dostawała opisy dla dwudziestu czterech i ani jednego więcej, bo nic nie
  // powiedziało, że osiemnaście wciąż czeka.
  const pozostalo = Math.max(0, brakujace.length - zmienione);
  console.log(`[catalog/enrich] ${city}: opisano ${zmienione} z ${doOpisania.length}, zostaje ${pozostalo}`);
  return { city, enriched: zmienione, remaining: pozostalo };
}

catalogRouter.post('/catalog/enrich', async (c) => {
  try {
    const { city, limit = 24 } = await c.req.json() as { city: string; limit?: number };
    if (!city?.trim()) return c.json({ error: 'city jest wymagane' }, 400);
    return c.json(await opiszBraki(city, limit, c.get('userId') || null));
  } catch (e: any) {
    console.error('[catalog/enrich]', e);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Przebudowa galerii dla miejsc już zapisanych w katalogu. Zdjęcia dobrane starą
 * regułą zostały w bazie i sama poprawka doboru ich nie ruszy — trzeba je nadpisać.
 * Idzie partiami, bo Commons i Wikipedia nie lubią wielu równoległych zapytań.
 */
catalogRouter.post('/catalog/refresh-photos', async (c) => {
  try {
    type Zadanie = {
      city?: string; limit?: number; tylko_braki?: boolean; tylko_z_tagiem?: boolean;
      /** Nic nie zapisuje — pokazuje, co dobralby dzisiejszy kod. Bez tego kazde
          sprawdzenie jakosci zdjec nadpisywalo katalog, wiec nie dalo sie odroznic
          zaszlosci (zdjecia z czasow luzniejszych filtrow) od bledu w regulach. */
      proba?: boolean;
    };
    const { city, limit = 500, tylko_braki = false, tylko_z_tagiem = false, proba = false } =
      await c.req.json().catch(() => ({})) as Zadanie;
    const pelna = await repo.listCatalogAll(city?.trim() || null, limit);
    // `tylko_z_tagiem` ogranicza przebieg do pozycji, które mają twarde
    // powiązanie z artykułem — tylko tam podmiana jest pewna, a nie losowa.
    const wszystkie = tylko_z_tagiem
      ? pelna.filter((r: any) => !!r.wikipedia)
      : pelna;
    // `tylko_braki` uzupełnia puste galerie, nie ruszając tych, które działają.
    // Bez tego jedyny sposób na dociągnięcie zdjęć dla nowych pozycji to
    // przepuszczenie CAŁEGO miasta — a Commons przy każdym zapytaniu może
    // zwrócić inny zestaw, więc setki dobrych galerii zmieniłyby się bez powodu.
    const rows = tylko_braki
      ? wszystkie.filter((r: any) => !Array.isArray(r.photos) || r.photos.length === 0)
      : wszystkie;

    const changed: { name: string; before: number; after: number; stare?: string[]; nowe?: string[] }[] = [];
    const straty: { name: string; bylo: number }[] = [];
    // Bez tego "nic nie znaleziono" i "Wikimedia nas odcieła" wygladaja tak samo.
    wyzerujNieudaneCommons();
    // Błędy liczone osobno od „nic nie znaleziono". Wcześniej `.catch(() => [])`
    // zamieniał odmowę Wikimediów w pustą listę, więc po przekroczeniu ich limitu
    // endpoint raportował „sprawdzono 50, podmieniono 0" — brzmiało jak brak zdjęć
    // w Commons, a było odcięciem. Trzy miasta pod rząd wyszły tak w zero sekund.
    let bledy = 0;
    const BATCH = 5;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const sets = await Promise.all(
        // `r.wikipedia` to powiązanie twarde z OSM: obiekt sam wskazuje swój
        // artykuł, a artykuł ma zdjęcie wiodące wybrane przez człowieka.
        // Bez tego argumentu zostawało wyszukiwanie po nazwie i po okolicy,
        // które potrafi wziąć zdjęcie sąsiedniego budynku.
        batch.map((r: any) => fetchNearbyPhotos(r.name, r.lat, r.lng, 5, r.city, r.wikipedia, r.country)
          .catch(() => { bledy += 1; return [] as string[]; }))
      );
      // Wikimedia przycina ruch przy kilkudziesięciu zapytaniach pod rząd.
      if (i + BATCH < rows.length) await new Promise((r) => setTimeout(r, 400));
      await Promise.all(batch.map(async (r: any, j: number) => {
        const next = sets[j];
        const prev: string[] = Array.isArray(r.photos) ? r.photos : [];
        // Pustej galerii nie zapisujemy: brak zdjęcia jest lepszy niż złe zdjęcie,
        // ale kasowanie działającej galerii przez chwilowy błąd sieci już nie.
        // W probie odnotowujemy to jednak jako STRATE — inaczej zaostrzenie regul
        // wyglada na darmowe, bo widac tylko podmiany, a nie zniknieciа.
        if (next.length === 0) {
          if (proba && prev.length > 0) straty.push({ name: r.name, bylo: prev.length });
          return;
        }
        if (JSON.stringify(next) === JSON.stringify(prev)) return;
        if (!proba) {
          await repo.updateCatalogPlace(r.id, { photos: next, updated_at: new Date().toISOString() });
        }
        changed.push({
          name: r.name, before: prev.length, after: next.length,
          // W probie interesuje nas nie liczba, tylko CO wchodzi zamiast czego.
          stare: proba ? prev.slice(0, 1) : undefined,
          nowe: proba ? next.slice(0, 1) : undefined,
        });
      }));
    }
    console.log(`[catalog/refresh-photos] sprawdzono ${rows.length} z ${wszystkie.length}`
      + `, podmieniono ${changed.length}, błędów ${bledy}`);
    const nieudaneCommons = odczytajNieudaneCommons();
    if (nieudaneCommons > 0) {
      console.warn(
        `[catalog/refresh-photos] Commons nie odpowiedział ${nieudaneCommons} razy `
        + '— wynik jest zaniżony, nie traktuj go jako braku zdjęć');
    }
    return c.json({ checked: rows.length, updated: proba ? 0 : changed.length, proba,
      roznice: changed.length, straty: straty.length, failed: bledy,
      nieudaneCommons, changed, listaStrat: straty });
  } catch (e: any) {
    console.error('[catalog/refresh-photos]', e);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Miejsce zgłoszone przez użytkownika. OSM nie zna wszystkiego — knajpy bez
 * szyldu, punktu widokowego znanego lokalsom czy świeżo otwartej galerii tam po
 * prostu nie ma. Warunek jest jeden i twardy: adres musi dać się zamienić na
 * współrzędne, bo miejsce bez położenia jest bezużyteczne w planowaniu i psuje
 * wszystko dalej.
 *
 * Świadomie NIE przyjmujemy zdjęć od użytkowników. To prawa autorskie i
 * moderacja treści od pierwszego dnia, a nie problem "na potem" — zdjęcia biorą
 * się z Wikimedia Commons, gdzie licencja jest znana.
 */
catalogRouter.post('/catalog/submit', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) return c.json({ error: 'Wymagane zalogowanie' }, 401);

    const body = await c.req.json() as {
      name: string; city: string; address?: string; category?: string;
      description?: string; website?: string; visit_minutes?: number;
      lat?: number; lng?: number;
    };
    const name = String(body?.name || '').trim();
    const city = String(body?.city || '').trim();
    if (!name || !city) return c.json({ error: 'Nazwa i miasto są wymagane' }, 400);

    let lat = typeof body.lat === 'number' ? body.lat : null;
    let lng = typeof body.lng === 'number' ? body.lng : null;

    if (lat == null || lng == null) {
      const center = await geocodingService.geocodeSettlement(city);
      const query = [body.address, name].filter(Boolean).join(', ');
      try {
        const geo = await geocodingService.geocodeSinglePoint(query, { lat: center.lat, lng: center.lng }, 40);
        const dLat = (geo.lat - center.lat) * 111;
        const dLng = (geo.lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
        if (Math.sqrt(dLat * dLat + dLng * dLng) <= 40) {
          lat = geo.lat;
          lng = geo.lng;
        }
      } catch { /* obsłużone niżej */ }
    }

    if (lat == null || lng == null) {
      return c.json({
        error: 'Nie udało się ustalić położenia. Podaj dokładniejszy adres albo wskaż punkt na mapie.'
      }, 422);
    }

    const slug = placeSlug(name, city, lat, lng);
    const existing = await repo.findCatalogPlace(null, slug);
    if (existing) return c.json({ id: existing.id, slug: existing.slug, created: false, duplicate: true });

    const created = await repo.insertCatalogPlace({
      slug,
      name,
      city,
      lat,
      lng,
      category: body.category || 'attraction',
      description: String(body.description || '').slice(0, 1000),
      website: body.website || null,
      visit_minutes: body.visit_minutes ?? null,
      photos: [],
      source: 'user',
      created_by: userId,
      updated_at: new Date().toISOString()
    });
    console.log(`[catalog/submit] "${name}" (${city}) od użytkownika ${userId.slice(0, 8)}`);
    return c.json({ id: created.id, slug: created.slug, created: true });
  } catch (err: any) {
    console.error('[catalog/submit] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});
