import { Hono } from 'hono';
import { repo } from '../db/repository.js';
import { geocodingService } from '../services/geocoding.js';
import { poiService, poiClusterCenter } from '../services/poi.js';
import { callGeminiTracked } from '../services/ai-usage.js';
import { jezykZadania, JEZYKI_UI, type KodJezyka } from '../services/jezyki.js';
import { przetlumaczPaczke } from '../services/tlumaczenia.js';
import { fetchNearbyPhotos } from '../services/photos.js';
import { placeSlug, VIBE_TAGS, kategoriaZRodzaju } from '../services/katalog-helpers.js';

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
catalogRouter.post('/catalog/seed', async (c) => {
  try {
    const { city, limit } = await c.req.json() as { city: string; limit?: number };
    if (!city?.trim()) return c.json({ error: 'city jest wymagane' }, 400);
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

    // Pomiar etapów: bez niego "trwa 40-60 s" jest odczuciem, a nie liczbą.
    const t0 = Date.now();
    const etapy: Record<string, number> = {};
    let tEtap = Date.now();
    let center = await geocodingService.geocodeSettlement(city);
    etapy.geokoder = Date.now() - tEtap;
    const take = Math.min(40, Math.max(6, limit ?? 24));
    tEtap = Date.now();

    // Zbieranie pytało wyłącznie o zwiedzanie, więc katalog był w całości
    // atrakcjami — restauracja mogła trafić na tablicę tylko przez wyszukiwanie
    // tekstowe, nigdy przez katalog miasta. Warstwa POI ma osobne zapytania do
    // Overpassa dla jedzenia i wieczorów; wystarczyło zacząć ich używać.
    //
    // Promień dla jedzenia jest mniejszy: knajpa cztery kilometry za centrum nie
    // jest odpowiedzią na pytanie „gdzie zjeść przy okazji zwiedzania".
    const fetchAll = (pt: { lat: number; lng: number }) => Promise.all([
      poiService.fetchCandidates(pt, 'city_walk',
        { radiusKm: 4, limit: take }),
      poiService.fetchCandidates(pt, 'food',
        { radiusKm: 2, limit: Math.max(6, Math.round(take / 2)) }),
      poiService.fetchCandidates(pt, 'nightlife',
        { radiusKm: 2, limit: Math.max(4, Math.round(take / 4)) }),
      // Noclegów zbieramy garść, nie listę do przeglądania: bazę wybiera się raz,
      // a nie porównuje czterdziestu hoteli w planerze. Mają służyć podpowiedziom
      // punktu startowego, nie wypełniać feed miejsc do zobaczenia.
      poiService.fetchCandidates(pt, 'hotel',
        { radiusKm: 3, limit: 10 }).catch(() => []),
    ]);

    let [zwiedzanie, jedzenie, wieczory, noclegi] = await fetchAll({ lat: center.lat, lng: center.lng });

    // Geokoder dla rozległego miasta bywa oddaje centroid granic administracyjnych
    // zamiast realnego centrum (patrz poiClusterCenter w services/poi.ts — ten sam
    // problem co w /chat-interview). Środek ciężkości najlepiej ocenionych atrakcji
    // ze zwiedzania koryguje go, gdy odchylenie jest realne (>1 km), i wtedy
    // odpytujemy Overpassa ponownie dla tego samego miasta wokół nowego środka.
    const cluster = poiClusterCenter(zwiedzanie);
    if (cluster) {
      const dLat = (cluster.lat - center.lat) * 111;
      const dLng = (cluster.lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
      const shiftKm = Math.sqrt(dLat * dLat + dLng * dLng);
      if (shiftKm > 1) {
        console.log(`[catalog/seed] ${city}: środek atrakcji przesunięty o ${shiftKm.toFixed(1)} km: `
          + `${center.lat.toFixed(4)},${center.lng.toFixed(4)} -> ${cluster.lat.toFixed(4)},${cluster.lng.toFixed(4)}`);
        center = { ...center, lat: cluster.lat, lng: cluster.lng };
        [zwiedzanie, jedzenie, wieczory, noclegi] = await fetchAll({ lat: center.lat, lng: center.lng });
      }
    }

    // Ten sam obiekt bywa w kilku zapytaniach — bar w zabytkowej kamienicy wraca
    // i jako nightlife, i jako food. Pierwsze wystąpienie wygrywa, bo listy idą
    // w kolejności ważności dla planowania.
    const widziane = new Set<string>();
    // Obiekty wykluczone świadomie — duplikaty scalone ręcznie i wpisy odrzucone.
    // Bez tej listy scalenie duplikatu jest nietrwałe: seed pyta Overpassa
    // o miasto i wstawia z powrotem wszystko, czego nie zna, więc obiekt z żywym
    // identyfikatorem OSM wraca przy najbliższym zbieraniu. „Torre dos Clérigos"
    // wróciła tak na tablicę przykładową Porto obok samej siebie pod pełną nazwą.
    const wykluczone = await repo.listCatalogExclusions();

    const candidates = [...zwiedzanie, ...jedzenie, ...wieczory, ...noclegi].filter((p) => {
      if (p.id && wykluczone.has(String(p.id))) return false;
      const klucz = String(p.id ?? `${p.name}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`);
      if (widziane.has(klucz)) return false;
      widziane.add(klucz);
      return true;
    });
    etapy.overpass = Date.now() - tEtap;
    if (candidates.length === 0) return c.json({ city, added: 0, places: [] });

    // Model nie odzywa się na tym etapie. Pomiar pokazał, że jedno zapytanie
    // o opisy dla wszystkich miejsc naraz zjadało siedemdziesiąt procent czasu
    // (23,4 s z 33,1 s dla Gdańska), a przez ten czas użytkownik nie widział nic.
    // Fakty z OpenStreetMap wystarczą, żeby pokazać karty; opisy dochodzą osobno
    // przez /catalog/enrich.

    // Zdjęcia partiami: Commons nie lubi czterdziestu równoległych zapytań
    const saved: any[] = [];
    tEtap = Date.now();
    const BATCH = 5;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const photoSets = await Promise.all(batch.map((p) => fetchNearbyPhotos(p.name, p.lat, p.lng, 3, city, p.wikipedia)));
      await Promise.all(batch.map(async (p, j) => {
        const slug = placeSlug(p.name, city, p.lat, p.lng);
        const row = {
          slug,
          name: p.name,
          city,
          country: center.countryCode ?? null,
          lat: p.lat,
          lng: p.lng,
          category: kategoriaZRodzaju(p.kind),
          kind: p.kind,
          description: '',
          photos: photoSets[j] || [],
          opening_hours: p.openingHours ?? null,
          website: p.website ?? null,
          visit_minutes: null,
          osm_id: p.id,
          vibe_tags: [] as string[],
          updated_at: new Date().toISOString()
        };
        try {
          const existing = await repo.findCatalogPlace(p.id, slug);
          if (existing) {
            const patch: Record<string, unknown> = { updated_at: row.updated_at };
            if ((!existing.photos || existing.photos.length === 0) && row.photos.length) patch.photos = row.photos;
            await repo.updateCatalogPlace(existing.id, patch);
            saved.push(existing);
          } else {
            saved.push(await repo.insertCatalogPlace(row));
          }
        } catch (err: any) {
          console.warn(`[catalog/seed] Pominięte "${p.name}": ${err.message}`);
        }
      }));
    }

    etapy.zdjecia_i_zapis = Date.now() - tEtap;
    console.log(`[catalog/seed] ${city}: zapisano ${saved.length} miejsc `
      + `(zwiedzanie ${zwiedzanie.length}, jedzenie ${jedzenie.length}, `
      + `wieczory ${wieczory.length}, noclegi ${noclegi.length}) `
      + `w ${Date.now() - t0} ms ` +
      `(${Object.entries(etapy).map(([k, v]) => `${k} ${v}ms`).join(', ')}, kandydatów ${candidates.length})`);
    // needs_enrich mówi klientowi, że warto od razu poprosić o opisy.
    return c.json({
      city, added: saved.length, needs_enrich: saved.length > 0,
      center: { lat: center.lat, lng: center.lng }
    });
  } catch (err: any) {
    console.error('[catalog/seed] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});

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
catalogRouter.post('/catalog/wyrozniki', async (c) => {
  try {
    const { city, limit = 20 } = await c.req.json() as { city: string; limit?: number };
    if (!city?.trim()) return c.json({ error: 'city jest wymagane' }, 400);
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
    if (doOpisania.length === 0) return c.json({ city, opisane: 0, pozostalo: 0 });

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
      { operation: 'catalog-wyrozniki', model: 'gemini-2.5-flash', userId: c.get('userId') || null }
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
      const zdanie = String(d?.wyroznik ?? '').trim();
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
      if (/wyj[ąa]tkow|niesamowit|magiczn|klejnot|per[łl][ayąe]|must-see|warto zobaczy[ćc]|nie do przegapienia/i.test(zdanie)) {
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
    return c.json({ city, opisane: zmienione, odrzucone, pozostalo });
  } catch (e: any) {
    console.error('[catalog/wyrozniki]', e);
    return c.json({ error: e.message }, 500);
  }
});

catalogRouter.post('/catalog/enrich', async (c) => {
  try {
    const { city, limit = 24 } = await c.req.json() as { city: string; limit?: number };
    if (!city?.trim()) return c.json({ error: 'city jest wymagane' }, 400);
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

    const wszystkie = await repo.listCatalogAll(city.trim(), 200);
    // Opis moze siedziec w starej kolumnie albo w wymiarze jezykowym — brak
    // liczy sie dopiero wtedy, gdy nie ma go w zadnym z tych miejsc.
    const bezOpisu = (m: any) =>
      !String(m.description ?? '').trim() && !String(m.description_i18n?.pl ?? '').trim();
    const brakujace = wszystkie.filter(bezOpisu);
    const doOpisania = brakujace.slice(0, limit);
    if (doOpisania.length === 0) return c.json({ city, enriched: 0, remaining: 0 });

    const prompt = `Jesteś autorem inspirujących przewodników podróżniczych (styl Monocle, Lonely Planet, Conde Nast Traveler) po mieście ${city}. Tworzysz magnetyczne, pełne klimatu i zmysłów opisy miejsc dla podróżników. Piszesz PO POLSKU niezależnie od kraju.

Miejsca (nazwy skopiuj DOKŁADNIE):
${doOpisania.map((p: any, i: number) => `${i + 1}. ${p.name}${p.kind ? ` (${p.kind})` : ''}`).join('\n')}

Dla każdego zwróć:
- "name": nazwa dokładnie jak wyżej
- "description": 3-4 zdania żywego, wciągającego opisu. Pokaż atmosferę, energię miejsca, światło, widoki, zapachy i to, co sprawia, że człowiek natychmiast chce tam pójść. UNIKAJ encyklopedycznego żargonu (daty budowy, wysokości w metrach, style architektoniczne, zwroty typu "charakteryzuje się", "warto zobaczyć"). Skup się na autentycznym doświadczeniu podróżnika i tym, co poczuje na miejscu.

  Pierwsze zdanie NIE MOŻE mieć tej samej konstrukcji co pierwsze zdanie miejsca
  bezpośrednio wcześniej na liście — użytkownik czyta te karty jedna po drugiej
  i identyczny wzorzec otwarcia zdradza szablon zamiast klimatu. Wybieraj za
  każdym razem inny rodzaj otwarcia, np.:
    a) zmysł — dźwięk, zapach, faktura, światło o konkretnej porze,
    b) scena — co ludzie tam w tej chwili robią,
    c) kontrast — czego człowiek się spodziewa, a co go tam zaskoczy,
    d) pora — kiedy to miejsce żyje najmocniej,
    e) detal — jeden konkretny, niearchitektoniczny szczegół, od którego zaczynasz.
  Nie ograniczaj się do tej listy i nie nazywaj rodzaju w tekście — to ma być
  naturalne zdanie, nie ćwiczenie ze wzoru.
- "vibe_tags": 2-4 znaczniki WYŁĄCZNIE z tej listy: ${VIBE_TAGS.join(', ')}
- "visit_minutes": ile realnie zajmuje pobyt

Jeśli jakiegoś miejsca nie kojarzysz w 100%, opisz je z wyczuciem na podstawie jego rodzaju z naciskiem na atmosferę i energię — nie wymyślaj zmyślonych faktów.
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
      { operation: 'catalog-enrich', model: 'gemini-2.5-flash', userId: c.get('userId') || null }
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
    return c.json({ city, enriched: zmienione, remaining: pozostalo });
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
    type Zadanie = { city?: string; limit?: number; tylko_braki?: boolean; tylko_z_tagiem?: boolean };
    const { city, limit = 500, tylko_braki = false, tylko_z_tagiem = false } =
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

    const changed: { name: string; before: number; after: number }[] = [];
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
        batch.map((r: any) => fetchNearbyPhotos(r.name, r.lat, r.lng, 5, r.city, r.wikipedia)
          .catch(() => { bledy += 1; return [] as string[]; }))
      );
      // Wikimedia przycina ruch przy kilkudziesięciu zapytaniach pod rząd.
      if (i + BATCH < rows.length) await new Promise((r) => setTimeout(r, 400));
      await Promise.all(batch.map(async (r: any, j: number) => {
        const next = sets[j];
        const prev: string[] = Array.isArray(r.photos) ? r.photos : [];
        // Pustej galerii nie zapisujemy: brak zdjęcia jest lepszy niż złe zdjęcie,
        // ale kasowanie działającej galerii przez chwilowy błąd sieci już nie.
        if (next.length === 0) return;
        if (JSON.stringify(next) === JSON.stringify(prev)) return;
        await repo.updateCatalogPlace(r.id, { photos: next, updated_at: new Date().toISOString() });
        changed.push({ name: r.name, before: prev.length, after: next.length });
      }));
    }
    console.log(`[catalog/refresh-photos] sprawdzono ${rows.length} z ${wszystkie.length}`
      + `, podmieniono ${changed.length}, błędów ${bledy}`);
    return c.json({ checked: rows.length, updated: changed.length, failed: bledy, changed });
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
