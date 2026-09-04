import { Hono, type MiddlewareHandler } from 'hono';
import { serve } from '@hono/node-server';
import { zValidator } from '@hono/zod-validator';
import { RouteRequirementsSchema } from './types/index.js';
import { repo } from './db/repository.js';
import { geocodingService } from './services/geocoding.js';
import { wizytowkaTablicy, wizytowkaMiejsca, stronaZWizytowka } from './services/wizytowki.js';
import { routingService } from './services/routing.js';
import { gpxService } from './services/gpx.js';
import { reportService } from './services/report.js';
import { gpxParserService } from './services/gpx-parser.js';

import { authMiddleware } from './middleware/auth.js';
import { faktyTablicy, wygenerujTresci, type Kanal } from './services/marketing.js';
import { rateLimit } from './middleware/rate-limit.js';
import { poiService, poiClusterCenter, PoiCandidate } from './services/poi.js';
import { routeValidatorService } from './services/route-validator.js';
import { describeAvailability, isOpenDuring } from './services/opening-hours.js';
import { callGeminiTracked } from './services/ai-usage.js';
import { streamSSE } from 'hono/streaming';
import { pobierzZewnetrzna, NiedozwolonyAdres } from './services/bezpieczne-pobieranie.js';
import { jezykZadania, JEZYKI_UI, type KodJezyka } from './services/jezyki.js';
import { przetlumaczPaczke } from './services/tlumaczenia.js';
import {
  przygotujKontekst, ulozDzien, opiszPreferencje, clusterPlacesByProximity,
  type ZadaniePlanu,
} from './services/planer.js';
import { fetchWikiCard, fetchNearbyPhotos, COMMONS_UA } from './services/photos.js';
import { placeSlug, VIBE_TAGS, kategoriaZRodzaju } from './services/katalog-helpers.js';
import { placesRouter } from './routes/places.js';
import { chatInterviewRouter } from './routes/chat-interview.js';
import { routeProjectsRouter } from './routes/route-projects.js';
import { TOKEN_PRICES, ensureTokens } from './services/tokens.js';
import { catalogRouter } from './routes/catalog.js';

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

    const prompt = `Jesteś kuratorem i przewodnikiem po mieście ${destination} dla wymagających podróżników (styl Monocle, Conde Nast Traveler). Użytkownik szuka: "${query}".
${prefHints.length ? `\nZNANE PREFERENCJE TEGO UŻYTKOWNIKA (uwzględnij przy doborze i kolejności):\n${prefHints.map((h) => `- ${h}`).join('\n')}\n` : ''}
Użyj wyszukiwarki Google, aby znaleźć REALNE, aktualnie działające i magnetyczne miejsca odpowiadające temu zapytaniu. Wybieraj miejsca z klimatem, autentycznością i charakterem (unikaj nudnych, generycznych pułapek turystycznych i surowych biurowców).

${poiList ? `Miejsca potwierdzone w OpenStreetMap (jeśli któreś pasuje, użyj DOKŁADNIE tej nazwy):\n${poiList}` : ''}

Zwróć 6-10 propozycji. Dla każdej podaj:
- "name": dokładna nazwa (jeśli jest na liście powyżej — skopiuj stamtąd znak w znak)
- "category": jedna z: attraction, food, nightlife, hotel, other
- "description": 2 zdania żywego opisu: jaka tam panuje atmosfera, co tam poczujesz i zjesz/zobaczysz. Unikaj suchych roczników i encyklopedyzmu.
- "why": jedno intrygujące zdanie, dlaczego to miejsce idealnie odpowiada zapytaniu użytkownika
- "visit_minutes": ile realnie zajmuje zwiedzenie/pobyt (liczba minut)
- "price_hint": orientacyjny koszt wstępu lub przedział cenowy (krótki tekst, np. "wstęp wolny", "średnia półka", "~40 zł", inaczej null)

WAŻNE: odpowiedz WYŁĄCZNIE obiektem JSON {"places": [...]} — bez wstępu, bez podsumowania, bez zdania powitalnego przed ani po. Sam JSON, nic więcej.`;

    const runSearch = () => callGeminiTracked(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        // Model 2.5 zużywa część budżetu wyjścia na rozumowanie + wyszukiwanie —
        // bez jawnego limitu bywało to niedokumentowane ograniczenie dostawcy,
        // które ucinało JSON w połowie (ten sam mechanizm co w /plan-trip).
        generationConfig: { maxOutputTokens: 16384 }
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

        if (lat == null) {
          try {
            const geo = await geocodingService.geocodeSinglePoint(pl.name, { lat: center.lat, lng: center.lng }, KM_LIMIT);
            if (geo && kmFromCenter(geo.lat, geo.lng) <= KM_LIMIT) {
              lat = geo.lat;
              lng = geo.lng;
            }
          } catch { /* nierozpoznana nazwa — odsiewamy niżej */ }
        }
        if (lat == null || lng == null) {
          console.log(`[discover] Odrzucone (brak położenia): "${pl.name}"`);
          return null;
        }

        const [wiki, photos] = await Promise.all([
          fetchWikiCard(matched?.wikipedia),
          fetchNearbyPhotos(pl.name, lat, lng, 3, undefined, matched?.wikipedia)
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
  try {
    const tokenUserId = c.get('userId') || null;
    const shortfall = await ensureTokens(tokenUserId, 'plan-trip');
    if (shortfall) return c.json({ error: shortfall, needs_tokens: true }, 402);
    const body = await c.req.json() as {
      destination: string;
      days: number;
      window: { start: string; end: string };
      start_date?: string;
      hotel?: { name: string; lat?: number; lng?: number } | null;
      fill_percent?: number;
      fixed?: { time: string; label: string; minutes?: number }[];
      places: {
        name: string; category?: string; priority?: 'must' | 'nice';
        lat?: number | null; lng?: number | null;
        opening_hours?: string | null; visit_minutes?: number | null; description?: string | null;
      }[];
      creator_preferences?: Record<string, number>;
    };
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    if (!body.places?.length) return c.json({ error: 'Brak przypiętych miejsc' }, 400);

    const toMin = (t: string) => {
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
    };
    const windowStart = toMin(body.window.start);
    const windowEnd = toMin(body.window.end);
    const minutesPerDay = Math.max(0, windowEnd - windowStart);
    const dayCount = Math.max(1, body.days || 1);

    const baseDate = body.start_date ? new Date(`${body.start_date}T12:00:00`) : new Date();
    const dayNames = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

    // Dostępność każdego miejsca w każdym dniu — policzona, nie zgadnięta
    const dayInfos = Array.from({ length: dayCount }, (_, i) => {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);
      return {
        index: i + 1,
        date: date.toISOString().slice(0, 10),
        weekday: dayNames[date.getDay()],
        dateObj: date
      };
    });

    const placeLines = body.places.map((pl) => {
      const minutes = pl.visit_minutes || 60;
      const perDay = dayInfos.map((d) => {
        const fits = isOpenDuring(pl.opening_hours, d.dateObj, windowStart, Math.min(minutes, minutesPerDay));
        const desc = describeAvailability(pl.opening_hours, d.dateObj);
        const verdict = fits === false ? ' — NIE MIEŚCI SIĘ W TWOIM OKNIE' : '';
        return `dzień ${d.index} (${d.weekday}): ${desc}${verdict}`;
      }).join(' | ');
      return `- "${pl.name}" [${pl.priority === 'must' ? 'KONIECZNIE' : 'jeśli wyjdzie'}, ${pl.category || 'attraction'}, ok. ${minutes} min] ${perDay}`;
    }).join('\n');

    const totalVisitMinutes = body.places.reduce((sum, p) => sum + (p.visit_minutes || 60), 0);
    const mustMinutes = body.places.filter((p) => p.priority === 'must')
      .reduce((sum, p) => sum + (p.visit_minutes || 60), 0);
    const budget = minutesPerDay * dayCount;
    // Suwak "ile czasu zaplanować": reszta okna ma zostać pusta z rozmysłu.
    // Dzień wypełniony co do minuty to lista zadań, nie plan wyjazdu.
    const fillPercent = Math.min(100, Math.max(0, body.fill_percent ?? 70));

    // Podział geograficzny liczony tutaj, nie zlecany modelowi
    const clusters = dayCount > 1 ? clusterPlacesByProximity(body.places, dayCount) : [];
    const clusterHint = clusters.length > 1
      ? `\n\nSKUPISKA GEOGRAFICZNE (policzone z współrzędnych — trzymaj się ich, chyba że godziny otwarcia każą inaczej; wtedy napisz o tym w "warnings"):\n`
        + clusters.map((g, i) => `Grupa ${i + 1}: ${g.map((p) => p.name).join(', ')}`).join('\n')
      : '';
    const plannedBudget = Math.round(budget * fillPercent / 100);

    // Tablica użytkownika jest inspiracją, nie ramą — ktoś może przypiąć jedno
    // miejsce i oczekiwać, że resztę dnia agent zaproponuje sam. Bez puli
    // kandydatów planer nie miałby czym wypełnić czasu poza "spacerem".
    let fillerPois: PoiCandidate[] = [];
    let fillerSights: PoiCandidate[] = [];
    let fillerFood: PoiCandidate[] = [];
    // Środek miasta przydaje się jeszcze raz niżej, przy sprawdzaniu współrzędnych
    // od modelu, więc żyje poza tym blokiem.
    let center: { lat: number; lng: number } | null = null;
    try {
      center = await geocodingService.geocodeSettlement(body.destination);
      const [sights, food] = await Promise.all([
        poiService.fetchCandidates({ lat: center.lat, lng: center.lng }, 'city_walk', { limit: 40 }),
        poiService.fetchCandidates({ lat: center.lat, lng: center.lng }, 'food', { limit: 15 }).catch(() => [])
      ]);
      const pinnedNames = new Set(body.places.map((p) => p.name.toLowerCase()));
      const nieprzypiete = (c: any) => !pinnedNames.has(c.name.toLowerCase());
      // Rozdzielone, bo w prompcie pełnią różne role: zabytkami wypełnia się dzień,
      // a lokalami obsadza konkretne godziny posiłków. Zlane w jedną listę model
      // traktował jednakowo i zostawiał "Kolacja" jako pustą pozycję bez miejsca.
      fillerSights = sights.filter(nieprzypiete);
      fillerFood = food.filter(nieprzypiete);
      fillerPois = [...fillerSights, ...fillerFood];
      console.log(`[plan-trip] ${fillerSights.length} propozycji do zwiedzania, `
        + `${fillerFood.length} lokali na posiłki`);
    } catch (err) {
      console.warn('[plan-trip] Nie udało się pobrać propozycji:', err);
    }

    const opisPoi = (c: any) =>
      `- "${c.name}" (${c.kind}${c.openingHours ? `, godziny: ${c.openingHours}` : ''})`;
    const fillerLines = fillerSights.slice(0, 30).map(opisPoi).join('\n');
    const foodLines = fillerFood.slice(0, 15).map(opisPoi).join('\n');

    const prefOpisy = opiszPreferencje(body.creator_preferences);
    const prefLines = prefOpisy.map((o) => `- ${o}`).join('\n');
    if (prefOpisy.length) {
      console.log(`[plan-trip] preferencje w podpowiedzi: ${prefOpisy.length} — ${prefOpisy.join(' | ')}`);
    }

    const fixedLines = (body.fixed || [])
      .map((f) => `- ${f.time} ${f.label}${f.minutes ? ` (${f.minutes} min)` : ''}`).join('\n');

    const prompt = `Ułóż plan zwiedzania miasta ${body.destination}.

RAMY: ${dayCount} dni, każdego dnia od ${body.window.start} do ${body.window.end} (${Math.round(minutesPerDay / 60 * 10) / 10} h dziennie, łącznie ${Math.round(budget / 60)} h).
${body.hotel?.name ? `BAZA: ${body.hotel.name} — każdy dzień zaczyna się i kończy tutaj.` : ''}
${fixedLines ? `STAŁE PUNKTY DNIA (nie do przesunięcia):\n${fixedLines}` : ''}
${prefLines ? `PREFERENCJE UŻYTKOWNIKA — uwzględnij je przy doborze miejsc, długości postojów i kolejności:\n${prefLines}` : ''}

MIEJSCA PRZYPIĘTE PRZEZ UŻYTKOWNIKA — to KOTWICE planu, nie cały plan
(dostępność policzona dla Twoich okien czasowych):
${placeLines}

${fillerLines ? `ZWERYFIKOWANE MIEJSCA W TYM MIEŚCIE, KTÓRYCH UŻYTKOWNIK NIE PRZYPIĄŁ
(możesz i POWINIENEŚ nimi wypełnić resztę dnia — kopiuj nazwy dokładnie):
${fillerLines}` : ''}

${foodLines ? `LOKALE NA POSIŁKI W TYM MIEŚCIE (kopiuj nazwy dokładnie):
${foodLines}` : ''}

BILANS: samo zwiedzanie to ok. ${Math.round(totalVisitMinutes / 60 * 10) / 10} h (w tym ${Math.round(mustMinutes / 60 * 10) / 10} h oznaczone KONIECZNIE), a całe okno to ${Math.round(budget / 60)} h.

${clusterHint}

WYPEŁNIENIE DNIA: ${fillPercent}%. Zaplanuj ok. ${Math.round(plannedBudget / 60 * 10) / 10} h konkretnych punktów na cały wyjazd, a POZOSTAŁE ${Math.round((budget - plannedBudget) / 60 * 10) / 10} h ZOSTAW PUSTE Z ROZMYSŁU. To nie jest czas do zapełnienia — użytkownik świadomie poprosił o luz na włóczenie się, przypadkowe przystanki i dłuższe siedzenie tam, gdzie mu się spodoba.${fillPercent <= 40 ? ' Przy tak niskim wypełnieniu wybierz TYLKO najważniejsze kotwice i nie dokładaj propozycji z listy poniżej.' : ''}${fillPercent >= 90 ? ' Przy tak wysokim wypełnieniu możesz zagęścić dzień i dołożyć propozycje z listy.' : ''}
W polu "summary" każdego dnia napisz jednym zdaniem, ile czasu zostaje wolnego i co można w nim zrobić w tej okolicy. Doliczaj jeszcze przejścia między miejscami (pieszo ok. 15 min na kilometr) oraz przerwy.

ZASADY:
1. Miejsca oznaczone KONIECZNIE mają pierwszeństwo — wstaw je najpierw, w dniach, w których są otwarte.
2. NIGDY nie planuj wizyty w miejscu oznaczonym jako ZAMKNIĘTE danego dnia ani takiego, które NIE MIEŚCI SIĘ W OKNIE.
3. Grupuj miejsca leżące blisko siebie w ten sam dzień — dzień ma być spójny geograficznie, bez biegania przez miasto.
4. NIGDY NIE ZOSTAWIAJ PUSTEGO DNIA. "Czas wolny" na kilka godzin przy niewykorzystanych miejscach to błąd planu, nie wynik.
5. KRÓTSZA WIZYTA ZAMIAST REZYGNACJI. Jeśli miejsce jest otwarte, ale zostało mniej czasu, niż wynosi pełne zwiedzanie, ZAPLANUJ JE NA TYLE, ILE ZOSTAŁO, i napisz to wprost w "note", np. "zamykają o 18:00 — masz 60 z 90 min, wejdź od razu". Turysta sam zdecyduje, czy mu to wystarczy. Do "not_scheduled" trafia tylko to, co jest ZAMKNIĘTE danego dnia albo czego naprawdę nie da się wcisnąć.
6. TABLICA TO INSPIRACJA, NIE RAMA. Użytkownik mógł przypiąć jedno miejsce i oczekuje, że resztę dnia ZAPROPONUJESZ TY. Wypełnij wolny czas konkretnymi miejscami z listy powyżej, dobranymi do jego preferencji i leżącymi blisko kotwic tego dnia. W polu "source" wpisz "pinned" dla miejsc przypiętych przez użytkownika i "suggested" dla Twoich propozycji, żeby wiedział, co jest czyje.
   Gdy w okolicy naprawdę nie ma czego dodać, dopiero wtedy zaproponuj nazwany spacer ("spacer po Starym Mieście: Rynek, Katharinenstraße"). Samo "czas wolny" jest zawsze błędem.
7. POSIŁEK TO MIEJSCE, NIE GODZINA. Jeśli w stałych punktach dnia jest obiad albo kolacja,
   wstaw w tym czasie KONKRETNY LOKAL z listy powyżej i jego nazwę wpisz w "name" — wybierz
   taki, który leży blisko punktu, w którym użytkownik akurat wtedy będzie, a nie najlepszy
   w mieście. Sama "Kolacja" bez nazwy lokalu jest pustą pozycją: nie da się jej pokazać na
   mapie, dodać do trasy ani sprawdzić godzin otwarcia. Gdy w okolicy naprawdę nie ma nic
   z listy, napisz w "note", w której dzielnicy szukać, zamiast zostawiać samo słowo.
   Uwzględnij preferencje użytkownika co do jedzenia, jeśli je podano.
8. Nie upychaj na siłę ponad ramy czasowe. Jeśli coś naprawdę się nie mieści, zostaw to w "not_scheduled" z konkretnym powodem.
   "not_scheduled" DOTYCZY WYŁĄCZNIE MIEJSC Z TABLICY UŻYTKOWNIKA. Twoich niewykorzystanych propozycji NIE WYPISUJ TAM — użytkownik ich nie wybierał i nie interesuje go, że nie weszły. Lista propozycji to Twoja pula do wypełniania dnia, nie zobowiązanie.
9. W "warnings" napisz rzeczy, o których użytkownik musi wiedzieć (np. "Muzeum X w poniedziałek zamknięte, przeniosłem na środę", "do zamknięcia zostanie 20 minut — trzeba się streszczać").
10. Jeśli KONIECZNIE nie mieszczą się w budżecie, w "question" zadaj konkretne pytanie o wybór (np. skrócić wizyty, odpuścić coś, czy przemieszczać się taksówką).

ZWIĘZŁOŚĆ: "note" najwyżej 80 znaków, "summary" najwyżej 120 znaków, "reason" najwyżej 80 znaków. Żadnych rozbudowanych opisów — to harmonogram, nie przewodnik.

Odpowiedz WYŁĄCZNIE obiektem JSON.`;

    const data = await callGeminiTracked(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              days: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    day: { type: 'integer' },
                    summary: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          time: { type: 'string' },
                          name: { type: 'string' },
                          kind: { type: 'string' },
                          minutes: { type: 'integer' },
                          note: { type: 'string' },
                          source: { type: 'string', enum: ['pinned', 'suggested'] },
                          lat: { type: 'number' },
                          lng: { type: 'number' }
                        },
                        required: ['time', 'name']
                      }
                    }
                  },
                  required: ['day', 'items']
                }
              },
              not_scheduled: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string' }, reason: { type: 'string' } },
                  required: ['name']
                }
              },
              warnings: { type: 'array', items: { type: 'string' } },
              question: { type: 'string' }
            },
            required: ['days']
          },
          // Model 2.5 zużywa część budżetu na rozumowanie — przy ciasnym limicie
          // JSON urywał się w połowie zdania. Limit musi mieścić jedno i drugie.
          maxOutputTokens: 32768
        }
      },
      { operation: 'plan-trip', model: 'gemini-2.5-flash', userId: c.get('userId') || null }
    );
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const finish = data.candidates?.[0]?.finishReason;
    if (!text) throw new Error(`Pusta odpowiedź planera (finishReason: ${finish})`);
    if (finish && finish !== 'STOP') {
      console.warn(`[plan-trip] Odpowiedź niekompletna, finishReason=${finish}, długość=${text.length}`);
    }
    let plan: any;
    try {
      plan = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (parseErr: any) {
      console.error(`[plan-trip] Niepoprawny JSON (${text.length} zn., finishReason=${finish}). Początek: ${text.slice(0, 220)}`);
      throw new Error(`Planer zwrócił niekompletną odpowiedź (${finish || 'nieznany powód'}). Spróbuj ponownie lub zmniejsz liczbę miejsc.`);
    }

    // Każda pozycja planu dostaje współrzędne, jeśli tylko da się je ustalić.
    // Propozycje agenta niosły dotąd samą nazwę, więc przy robieniu trasy z dnia
    // wracały do geokodera — a to jest ten krok, przez który trasy lądowały w
    // przypadkowych miastach. Pinezki użytkownika i pula POI mają współrzędne z
    // OSM, wystarczy je przenieść.
    const coordPool = [
      ...body.places.map((pl) => ({ name: pl.name, lat: (pl as any).lat, lng: (pl as any).lng })),
      ...fillerPois.map((f) => ({ name: f.name, lat: f.lat, lng: f.lng }))
    ].filter((x) => x.lat != null && x.lng != null);

    // Dopasowanie po samej równości nazw prawie nie działało. Model przeformułowuje
    // nazwy — "Amfiteatr w Durrës" wraca jako "Amfiteatr rzymski", "Kościół
    // Garnizonowy pw. św. Elżbiety" jako "Bazylika św. Elżbiety" — więc równość
    // łapała jedną pozycję na dzień i mapa pokazywała jedną pinezkę. Porównujemy
    // teraz zbiory słów znaczących, bez znaków diakrytycznych i bez wyrazów
    // pospolitych, które w nazwach zabytków powtarzają się wszędzie.
    const NAME_STOP = new Set(['w', 'we', 'na', 'pod', 'przy', 'the', 'of', 'i', 'oraz',
      'pw', 'sw', 'swietej', 'swietego', 'sw.', 'stary', 'stare', 'nowy', 'nowe']);

    const nameTokens = (raw: string): string[] => [...new Set(
      String(raw || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !NAME_STOP.has(t))
    )];

    const pool = coordPool.map((x) => ({ ...x, tokens: nameTokens(x.name) }));

    // Same liczone słowa nie wystarczą. "Muzeum Archeologiczne" i "Muzeum Narodowe"
    // dzielą połowę nazwy, a to dwa różne budynki; "Amfiteatr rzymski" i "Amfiteatr
    // w Durrës" dzielą też połowę i to jest jedno miejsce. Różnica siedzi w tym, że
    // "muzeum" powtarza się w całej puli, a "amfiteatr" występuje raz. Dlatego słowo
    // waży tym więcej, im rzadziej pojawia się wśród nazw, które mamy.
    const docFreq = new Map<string, number>();
    for (const x of pool) for (const t of x.tokens) docFreq.set(t, (docFreq.get(t) || 0) + 1);
    const weight = (t: string) => Math.log((pool.length + 1) / ((docFreq.get(t) || 0) + 1)) + 1;
    const mass = (tokens: string[]) => tokens.reduce((sum, t) => sum + weight(t), 0);

    const similarity = (a: string[], b: string[]): number => {
      if (a.length === 0 || b.length === 0) return 0;
      const inB = new Set(b);
      const shared = a.filter((t) => inB.has(t)).reduce((sum, t) => sum + weight(t), 0);
      const base = Math.min(mass(a), mass(b));
      return base > 0 ? shared / base : 0;
    };

    const kmFromCenter = (lat: number, lng: number): number => {
      if (!center) return 0;
      const dLat = (lat - center.lat) * 111;
      const dLng = (lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
      return Math.sqrt(dLat * dLat + dLng * dLng);
    };

    let located = 0;
    let unlocated = 0;
    const missing: string[] = [];
    for (const day of plan.days || []) {
      for (const item of day.items || []) {
        const raw = String(item.name || '');
        const exact = pool.find((x) => x.name.trim().toLowerCase() === raw.trim().toLowerCase());
        let hit: { lat: any; lng: any } | undefined = exact;

        if (!hit) {
          const tokens = nameTokens(raw);
          const scored = pool
            .map((x) => ({ x, score: similarity(tokens, x.tokens) }))
            .filter((r) => r.score >= 0.5)
            .sort((a, b) => b.score - a.score);
          hit = scored[0]?.x;
        }

        if (hit) {
          item.lat = hit.lat;
          item.lng = hit.lng;
          located++;
          continue;
        }

        // Bez dopasowania zostają tylko współrzędne od modelu, a te bywają zmyślone.
        // Przyjmujemy je wyłącznie wtedy, gdy leżą w zasięgu miasta; inaczej lepszy
        // jest brak pinezki niż pinezka w innym kraju.
        if (typeof item.lat === 'number' && typeof item.lng === 'number' && kmFromCenter(item.lat, item.lng) < 40) {
          located++;
        } else {
          delete item.lat;
          delete item.lng;
          unlocated++;
        }
      }
    }

    // Druga runda dla pozycji, które zostały bez punktu. To niemal zawsze pozycje
    // przejściowe — "Przejście do Ogrodu Botanicznego", "Powrót pod hotel",
    // "Obiad w Hali Targowej" — gdzie cel siedzi w końcówce nazwy, tyle że
    // w odmienionej formie ("Ogrodu Botanicznego" vs "Ogród Botaniczny" w puli).
    // Dlatego porównujemy rdzenie słów (pierwsze 5 znaków), a gdy i to zawiedzie,
    // pozycja dostaje punkt między najbliższymi sąsiadami dnia: pinezka "po
    // drodze" jest bliżej prawdy niż dziura w mapie dnia i w pliku GPX.
    const TRANSITION = /^(przejscie|przejazd|spacer|powrot|wyjazd|zejscie|wejscie|dojazd|dojscie|obiad|lunch|kolacja|sniadanie|przerwa)[a-z ]*?\b(do|pod|na|w|we|z|ze|przez|przy|obok)\b/;
    for (const day of plan.days || []) {
      const items: any[] = day.items || [];
      items.forEach((item: any, i: number) => {
        if (typeof item.lat === 'number' && typeof item.lng === 'number') return;
        const raw = String(item.name || '');
        const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const m = norm.match(TRANSITION);
        const target = m ? norm.slice((m.index ?? 0) + m[0].length) : norm;
        const tStems = nameTokens(target).map((t) => t.slice(0, 5));
        if (tStems.length > 0) {
          const scored = pool
            .map((x) => {
              const xs = new Set(x.tokens.map((t) => t.slice(0, 5)));
              const shared = tStems.filter((t) => xs.has(t)).length;
              return { x, score: shared / tStems.length };
            })
            .filter((r) => r.score >= 0.6)
            .sort((a, b) => b.score - a.score);
          if (scored[0]) {
            item.lat = scored[0].x.lat;
            item.lng = scored[0].x.lng;
            located++;
            unlocated--;
            return;
          }
        }
        const prev = items.slice(0, i).reverse().find((x) => typeof x.lat === 'number');
        const next = items.slice(i + 1).find((x) => typeof x.lat === 'number');
        const anchor = prev && next
          ? { lat: (prev.lat + next.lat) / 2, lng: (prev.lng + next.lng) / 2 }
          : (prev || next);
        if (anchor) {
          item.lat = anchor.lat;
          item.lng = anchor.lng;
          // Punkt przybliżony — frontend może go rysować delikatniej.
          item.approx = true;
          located++;
          unlocated--;
        } else {
          missing.push(raw);
        }
      });
    }
    console.log(`[plan-trip] Współrzędne: ${located} pozycji ma, ${unlocated} bez${
      missing.length ? ` (${missing.slice(0, 5).join(', ')})` : ''}`);

    // "Nie zmieściło się" ma mówić o tym, co użytkownik przypiął. Model dostaje
    // pulę kilkudziesięciu propozycji do wypełniania dnia i raportował każdą
    // niewykorzystaną — plan na 4 miejsca kończył się listą 35 "pominiętych"
    // pomników i barów, których nikt nie wybierał.
    const pinnedNames = new Set(body.places.map((p) => p.name.trim().toLowerCase()));
    plan.not_scheduled = (plan.not_scheduled || [])
      .filter((n: any) => n?.name && pinnedNames.has(String(n.name).trim().toLowerCase()))
      .filter((n: any, i: number, arr: any[]) =>
        arr.findIndex((x) => String(x.name).trim().toLowerCase() === String(n.name).trim().toLowerCase()) === i);

    // Daty i nazwy dni dokładamy po stronie serwera, żeby nie zależały od modelu
    plan.days = (plan.days || []).map((d: any) => {
      const info = dayInfos.find((x) => x.index === d.day);
      return { ...d, date: info?.date, weekday: info?.weekday };
    });

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

    const prompt = `Jesteś autorem inspirujących przewodników w stylu Monocle, Lonely Planet i Conde Nast Traveler. Dla każdego z poniższych miejsc napisz magnetyczny opis, orientacyjne godziny otwarcia i jedną praktyczną wskazówkę (insider tip).
Skup się na zmysłach, klimacie, energii i tym, dlaczego to miejsce zapada w pamięć. UNIKAJ encyklopedyzmu i metryk budowlanych ("zbudowany w roku...", "charakteryzuje się...").

Miejsca:
${list.map((p, i) => `${i + 1}. ${p.name}${p.lat ? ` (${p.lat.toFixed(4)}, ${p.lng?.toFixed(4)})` : ''}`).join('\n')}

Dla każdego zwróć obiekt z polami:
- "name": nazwa DOKŁADNIE tak, jak podano wyżej
- "description": 2-3 zdania wciągającego opisu: jaki tam panuje klimat, co tam poczujesz i dlaczego warto tam wejść (dźwięki, światło, atmosfera, widok, zapach). Pokaż żywe doświadczenie zamiast lekcji historii.
- "recommendation": jedno zdanie genialnego "Insider Tip" (np. o której godzinie przyjść by ominąć kolejkę, co zamówić, gdzie usiąść, sekretny punkt widokowy).
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
        return fetchNearbyPhotos(p.name, p.lat, p.lng, 5, kat?.city ?? undefined, kat?.wikipedia ?? undefined);
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
    const w = await wizytowkaMiejsca(c.req.param('slug'));
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
      const nieZaplanowane: { name: string; reason?: string }[] = [];
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

app.get('/sitemap.xml', async (c) => {
  try {
    const { boards, places } = await repo.sitemapEntries();
    const dzien = (d: any) => (d ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10));
    const wpis = (loc: string, lastmod: string, prio: string) =>
      `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><priority>${prio}</priority></url>`;

    const wiersze = [
      wpis('https://routemarket.io/', dzien(null), '1.0'),
      wpis('https://routemarket.io/tablice', dzien(null), '0.9'),
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
