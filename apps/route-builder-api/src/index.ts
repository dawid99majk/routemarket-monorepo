import { Hono, type MiddlewareHandler } from 'hono';
import { serve } from '@hono/node-server';
import { zValidator } from '@hono/zod-validator';
import { RouteRequirementsSchema } from './types/index.js';
import { repo, type AuthenticatedRouteBuilderUser } from './db/repository.js';
import { geocodingService } from './services/geocoding.js';
import { wizytowkaTablicy, wizytowkaMiejsca, wizytowkaGalerii, wizytowkaMiasta, stronaZWizytowka } from './services/wizytowki.js';
import { slugMiasta } from './services/strony-miast.js';
import { routingService } from './services/routing.js';
import { gpxService } from './services/gpx.js';
import { reportService } from './services/report.js';
import { gpxParserService } from './services/gpx-parser.js';

import { authMiddleware } from './middleware/auth.js';
import { faktyTablicy, wygenerujTresci, type Kanal } from './services/marketing.js';
import { rateLimit } from './middleware/rate-limit.js';
import { poiService, poiClusterCenter, PoiCandidate } from './services/poi.js';
import { routeValidatorService } from './services/route-validator.js';
import { callGeminiTracked } from './services/ai-usage.js';
import { streamSSE } from 'hono/streaming';
import { pobierzZewnetrzna, NiedozwolonyAdres } from './services/bezpieczne-pobieranie.js';
import { jezykZadania, JEZYKI_UI, type KodJezyka } from './services/jezyki.js';
import { przetlumaczPaczke } from './services/tlumaczenia.js';
import {
  przygotujKontekst, ulozDzien, opiszPreferencje,
  type ZadaniePlanu,
} from './services/planer.js';
import { fetchWikiCard, fetchNearbyPhotos, COMMONS_UA } from './services/photos.js';
import { placeSlug, VIBE_TAGS, kategoriaZRodzaju } from './services/katalog-helpers.js';
import { STYL_OPISU } from './services/styl-opisow.js';
import { placesRouter } from './routes/places.js';
import { chatInterviewRouter } from './routes/chat-interview.js';
import { routeProjectsRouter } from './routes/route-projects.js';
import { TOKEN_PRICES, ensureTokens } from './services/tokens.js';
import { punktyDnia, wstawPoDrodze, podejscie, PROFIL_TRASY } from './services/trasa-dnia.js';
import { catalogRouter } from './routes/catalog.js';
import { mcpRouter } from './routes/mcp.js';

const app = new Hono<{ Variables: { user: any, userId: string } }>();

/**
 * Endpointy, które przy każdym wywołaniu płacą u dostawcy (Gemini, Google Maps,
 * GraphHopper, Overpass). Do niedawna były dostępne bez żadnej autoryzacji —
 * dowolny adres w internecie mógł zamawiać generowanie tras na nasz rachunek,
 * a `ai_usage_log` nie miał komu przypisać kosztu.
 *
 * Hono dopasowuje trasy w kolejności rejestracji, więc te wpisy MUSZĄ stać
 * przed definicjami handlerów. Przeniesienie ich niżej po cichu wyłącza ochronę.
 *
 * Limity dobrane tak, by nie przeszkadzać normalnej pracy (wywiad to kilkanaście
 * tur, klikanie w markery bywa częstsze), a jednocześnie ucinać pętlę.
 */
const AI_ENDPOINTS: Record<string, { windowMs: number; max: number }> = {
  '/chat-interview': { windowMs: 5 * 60_000, max: 20 },
  '/live-route': { windowMs: 5 * 60_000, max: 30 },
  '/point-details': { windowMs: 5 * 60_000, max: 60 },
  '/points-details': { windowMs: 5 * 60_000, max: 20 },
  '/catalog/upsert': { windowMs: 5 * 60_000, max: 120 },
  '/catalog/seed': { windowMs: 10 * 60_000, max: 6 },
  '/catalog/submit': { windowMs: 10 * 60_000, max: 15 },
  '/events/refresh': { windowMs: 10 * 60_000, max: 6 },
  '/discover-places': { windowMs: 5 * 60_000, max: 20 },
  '/plan-trip': { windowMs: 5 * 60_000, max: 20 },
  '/geocode-points': { windowMs: 5 * 60_000, max: 60 },
  '/marketing/tresci': { windowMs: 10 * 60_000, max: 20 },
  '/plan-trip/stream': { windowMs: 5 * 60_000, max: 20 },
  // Przeliczenia opłaconego dnia są darmowe, więc limit jest jedyną zaporą
  // przed pętlą wywołań routera — 30 na 5 minut to kilka poprawek na minutę.
  '/plan-day-route': { windowMs: 5 * 60_000, max: 30 },
  // Oba przyjmują adres od użytkownika i karmią nim model. Bez logowania i
  // limitu byłby to darmowy generator kosztów po stronie Gemini, dostępny
  // dla każdego bota, który znajdzie ten adres.
  '/places/extract': { windowMs: 5 * 60_000, max: 15 },
  '/places/from-link': { windowMs: 5 * 60_000, max: 30 }
};

for (const [path, limit] of Object.entries(AI_ENDPOINTS)) {
  app.use(path, authMiddleware);
  app.use(path, rateLimit({ name: path, ...limit }));
}

/**
 * Ścieżki serwisowe: masowe zapisy do katalogu i hurtowe odpytywanie zewnętrznych
 * usług o zdjęcia i współrzędne. Nie miały żadnej kontroli — ani logowania, ani
 * roli — więc dowolny bot mógł uruchomić przepisywanie katalogu i rachunek za
 * geokodowanie. To narzędzia utrzymaniowe, nie funkcje serwisu, więc zamykamy je
 * rolą, a nie limitem zapytań.
 */
const ENDPOINTY_SERWISOWE = [
  '/board/refresh-photos',
  '/catalog/backfill-country',
  '/catalog/enrich',
  '/catalog/refresh-photos',
  '/catalog/translate-descriptions',
  '/catalog/wyrozniki',
];

const tylkoAdministrator: MiddlewareHandler = async (c, next) => {
  const uzytkownik = c.get('user') as { roles?: string[] } | undefined;
  if (!uzytkownik?.roles?.includes('admin')) {
    return c.json({ error: 'Operacja dostępna tylko dla administratora' }, 403);
  }
  await next();
};

for (const path of ENDPOINTY_SERWISOWE) {
  app.use(path, authMiddleware);
  app.use(path, tylkoAdministrator);
}

/**
 * Odczyty zwiazane z konkretnym uzytkownikiem. Nie wolaja modelu, wiec nie ma ich
 * w AI_ENDPOINTS, ale bez authMiddleware c.get('userId') zostaje puste i handler
 * odpowiada 401 KAZDEMU, takze zalogowanemu. Saldo tokenow nie dalo sie odczytac
 * ani razu: licznik przy tablicy milczal, a konsola dostawala 401 przy kazdym
 * wejsciu na strone.
 */
const ENDPOINTY_UZYTKOWNIKA = ['/tokens/balance'];

for (const path of ENDPOINTY_UZYTKOWNIKA) {
  app.use(path, authMiddleware);
}


/**
 * Wyszukiwarka miejsc dla projektu wyjazdowego. Zapytanie w języku naturalnym
 * ("najciekawsze muzea", "street food, nie turystyczne pułapki") zamienia się na
 * karty do przypięcia. Nazwy są dopasowywane do OpenStreetMap, więc karta niesie
 * realne współrzędne i godziny otwarcia, a nie tylko opis od modelu.
 */
app.post('/discover-places', async (c) => {
  try {
    const { query, destination, category, limit, creator_preferences } = await c.req.json() as {
      query: string; destination: string; category?: string; limit?: number;
      creator_preferences?: Record<string, number>;
    };
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    if (!query || !destination) return c.json({ error: 'query i destination są wymagane' }, 400);

    const center = await geocodingService.geocodeSettlement(destination);
    const poiCategory = category && ['food', 'nightlife', 'hotel'].includes(category) ? category : 'city_walk';
    let candidates: PoiCandidate[] = [];
    try {
      candidates = await poiService.fetchCandidates(
        { lat: center.lat, lng: center.lng }, poiCategory, { limit: 300 }
      );
    } catch (err) {
      console.warn('[discover] POI fetch failed, continuing with search only:', err);
    }

    // Lista kandydatów z OSM ograniczona do 25 (nie 60): przy pełnej liście
    // model regularnie "gubił się" — zamiast JSON-a odpowiadał samą
    // zapowiedzią ("Oto wyselekcjonowana lista miejsc...") i kończył z
    // finishReason=STOP bez treści. Zmierzone: z 60 pozycjami 5 z 6 wywołań
    // kończyło się pustym wynikiem, bez listy — zero.
    const poiList = candidates.slice(0, 25)
      .map((p) => `- "${p.name}"${p.openingHours ? ` [godziny: ${p.openingHours}]` : ''}`)
      .join('\n');

    // Obowiązujące preferencje: profil wyjazdu nadpisał już profil użytkownika po
    // stronie klienta, więc tutaj dostajemy gotową, jedną prawdę.
    const prefHints = opiszPreferencje(creator_preferences);

    const prompt = `Jesteś przewodnikiem po mieście ${destination}. Użytkownik szuka: "${query}".
${prefHints.length ? `\nZNANE PREFERENCJE TEGO UŻYTKOWNIKA (uwzględnij przy doborze i kolejności):\n${prefHints.map((h) => `- ${h}`).join('\n')}\n` : ''}
Użyj wyszukiwarki Google, aby znaleźć REALNE, aktualnie działające miejsca odpowiadające temu zapytaniu. Wybieraj miejsca z charakterem, a omijaj generyczne pułapki turystyczne i biurowce.

${poiList ? `Miejsca potwierdzone w OpenStreetMap (jeśli któreś pasuje, użyj DOKŁADNIE tej nazwy):\n${poiList}` : ''}

Zwróć 6-10 propozycji. Dla każdej podaj:
- "name": dokładna nazwa (jeśli jest na liście powyżej — skopiuj stamtąd znak w znak)
- "category": jedna z: attraction, food, nightlife, hotel, other
- "description": 2 zdania: co to za miejsce i co tam zjesz, zobaczysz albo zrobisz.
- "why": jedno zdanie, dlaczego to miejsce odpowiada zapytaniu użytkownika — konkretnie, bez superlatyw
- "visit_minutes": ile realnie zajmuje zwiedzenie/pobyt (liczba minut)
- "price_hint": orientacyjny koszt wstępu lub przedział cenowy (krótki tekst, np. "wstęp wolny", "średnia półka", "~40 zł", inaczej null)
- "address": ulica i numer budynku z wyników wyszukiwania (np. "Grodzka 11"), inaczej null

${STYL_OPISU}

WAŻNE: odpowiedz WYŁĄCZNIE obiektem JSON {"places": [...]} — bez wstępu, bez podsumowania, bez zdania powitalnego przed ani po. Sam JSON, nic więcej.`;

    const runSearch = () => callGeminiTracked(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        // Model 2.5 zużywa część budżetu wyjścia na rozumowanie + wyszukiwanie —
        // bez jawnego limitu bywało to niedokumentowane ograniczenie dostawcy,
        // które ucinało JSON w połowie (ten sam mechanizm co w /plan-trip).
        // Budżet rozumowania jak w planerze: bez limitu model myślał dłużej, niż
        // szukał — w Lublinie (27.09) 23 s na odpowiedź przy ~40 s całego wyszukania.
        generationConfig: { maxOutputTokens: 16384, thinkingConfig: { thinkingBudget: 1024 } }
      },
      { operation: 'discover-places', model: 'gemini-2.5-flash', userId: c.get('userId') || null }
    );

    const parsePlaces = (rawText: string): any[] | null => {
      try {
        const stripped = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const first = stripped.indexOf('{');
        const last = stripped.lastIndexOf('}');
        if (first >= 0 && last > first) return JSON.parse(stripped.slice(first, last + 1)).places ?? null;
      } catch { /* poniżej wymuszamy strukturę */ }
      return null;
    };

    // Nawet z krótszą listą model czasem odpowiada samą zapowiedzią i kończy
    // (finishReason=STOP, brak listy). To nie błąd, tylko rzadsza, ale wciąż
    // realna niedeterministyczność modelu — powtórka tego samego zapytania
    // zwykle się udaje, więc próbujemy dwa razy zanim uznamy odpowiedź za pustą.
    let rawText = '';
    let searchFinish: string | undefined;
    let places: any[] | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const searchData = await runSearch();
      rawText = searchData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      searchFinish = searchData.candidates?.[0]?.finishReason;
      if (searchFinish && searchFinish !== 'STOP') {
        console.warn(`[discover] Wyszukiwanie niekompletne (próba ${attempt}), finishReason=${searchFinish}, długość=${rawText.length}`);
      }
      places = parsePlaces(rawText);
      if (Array.isArray(places) && places.length > 0) break;
      console.warn(`[discover] Próba ${attempt} bez miejsc (${rawText.length} zn., finishReason=${searchFinish}). Początek: ${rawText.slice(0, 200)}`);
    }

    if (!Array.isArray(places)) {
      const jsonRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Przekonwertuj na JSON {"places":[...]}:\n${rawText}` }] }],
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
                      name: { type: 'string' }, category: { type: 'string' },
                      description: { type: 'string' }, why: { type: 'string' },
                      visit_minutes: { type: 'integer' }, price_hint: { type: 'string' }
                    },
                    required: ['name']
                  }
                }
              },
              required: ['places']
            },
            maxOutputTokens: 4096
          }
        })
      });
      const jsonData = await jsonRes.json() as any;
      const text = jsonData.candidates?.[0]?.content?.parts?.[0]?.text;
      const convertFinish = jsonData.candidates?.[0]?.finishReason;
      places = text ? JSON.parse(text).places : [];
      if (!Array.isArray(places) || places.length === 0) {
        console.warn(
          `[discover] Konwersja fallback pusta (searchFinish=${searchFinish}, rawTextDługość=${rawText.length}, ` +
          `convertFinish=${convertFinish}, convertTextDługość=${text?.length ?? 0}). rawText początek: ${rawText.slice(0, 200)}`
        );
      }
    }

    // Cała wartość planera stoi na tym, że miejsce wchodzi na tablicę ZE
    // WSPÓŁRZĘDNYMI. Propozycja bez nich zmusiłaby później planer albo routing do
    // geokodowania po nazwie — a to jest dokładnie ten krok, przez który trasa po
    // Krujë wylądowała w Nowym Sączu. Dlatego: najpierw dopasowanie do OSM, potem
    // geokodowanie ograniczone do okolicy celu, a jeśli i to zawiedzie —
    // propozycja wypada z wyników.
    const KM_LIMIT = 40;
    const kmFromCenter = (lat: number, lng: number) => {
      const dLat = (lat - center.lat) * 111;
      const dLng = (lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
      return Math.sqrt(dLat * dLat + dLng * dLng);
    };

    const resolved = await Promise.all(
      (places || []).slice(0, limit || 10).map(async (pl: any) => {
        const matched = poiService.matchCandidate(pl.name, candidates, { lat: center.lat, lng: center.lng });
        let lat = matched?.lat ?? null;
        let lng = matched?.lng ?? null;

        // Adres przed nazwą: lokal bez obiektu w OSM geokoder zna tylko jako budynek
        // przy ulicy. W Lublinie trzy z ośmiu propozycji (m.in. „Pierogarnia
        // u Dziadka”) odpadały bez położenia, choć model podawał je z wyszukiwarki.
        const zapytania = [
          typeof pl.address === 'string' && pl.address.trim() ? `${pl.address.trim()}, ${destination}` : null,
          pl.name,
        ].filter(Boolean) as string[];
        for (const zapytanie of zapytania) {
          if (lat != null) break;
          try {
            const geo = await geocodingService.geocodeSinglePoint(zapytanie, { lat: center.lat, lng: center.lng }, KM_LIMIT, true);
            if (geo && kmFromCenter(geo.lat, geo.lng) <= KM_LIMIT) {
              lat = geo.lat;
              lng = geo.lng;
            }
          } catch { /* nierozpoznany adres albo nazwa — próbujemy dalej, potem odsiewamy */ }
        }
        if (lat == null || lng == null) {
          console.log(`[discover] Odrzucone (brak położenia): "${pl.name}"`);
          return null;
        }

        // Zdjęcia z limitem: Commons potrafi odpowiadać kilkanaście sekund, a wynik
        // bez galerii jest lepszy niż wynik, na który czeka się dwa razy dłużej.
        const zLimitem = <T,>(p: Promise<T>, ms: number, zapas: T) =>
          Promise.race([p, new Promise<T>((r) => setTimeout(() => r(zapas), ms))]);
        const [wiki, photos] = await Promise.all([
          zLimitem(fetchWikiCard(matched?.wikipedia), 6000, {} as Awaited<ReturnType<typeof fetchWikiCard>>),
          zLimitem(fetchNearbyPhotos(pl.name, lat, lng, 3, undefined, matched?.wikipedia).catch(() => [] as string[]), 6000, [] as string[]),
        ]);

        return {
          name: pl.name,
          category: pl.category || 'attraction',
          description: pl.description || '',
          why: pl.why || '',
          visit_minutes: pl.visit_minutes || null,
          price_hint: pl.price_hint || null,
          lat,
          lng,
          distance_km: Math.round(kmFromCenter(lat, lng) * 10) / 10,
          opening_hours: matched?.openingHours ?? null,
          website: matched?.website ?? null,
          image_url: wiki.image ?? photos[0] ?? null,
          photos,
          wiki_extract: wiki.extract ?? null,
          verified: !!matched
        };
      })
    );

    const results = resolved.filter(Boolean);
    console.log(`[discover] "${query}" w ${destination}: ${results.length} z ${(places || []).length} propozycji ma położenie`);

    return c.json({ destination, center: { lat: center.lat, lng: center.lng }, places: results });
  } catch (err: any) {
    console.error('[discover-places] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});


/**
 * Układa przypięte miejsca w konkretne dni i godziny. Wykonalność liczymy w kodzie
 * (godziny otwarcia, czasy przejść), a modelowi zostawiamy kolejność i narrację —
 * odwrotnie byłoby zgadywaniem: model nie policzy rzetelnie, czy zdążysz.
 */

app.post('/plan-trip', async (c) => {
  // Droga odwrotu dla frontu, gdy strumień SSE nie przejdzie przez proxy albo
  // rozszerzenie przeglądarki. Dotąd miała własną kopię całego planera — prompt,
  // dopasowanie współrzędnych, filtry — i każda poprawka w planer.ts omijała ją
  // po cichu. Teraz to ten sam planer dzień po dniu, tylko oddany jednym JSON-em.
  try {
    const tokenUserId = c.get('userId') || null;
    const shortfall = await ensureTokens(tokenUserId, 'plan-trip');
    if (shortfall) return c.json({ error: shortfall, needs_tokens: true }, 402);
    const body = await c.req.json() as ZadaniePlanu;
    if (!process.env.GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    if (!body.places?.length) return c.json({ error: 'Brak przypiętych miejsc' }, 400);

    const kontekst = await przygotujKontekst(body, tokenUserId, jezykZadania(c));
    const wyniki = await Promise.all(kontekst.dni.map((d) =>
      ulozDzien(kontekst, d.index)
        .then((dzien) => ({ ok: true as const, dzien }))
        .catch((err: any) => ({ ok: false as const, numer: d.index, blad: err.message as string }))
    ));

    const dni = wyniki.flatMap((w) => (w.ok ? [w.dzien] : []));
    if (!dni.length) throw new Error('Nie udało się ułożyć żadnego dnia. Spróbuj ponownie.');
    for (const w of wyniki) if (!w.ok) console.warn(`[plan-trip] dzień ${w.numer}: ${w.blad}`);

    // Miejsca odrzucone już przy podziale na dni (z powodem z danych) idą na początek listy.
    const nieZaplanowane = [
      ...kontekst.odpadle.map((o) => ({ name: o.name, reason: o.reason })),
      ...dni.flatMap((d) => d.not_scheduled ?? []),
    ];
    const plan = {
      days: dni,
      warnings: [...new Set(dni.flatMap((d) => d.warnings ?? []))],
      not_scheduled: nieZaplanowane.filter((n, i, a) =>
        a.findIndex((x) => x.name.trim().toLowerCase() === n.name.trim().toLowerCase()) === i),
    };

    // Opłata dopiero teraz: plan jest gotowy i za chwilę trafi do użytkownika
    await repo.chargeTokens(tokenUserId!, TOKEN_PRICES['plan-trip'], 'plan dni', body.destination);
    return c.json(plan);
  } catch (err: any) {
    console.error('[plan-trip] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});


/**
 * Geokodowanie listy nazw w obrębie jednego miasta. Potrzebne, gdy z planu dnia
 * robimy trasę: pozycje dołożone przez agenta mają tylko nazwy, a bez
 * współrzędnych nie da się wyznaczyć przebiegu.
 */
/**
 * Trasa dnia planu: przebieg po chodnikach przez
 * przystanki dnia, zapisywany w planie. To zastępuje przejście do osobnego
 * kreatora — plan i trasa są jedną rzeczą.
 *
 * Cena: pierwsze wyznaczenie trasy danego dnia kosztuje tyle co dawne
 * `live-route`; każde kolejne przeliczenie tego dnia jest bez opłaty. Poprawki
 * planu kasują przebieg, a płacenie za każde przeciągnięcie pinezki karało za
 * dopracowywanie dnia.
 */
app.post('/plan-day-route', async (c) => {
  try {
    const user = c.get('user') as AuthenticatedRouteBuilderUser;
    // Tryb trasy (pieszo/rower) został wycofany: trasa jest zawsze piesza, a pole `tryb`
    // ze starszego klienta jest ignorowane, nie odrzucane.
    const body = await c.req.json() as { plan_id?: string; day?: number; via?: { lat: number; lng: number }[] };
    const dzienNr = Number(body.day);
    if (!body.plan_id || !Number.isInteger(dzienNr) || dzienNr < 1) {
      return c.json({ error: 'Brak planu albo numeru dnia' }, 400);
    }

    const plan = await repo.getPlanForUser(body.plan_id, user);
    if (!plan) return c.json({ error: 'Nie ma takiego planu albo nie masz do niego dostępu' }, 404);

    const dzien = (plan.plan?.days || []).find((d: any) => d.day === dzienNr);
    if (!dzien) return c.json({ error: `Plan nie ma dnia ${dzienNr}` }, 404);

    const baza = plan.projekt.start_name
      ? { name: plan.projekt.start_name, lat: plan.projekt.start_lat, lng: plan.projekt.start_lng }
      : null;
    const via = (Array.isArray(body.via) ? body.via : []).slice(0, 10)
      .filter((v) => Number.isFinite(v?.lat) && Number.isFinite(v?.lng));
    const punkty = wstawPoDrodze(punktyDnia(dzien.items || [], baza), via);
    if (punkty.length < 2) {
      return c.json({ error: 'Ten dzień ma za mało punktów na mapie, żeby wyznaczyć trasę.' }, 400);
    }

    const oplacony = await repo.isDayRoutePaid(plan.id, dzienNr);
    const cena = TOKEN_PRICES['live-route'];
    if (!oplacony) {
      const brak = await ensureTokens(user.id, 'live-route');
      if (brak) return c.json({ error: brak, needs_tokens: true }, 402);
    }

    const miejsca = punkty.map((p, i) => ({
      name: p.name, lat: p.lat, lng: p.lng, confidence: 1, source: 'plan', provider: 'plan',
      type: i === 0 ? 'start' : (i === punkty.length - 1 ? 'end' : 'waypoint'),
    }));
    const trasa = await routingService.getRoute(miejsca as any, PROFIL_TRASY, { intent: 'popular' });
    if (!trasa.trackPoints?.length) throw new Error('Router nie zwrócił przebiegu');

    // Pobieramy dopiero po udanym wyznaczeniu. Zapis opłaty idzie pierwszy:
    // gdy dwa zapytania o ten sam dzień przyjdą naraz, drugie nie wstawi wiersza
    // i nie pobierze drugi raz.
    let pobrano = 0;
    if (!oplacony && await repo.markDayRoutePaid(plan.id, dzienNr, user.id, cena)) {
      await repo.chargeTokens(user.id, cena, 'trasa dnia', `${plan.projekt.name} · dzień ${dzienNr}`);
      pobrano = cena;
    }

    const slad = trasa.trackPoints.map((p) => [
      Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6, Math.round((p[2] ?? 0) * 10) / 10,
    ] as [number, number, number]);
    console.log(`[plan-day-route] ${plan.projekt.name} d${dzienNr}: ${trasa.distance_km.toFixed(2)} km, ${punkty.length} pkt (${via.length} po drodze), ${pobrano ? `pobrano ${pobrano}` : 'bez opłaty'}`);
    return c.json({
      track: slad,
      km: trasa.distance_km,
      h: trasa.duration_h,
      podejscie_m: podejscie(slad),
      via,
      punktow: punkty.length,
      pobrano,
    });
  } catch (err: any) {
    console.error('[plan-day-route]', err);
    return c.json({ error: err.message }, 500);
  }
});

app.post('/geocode-points', async (c) => {
  try {
    const { names, near } = await c.req.json() as { names: string[]; near: string };
    if (!Array.isArray(names) || names.length === 0) return c.json({ points: [] });

    let bias: { lat: number; lng: number } | undefined;
    let radiusKm: number | undefined;
    if (near) {
      try {
        const center = await geocodingService.geocodeSettlement(near);
        bias = { lat: center.lat, lng: center.lng };
        radiusKm = 15;
      } catch {
        // Bez miasta nadal spróbujemy, tylko mniej celnie
      }
    }

    // Pozycje organizacyjne nie są miejscami — próba ich geokodowania kończyła się
    // trafieniem w przypadkową miejscowość (wpis "Przejazd/Czas wolny" wylądował
    // pod Częstochową w trasie po Bukareszcie).
    const NON_PLACE = /^(przejazd|przej[śs]cie|przerwa|czas wolny|wolny czas|powr[óo]t|dojazd|transfer|lunch|obiad|kolacja|\u015bniadanie|odpoczynek|spacer(\s|$)|nocleg)/i;

    const points = await Promise.all(
      names.slice(0, 30).map(async (name) => {
        if (NON_PLACE.test(String(name).trim())) {
          return { name, lat: null, lng: null, reason: 'not_a_place' };
        }
        try {
          const query = near && !name.toLowerCase().includes(near.toLowerCase()) ? `${name}, ${near}` : name;
          const place = await geocodingService.geocodeSinglePoint(query, bias, radiusKm);
          // Twarda bariera: punkt oddalony od miasta o więcej niż 40 km nie należy
          // do tej trasy, choćby geokoder był z siebie zadowolony.
          if (bias) {
            const away = routeValidatorService.distanceKm(bias, { lat: place.lat, lng: place.lng });
            if (away > 40) {
              console.warn(`[geocode-points] "${name}" odrzucone: ${away.toFixed(0)} km od ${near}`);
              return { name, lat: null, lng: null, reason: 'wrong_region' };
            }
          }
          return { name, lat: place.lat, lng: place.lng };
        } catch {
          return { name, lat: null, lng: null, reason: 'not_found' };
        }
      })
    );

    return c.json({ points });
  } catch (err: any) {
    console.error('[geocode-points] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});


/** Wspólny klucz dla obu wariantów opisu punktu — bez tego cache się nie widzą. */
function pointCacheKey(name: string, lat?: number, lng?: number): string {
  return `${name.toLowerCase()}|${lat?.toFixed(3) ?? '-'}|${lng?.toFixed(3) ?? '-'}`;
}

/**
 * Opisy wszystkich punktów trasy naraz. Wcześniej każdy marker wołał Gemini
 * osobno po kliknięciu — użytkownik czekał przy każdym punkcie, a koszt rósł
 * liniowo z liczbą kliknięć. Jedno zapytanie na trasę jest szybsze i tańsze.
 */
app.post('/points-details', async (c) => {
  try {
    const { points } = await c.req.json() as { points: { name: string; lat?: number; lng?: number }[] };
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    if (!Array.isArray(points) || points.length === 0) return c.json({ details: {} });

    const all = points.slice(0, 20);

    // Ten sam wariant odpala się teraz po każdej wygenerowanej trasie, a klasyki
    // regionu powtarzają się między trasami — bez wspólnego cache'u opisywaliśmy
    // Wawel od nowa przy każdym przeliczeniu.
    const details: Record<string, any> = {};
    const list: typeof all = [];
    for (const p of all) {
      const hit = pointDetailsCache.get(pointCacheKey(p.name, p.lat, p.lng));
      if (hit && Date.now() - hit.at < POINT_DETAILS_TTL_MS) details[p.name] = hit.data;
      else list.push(p);
    }
    if (list.length === 0) {
      console.log(`[points-details] ${all.length} pkt w całości z cache'u`);
      return c.json({ details });
    }

    const prompt = `Dla każdego z poniższych miejsc napisz krótki opis, orientacyjne godziny otwarcia i jedną praktyczną wskazówkę.
${STYL_OPISU}

Miejsca:
${list.map((p, i) => `${i + 1}. ${p.name}${p.lat ? ` (${p.lat.toFixed(4)}, ${p.lng?.toFixed(4)})` : ''}`).join('\n')}

Dla każdego zwróć obiekt z polami:
- "name": nazwa DOKŁADNIE tak, jak podano wyżej
- "description": 2-3 zdania: czym jest to miejsce i co tam realnie robisz.
- "recommendation": jedno zdanie praktycznej wskazówki (np. o której przyjść, żeby ominąć kolejkę, co zamówić, skąd jest najlepszy widok).
- "opening_hours": orientacyjne godziny otwarcia (np. "wt-nd 10:00-19:00" lub "całodobowo / na zewnątrz"), jeśli znane, inaczej null

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
                    recommendation: { type: 'string' },
                    opening_hours: { type: 'string' }
                  },
                  required: ['name']
                }
              }
            },
            required: ['places']
          },
          maxOutputTokens: 8192
        }
      },
      { operation: 'points-details', model: 'gemini-2.5-flash', userId: c.get('userId') || null }
    );

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = text ? JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim()) : { places: [] };

    // Zdjęcia lecą równolegle — nie wydłużają odpowiedzi o sumę pojedynczych czasów.
    // Najpierw jednak szukamy punktu w katalogu: stamtąd bierzemy gotową galerię
    // (przeszła już przez filtr miasta), a gdy jej nie ma — przynajmniej miasto
    // i tag wikipedii do zapytania. Bez tego karta pokazywała obiekty o tej samej
    // nazwie z drugiego końca świata, a katalog dla tych samych miejsc słusznie
    // nie zwracał nic. Dwie ścieżki, dwa różne wyniki dla jednego miejsca.
    const wKatalogu = await Promise.all(
      list.map((p) => repo.matchCatalogForPoint(p.name, p.lat, p.lng).catch(() => null))
    );
    const photos = await Promise.all(
      list.map((p, i) => {
        const kat = wKatalogu[i];
        const gotowe = Array.isArray(kat?.photos) ? (kat.photos as string[]).filter(Boolean) : [];
        if (gotowe.length) return Promise.resolve(gotowe);
        return fetchNearbyPhotos(p.name, p.lat, p.lng, 5, kat?.city ?? undefined, kat?.wikipedia ?? undefined, kat?.country ?? null);
      })
    );

    list.forEach((p, i) => {
      const found = (parsed.places || []).find((x: any) => x.name === p.name)
        || (parsed.places || [])[i];
      const entry = {
        description: found?.description || '',
        recommendation: found?.recommendation || '',
        opening_hours: found?.opening_hours || null,
        photos: photos[i] || []
      };
      details[p.name] = entry;
      if (pointDetailsCache.size >= POINT_DETAILS_MAX) {
        const oldest = pointDetailsCache.keys().next().value;
        if (oldest !== undefined) pointDetailsCache.delete(oldest);
      }
      pointDetailsCache.set(pointCacheKey(p.name, p.lat, p.lng), { at: Date.now(), data: entry });
    });

    console.log(`[points-details] ${list.length} z ${all.length} pkt z modelu, zdjęcia: ${list.map((p, i) => `${p.name}=${photos[i]?.length ?? 0}`).join(', ')}`);
    return c.json({ details });
  } catch (err: any) {
    console.error('[points-details] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});




/**
 * Strony z prawdziwymi znacznikami dla robotów i podglądów odnośników.
 *
 * Te trzy adresy nginx kieruje tutaj zamiast wprost do kontenera frontu. Zwracamy
 * ten sam index.html, który dostałaby przeglądarka — więc aplikacja startuje
 * normalnie — tylko z podmienionym tytułem, opisem i obrazkiem. Bez tego każdy
 * odnośnik do tablicy czy miejsca wyglądał w udostępnianiu identycznie jak strona
 * główna, a dla wyszukiwarek był jej duplikatem.
 */
app.get('/tablica/:id', async (c) => {
  try {
    const w = await wizytowkaTablicy(c.req.param('id'));
    return c.html(await stronaZWizytowka(w));
  } catch (err: any) {
    console.warn('[wizytowka/tablica]', err.message);
    return c.html(await stronaZWizytowka(null));
  }
});

app.get('/miejsce/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const w = await wizytowkaMiejsca(slug);
    if (!w) {
      // Adres sprzed poprawki transliteracji („pa-ac-gorkow”) — stałe przekierowanie,
      // żeby wyszukiwarki przeniosły wpis zamiast zgubić stronę.
      const nowy = await repo.catalogSlugZPoprzedniego(slug);
      if (nowy) return c.redirect(`/miejsce/${nowy}`, 301);
    }
    return c.html(await stronaZWizytowka(w));
  } catch (err: any) {
    console.warn('[wizytowka/miejsce]', err.message);
    return c.html(await stronaZWizytowka(null));
  }
});

/**
 * Mapa strony budowana z bazy. Poprzednia była plikiem statycznym z kwietnia,
 * wymieniała siedemdziesiąt adresów i ani jednej publicznej tablicy ani miejsca
 * z katalogu — czyli pomijała całą treść, która ma się w ogóle znaleźć.
 */
/**
 * Materiały promocyjne dla konkretnej publicznej tablicy.
 *
 * Endpoint jest zamknięty rolą administratora, a nie cennikiem tokenów. Cennik
 * ma sens tam, gdzie użytkownik prosi o wynik dla siebie; tutaj wynik służy
 * promocji platformy, więc obciążanie za niego właściciela byłoby tarciem bez
 * powodu. Zamknięcie musi być jednak po stronie serwera — sama osłona trasy
 * w przeglądarce zostawiłaby otwarte wejście do modelu dla każdego zalogowanego.
 */
/**
 * Plan wyjazdu podawany dzień po dniu, zamiast jednym pakietem na końcu.
 *
 * Stary `/plan-trip` liczył cały wyjazd jednym wywołaniem modelu: średnio 43 s,
 * w najgorszym zmierzonym przypadku 112 s, i przez cały ten czas na ekranie
 * tykał licznik sekund. Tutaj dni liczą się równolegle, a każdy gotowy leci do
 * przeglądarki od razu — pierwszy dzień pojawia się, zanim ostatni się policzy,
 * i całość trwa tyle, co najwolniejszy dzień, a nie tyle, co ich suma.
 *
 * Dni wysyłamy w kolejności numerów, choć liczą się równolegle. Kolejność
 * ukończenia byłaby szybsza o ułamek sekundy i gorsza dla czytającego: plan,
 * w którym dzień trzeci wskakuje przed pierwszym, wygląda na zepsuty.
 *
 * Stary endpoint zostaje nietknięty jako droga odwrotu — gdyby strumień padł
 * u kogoś na firmowym proxy, front ma się czym poratować. Obie ścieżki dzielą
 * ten sam serwis, więc nie mogą rozjechać się co do treści planu.
 */
app.post('/plan-trip/stream', async (c) => {
  const tokenUserId = c.get('userId') || null;
  const shortfall = await ensureTokens(tokenUserId, 'plan-trip');
  if (shortfall) return c.json({ error: shortfall, needs_tokens: true }, 402);

  const body = await c.req.json() as ZadaniePlanu;
  if (!body.places?.length) return c.json({ error: 'Brak przypiętych miejsc' }, 400);

  // Bez tego nagłówka nginx zbuforowałby całą odpowiedź i oddał ją dopiero na
  // końcu — dni docierałyby naraz, czyli dokładnie tak, jak przed zmianą, tyle
  // że okrężną drogą. Nagłówek dotyczy tej jednej odpowiedzi, więc buforowanie
  // pozostałych endpointów zostaje nietknięte.
  c.header('X-Accel-Buffering', 'no');
  c.header('Cache-Control', 'no-cache, no-transform');

  return streamSSE(c, async (stream) => {
    const wyslij = (typ: string, dane: Record<string, unknown>) =>
      stream.writeSSE({ data: JSON.stringify({ typ, ...dane }) });

    const zaczeto = Date.now();
    try {
      await wyslij('etap', { opis: 'Sprawdzam godziny otwarcia i szukam miejsc w okolicy' });
      const kontekst = await przygotujKontekst(body, tokenUserId, jezykZadania(c));

      const ile = kontekst.dni.length;
      await wyslij('etap', {
        opis: ile === 1 ? 'Układam plan dnia' : `Układam ${ile} dni naraz`,
        dni: ile,
      });

      // Wszystkie dni ruszają teraz; pętla niżej tylko odbiera wyniki.
      const wRobocie = kontekst.dni.map((d) =>
        ulozDzien(kontekst, d.index)
          .then((dzien) => ({ ok: true as const, dzien }))
          .catch((err: any) => ({ ok: false as const, numer: d.index, blad: err.message }))
      );

      const ostrzezenia: string[] = [];
      // Miejsca odrzucone już przy podziale na dni (z powodem z danych) idą na początek listy.
      const nieZaplanowane: { name: string; reason?: string }[] = kontekst.odpadle.map((o) => ({ name: o.name, reason: o.reason }));
      let udane = 0;

      for (const oczekiwane of wRobocie) {
        const wynik = await oczekiwane;
        if (wynik.ok) {
          udane++;
          ostrzezenia.push(...(wynik.dzien.warnings ?? []));
          nieZaplanowane.push(...(wynik.dzien.not_scheduled ?? []));
          await wyslij('dzien', { dzien: wynik.dzien });
        } else {
          console.warn(`[plan-trip/stream] dzień ${wynik.numer}: ${wynik.blad}`);
          await wyslij('blad-dnia', { numer: wynik.numer, blad: wynik.blad });
        }
      }

      if (!udane) throw new Error('Nie udało się ułożyć żadnego dnia. Spróbuj ponownie.');

      // Opłata dopiero teraz: użytkownik ma już plan przed oczami.
      await repo.chargeTokens(tokenUserId!, TOKEN_PRICES['plan-trip'], 'plan dni', body.destination);

      const sekundy = Math.round((Date.now() - zaczeto) / 100) / 10;
      console.log(`[plan-trip/stream] ${udane}/${ile} dni w ${sekundy} s`);
      await wyslij('koniec', {
        warnings: [...new Set(ostrzezenia)],
        not_scheduled: nieZaplanowane.filter((n, i, a) =>
          a.findIndex((x) => x.name.trim().toLowerCase() === n.name.trim().toLowerCase()) === i),
        sekundy,
      });
    } catch (err: any) {
      console.error('[plan-trip/stream]', err);
      await wyslij('blad', { blad: err.message });
    }
  });
});


app.post('/marketing/tresci', async (c) => {
  try {
    const uzytkownik = c.get('user') as { roles?: string[] } | undefined;
    if (!uzytkownik?.roles?.includes('admin')) {
      return c.json({ error: 'Narzędzie dostępne tylko dla administratora' }, 403);
    }

    const body = await c.req.json() as { tablicaId?: string; kanal?: Kanal };
    const kanal = body.kanal ?? 'instagram';
    if (!['instagram', 'facebook', 'seo'].includes(kanal)) {
      return c.json({ error: `Nieznany kanał: ${kanal}` }, 400);
    }
    if (!body.tablicaId) return c.json({ error: 'Brak tablicaId' }, 400);

    const fakty = await faktyTablicy(body.tablicaId);
    if (!fakty) {
      // Tablica prywatna albo nieistniejąca — z zewnątrz to ten sam przypadek.
      return c.json({ error: 'Nie znaleziono publicznej tablicy o tym identyfikatorze' }, 404);
    }

    const warianty = await wygenerujTresci(kanal, fakty, c.get('userId') || null);
    return c.json({ kanal, fakty, warianty });
  } catch (err: any) {
    console.error('[marketing]', err.message);
    return c.json({ error: err.message }, 500);
  }
});

app.get('/miasto/:slug', async (c) => {
  try {
    const w = await wizytowkaMiasta(c.req.param('slug'));
    // Nieznane miasto: ta sama aplikacja (pokaże „nie mamy tego miasta”), ale 404.
    return c.html(await stronaZWizytowka(w), w ? 200 : 404);
  } catch (err: any) {
    console.warn('[wizytowka/miasto]', err.message);
    return c.html(await stronaZWizytowka(null));
  }
});

app.get('/tablice', async (c) => {
  try {
    return c.html(await stronaZWizytowka(await wizytowkaGalerii()));
  } catch (err: any) {
    console.warn('[wizytowka/tablice]', err.message);
    return c.html(await stronaZWizytowka(null));
  }
});

app.get('/sitemap.xml', async (c) => {
  try {
    const [{ boards, places }, miasta] = await Promise.all([repo.sitemapEntries(), repo.catalogCities()]);
    const dzien = (d: any) => (d ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10));
    const wpis = (loc: string, lastmod: string, prio: string) =>
      `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><priority>${prio}</priority></url>`;

    const wiersze = [
      wpis('https://routemarket.io/', dzien(null), '1.0'),
      wpis('https://routemarket.io/tablice', dzien(null), '0.9'),
      ...miasta.map((m) => wpis(`https://routemarket.io/miasto/${slugMiasta(m)}`, dzien(null), '0.9')),
      ...boards.map((b: any) => wpis(`https://routemarket.io/tablica/${b.id}`, dzien(b.updated_at), '0.8')),
      ...places.map((p: any) => wpis(`https://routemarket.io/miejsce/${p.slug}`, dzien(p.updated_at), '0.6')),
    ];

    c.header('Content-Type', 'application/xml; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${wiersze.join('\n')}
</urlset>`);
  } catch (err: any) {
    console.error('[sitemap]', err.message);
    return c.text('', 500);
  }
});



/**
 * Zdjęcia dla miejsc na tablicach, które ich nie mają. Część miejsc trafiła na
 * tablice zanim dobór zdjęć zaczął działać porządnie, a kafelek tablicy bez ani
 * jednego zdjęcia to trzy kolorowe prostokąty — sygnał, że tablica jest pusta,
 * choć wcale nie jest.
 */
app.post('/board/refresh-photos', async (c) => {
  try {
    const { limit = 120 } = await c.req.json().catch(() => ({})) as { limit?: number };
    const braki = await repo.listBoardPlacesWithoutPhoto(limit);
    if (braki.length === 0) return c.json({ checked: 0, updated: 0 });

    let uzupelnione = 0;
    const BATCH = 5;
    for (let i = 0; i < braki.length; i += BATCH) {
      const partia = braki.slice(i, i + BATCH);
      const zestawy = await Promise.all(partia.map((m: any) =>
        fetchNearbyPhotos(m.name, m.lat ?? undefined, m.lng ?? undefined, 1,
          m.trip_projects?.destination ?? undefined).catch(() => [])
      ));
      await Promise.all(partia.map(async (m: any, j: number) => {
        const url = zestawy[j]?.[0];
        if (!url) return;
        await repo.setBoardPlacePhoto(m.id, url);
        uzupelnione++;
      }));
    }

    console.log(`[board/refresh-photos] sprawdzono ${braki.length}, uzupełniono ${uzupelnione}`);
    return c.json({ checked: braki.length, updated: uzupelnione });
  } catch (e: any) {
    console.error('[board/refresh-photos]', e);
    return c.json({ error: e.message }, 500);
  }
});





// Rozpoznawanie miejsc z odnośnika/tekstu/wyszukiwania — patrz routes/places.ts.
// Middleware dla /places/extract i /places/from-link jest już zarejestrowane
// wyżej (pętla AI_ENDPOINTS) — Hono dopasowuje po ścieżce, nie po tym, skąd
// pochodzi handler, więc kolejność montowania względem TEJ pętli nie ma znaczenia,
// o ile montowanie jest PO niej.
app.route('/places', placesRouter);

// Katalog miejsc: seed/upsert/enrich/submit/refresh-photos itd. — patrz routes/catalog.ts.
app.route('/', catalogRouter);
// Serwer MCP i połączenia agentów AI (Claude, ChatGPT, Gemini) — patrz routes/mcp.ts.
app.route('/', mcpRouter);



/**
 * Wydarzenia w mieście. To jedyna warstwa, której nie ma w żadnym przewodniku,
 * bo wystawa trwa trzy tygodnie i za miesiąc opis jest nieaktualny — a
 * jednocześnie to najmocniejszy powód, żeby wrócić na stronę przed wyjazdem.
 * Szukamy z wyszukiwarką, bo bez niej model podałby wydarzenia sprzed dwóch lat.
 */
/**
 * Sprawdza, czy adres wydarzenia w ogóle istnieje.
 *
 * Model dostaje narzędzie wyszukiwania, a mimo to zwracał adresy wyglądające
 * wiarygodnie i prowadzące donikąd: z sześciu sprawdzonych ręcznie działały dwa,
 * reszta to 404 albo domena bez odpowiedzi. Link, który wygląda na zweryfikowany
 * i prowadzi w pustkę, jest gorszy niż brak linku — dlatego zapisujemy wyłącznie
 * te, które odpowiedziały.
 *
 * Najpierw HEAD, bo tani; część serwerów go nie obsługuje i odpowiada 405, więc
 * wtedy próbujemy GET. Krótki limit czasu, bo to blokuje odświeżanie wydarzeń.
 */
async function adresIstnieje(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  for (const metoda of ['HEAD', 'GET'] as const) {
    try {
      const odp = await fetch(url, {
        method: metoda,
        redirect: 'follow',
        headers: { 'User-Agent': 'RouteMarketBot/1.0 (+https://routemarket.io)' },
        signal: AbortSignal.timeout(6000),
      });
      if (odp.ok) return true;
      if (odp.status !== 405 && odp.status !== 501) return false;
    } catch {
      return false;
    }
  }
  return false;
}

app.post('/events/refresh', async (c) => {
  try {
    const { city, from, to } = await c.req.json() as { city: string; from?: string; to?: string };
    if (!city?.trim()) return c.json({ error: 'city jest wymagane' }, 400);
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

    const today = new Date().toISOString().slice(0, 10);
    const fromDate = from || today;
    const toDate = to || new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const prompt = `Znajdź WYDARZENIA odbywające się w mieście ${city} w okresie od ${fromDate} do ${toDate}.

Interesują nas: wystawy czasowe, festiwale, koncerty cykliczne, jarmarki, wydarzenia sportowe i kulturalne — rzeczy z konkretnym zakresem dat, których nie ma w stałym programie miasta.

Użyj wyszukiwarki, żeby sprawdzić AKTUALNE terminy. Dzisiaj jest ${today}.
Nie podawaj wydarzeń, które już się zakończyły, ani takich, których dat nie potrafisz ustalić.

Dla każdego zwróć:
- "name": nazwa wydarzenia
- "venue": nazwa miejsca, w którym się odbywa (dokładnie, jeśli znasz)
- "description": jedno zdanie, czego dotyczy
- "starts_on": data w formacie RRRR-MM-DD
- "ends_on": data zakończenia w formacie RRRR-MM-DD (jeśli jednodniowe, ta sama co starts_on)
- "url": adres strony wydarzenia WYŁĄCZNIE z wyników wyszukiwania, dokładnie taki,
  jaki tam widzisz. Nie układaj adresu samodzielnie ze wzoru ani nie zgaduj.
  Jeśli w wynikach nie ma adresu tego wydarzenia, wpisz null.

Zwróć od 3 do 12 wydarzeń. Odpowiedz WYŁĄCZNIE obiektem JSON: {"events": [...]}`;

    const data = await callGeminiTracked(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }], tools: [{ googleSearch: {} }] },
      { operation: 'events-refresh', model: 'gemini-2.5-flash', userId: c.get('userId') || null }
    );

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let events: any[] = [];
    try {
      const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first >= 0 && last > first) events = JSON.parse(cleaned.slice(first, last + 1)).events || [];
    } catch {
      console.warn('[events] Nie udało się sparsować odpowiedzi');
    }

    const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const catalog = await repo.listCatalogByCity(city, 200);
    const saved: any[] = [];

    let odrzuconeAdresy = 0;
    const sprawdzonyAdres = async (url: unknown): Promise<string | null> => {
      if (typeof url !== 'string' || !url.trim()) return null;
      const czysty = url.trim().slice(0, 500);
      if (await adresIstnieje(czysty)) return czysty;
      odrzuconeAdresy++;
      return null;
    };

    for (const ev of events) {
      // Data bez formatu to data zmyślona — takie wpisy odrzucamy, bo wydarzenie
      // bez terminu nie ma żadnej wartości w planowaniu wyjazdu.
      if (!ev?.name || !isDate(ev.starts_on)) continue;
      if (ev.ends_on && !isDate(ev.ends_on)) ev.ends_on = null;
      if ((ev.ends_on || ev.starts_on) < today) continue;

      const venue = typeof ev.venue === 'string' ? ev.venue.trim().toLowerCase() : '';
      const match = venue
        ? catalog.find((p: any) => p.name.toLowerCase() === venue)
          || catalog.find((p: any) => p.name.toLowerCase().includes(venue) || venue.includes(p.name.toLowerCase()))
        : null;

      try {
        const row = await repo.upsertEvent({
          place_id: match?.id ?? null,
          city,
          name: String(ev.name).slice(0, 200),
          description: String(ev.description || '').slice(0, 500),
          starts_on: ev.starts_on,
          ends_on: ev.ends_on || ev.starts_on,
          url: await sprawdzonyAdres(ev.url)
        });
        if (row) saved.push(row);
      } catch (err: any) {
        console.warn(`[events] Pominięte "${ev.name}": ${err.message}`);
      }
    }

    console.log(`[events] ${city}: zapisano ${saved.length} z ${events.length} znalezionych`
      + (odrzuconeAdresy ? `, odrzucono ${odrzuconeAdresy} nieistniejących adresów` : ''));
    return c.json({ city, saved: saved.length, events: saved });
  } catch (err: any) {
    console.error('[events/refresh] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});




/** Saldo i historia — użytkownik ma widzieć, za co zapłacił. */
app.get('/tokens/balance', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Wymagane zalogowanie' }, 401);
  try {
    const [balance, ledger] = await Promise.all([
      repo.getTokenBalance(userId),
      repo.listLedger(userId, 30)
    ]);
    return c.json({ balance, prices: TOKEN_PRICES, ledger });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Healthcheck
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '2.0.0', service: 'route-builder-api' });
});

// Get short description and recommendations for a waypoint/POI
/**
 * Opis pojedynczego punktu, pobierany po kliknięciu markera. Opisy miejsc się
 * nie zmieniają, a użytkownicy klikają te same klasyki, więc trzymamy je w
 * pamięci — bez tego każde kliknięcie to osobne płatne zapytanie do modelu.
 */
const pointDetailsCache = new Map<string, { at: number; data: any }>();
const POINT_DETAILS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const POINT_DETAILS_MAX = 2000;

app.post('/point-details', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { name?: unknown, lat?: unknown, lng?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const lat = typeof body.lat === 'number' ? body.lat : undefined;
    const lng = typeof body.lng === 'number' ? body.lng : undefined;
    // Bez tego pusty request szedł do modelu z nazwą "undefined" i i tak był płatny.
    if (!name) return c.json({ error: 'Pole "name" jest wymagane.' }, 400);

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const cacheKey = pointCacheKey(name, lat, lng);
    const cached = pointDetailsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < POINT_DETAILS_TTL_MS) {
      return c.json(cached.data);
    }

    const prompt = `Jesteś profesjonalnym przewodnikiem turystycznym i ekspertem od atrakcji turystycznych.
Zbuduj krótki, interesujący opis (2-3 zdania) i jedną praktyczną wskazówkę/rekomendację dla miejsca o nazwie: "${name}".
Współrzędne geograficzne tego punktu to: lat: ${lat || 'nieznane'}, lng: ${lng || 'nieznane'}.

Zwróć odpowiedź WYŁĄCZNIE jako obiekt JSON z dwoma polami: "description" (tekst opisu po polsku) oraz "recommendation" (wskazówka po polsku).
Nie dodawaj żadnych tagów markdown, po prostu czysty obiekt JSON, np.:
{
  "description": "...",
  "recommendation": "..."
}`;

    const data = await callGeminiTracked(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      },
      { operation: 'point-details', model: 'gemini-2.5-flash', userId: c.get('userId') || null }
    );

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (generatedText) {
      const cleanText = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const resultObj = JSON.parse(cleanText);
      // Ta sama galeria co w wariancie zbiorczym — inaczej punkt dociągnięty
      // kliknięciem (gdy batch padnie) zostawał bez zdjęć
      resultObj.photos = await fetchNearbyPhotos(name, lat, lng);
      if (pointDetailsCache.size >= POINT_DETAILS_MAX) {
        const oldest = pointDetailsCache.keys().next().value;
        if (oldest !== undefined) pointDetailsCache.delete(oldest);
      }
      pointDetailsCache.set(cacheKey, { at: Date.now(), data: resultObj });
      return c.json(resultObj);
    }
    throw new Error("No text from Gemini");
  } catch (err: any) {
    console.error("Point details error:", err);
    return c.json({ error: err.message }, 500);
  }
});



// Projekty tras, GPX, live-route, atlas — patrz routes/route-projects.ts.
app.route('/', routeProjectsRouter);

// Wywiad AI — patrz routes/chat-interview.ts. Middleware dla /chat-interview
// (AI_ENDPOINTS) jest już zarejestrowane wyżej, więc montowanie tutaj nic nie zmienia.
app.route('/', chatInterviewRouter);


const port = process.env.PORT ? parseInt(process.env.PORT) : 8081;
console.log(`Route Builder API v2 is running on port ${port}`);

serve({ fetch: app.fetch, port });
