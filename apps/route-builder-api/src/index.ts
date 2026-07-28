import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { zValidator } from '@hono/zod-validator';
import { RouteRequirementsSchema } from './types/index.js';
import { repo } from './db/repository.js';
import { geocodingService } from './services/geocoding.js';
import { routingService } from './services/routing.js';
import { gpxService } from './services/gpx.js';
import { reportService } from './services/report.js';
import { gpxParserService } from './services/gpx-parser.js';

import { authMiddleware } from './middleware/auth.js';
import { poiService, PoiCandidate } from './services/poi.js';
import { routeValidatorService } from './services/route-validator.js';

const app = new Hono<{ Variables: { user: any, userId: string } }>();

/** Kształt odpowiedzi agenta wywiadu, wymuszany na Gemini (OpenAPI subset). */
const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    phase: { type: 'string', enum: ['discovery', 'variant_choice', 'refine', 'confirm', 'generate'] },
    reply: { type: 'string' },
    allow_custom: { type: 'boolean' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          description: { type: 'string' },
          highlights: { type: 'array', items: { type: 'string' } },
          implies: {
            type: 'object',
            properties: {
              structure: { type: 'string' },
              region: { type: 'string' },
              difficulty: { type: 'string' },
              pattern: { type: 'string' },
              accommodation: { type: 'string' },
              variant: { type: 'string' }
            }
          }
        },
        required: ['id', 'title']
      }
    },
    add_waypoints: { type: 'array', items: { type: 'string' } },
    extracted: {
      type: 'object',
      properties: {
        start_point: { type: 'string' },
        end_point: { type: 'string' },
        route_type: { type: 'string' },
        distance: { type: 'string' },
        days: { type: 'integer' },
        intent: { type: 'string' },
        loop: { type: 'boolean' },
        key_waypoints: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  required: ['done', 'reply']
};

/**
 * Wyciąga z rozmowy miejsce startu i docelowy dystans, gdy użytkownik nie postawił
 * pinezki na mapie. Bez tego nie znamy centrum obszaru i warstwa POI nie ma jak zadziałać.
 */
async function extractLocationFromConversation(
  apiKey: string,
  conversationText: string,
  inputNotes?: string
): Promise<{ startPlace: string | null; distanceKm: number | null; isLoop: boolean; days: number | null }> {
  const prompt = `Z poniższej rozmowy o planowaniu trasy wyciągnij:
1. "start_place" — nazwę miejscowości startu w formie NADAJĄCEJ SIĘ DO WYSZUKANIA NA MAPIE:
   - mianownik, oficjalna pisownia w języku kraju, w którym leży to miejsce (np. z "ze Złotych Hor i okolicy" → "Zlaté Hory", z "spod Zakopanego" → "Zakopane", z "w Krakowie" → "Kraków");
   - SAMA nazwa miejscowości — bez słów "okolice", "i okolicy", "rejon", bez przyimków i bez opisów;
   - jeśli w rozmowie nie padła żadna konkretna miejscowość, zwróć null.
2. "distance_km" — docelowy dystans trasy w km jako liczbę. Dla wędrówek pieszych określonych w dniach przelicz: lekki 15 km/dzień, umiarkowany 20 km/dzień, wymagający 25 km/dzień. Jeśli padła liczba dni, ale nie padła trudność — przyjmij umiarkowaną (20 km/dzień). Zwróć null tylko wtedy, gdy nie padł ani dystans, ani liczba dni.
3. "is_loop" — true jeśli trasa ma być pętlą (powrót do startu), false jeśli liniowa. Domyślnie true.
4. "days" — liczba dni wędrówki, jeśli padła w rozmowie (np. "2 dni" → 2). Jeśli nie padła, zwróć null.

Rozmowa:
"""
${conversationText.slice(0, 6000)}
"""
${inputNotes ? `Notatki użytkownika: "${inputNotes.slice(0, 2000)}"` : ''}

Odpowiedz WYŁĄCZNIE obiektem JSON: {"start_place": "...", "distance_km": 50, "is_loop": true, "days": null}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  if (!response.ok) throw new Error(`Gemini location extraction error ${response.status}`);
  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { startPlace: null, distanceKm: null, isLoop: true, days: null };
  const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  return {
    startPlace: parsed.start_place || null,
    distanceKm: Number(parsed.distance_km) || null,
    isLoop: parsed.is_loop !== false,
    days: Number(parsed.days) || null
  };
}

/**
 * Zasięg obszaru poszukiwań POI. Dla pętli o obwodzie D promień koła wynosi D/(2π),
 * więc szukanie atrakcji dalej niż ~D/5 od startu z założenia produkuje trasę
 * dłuższą, niż użytkownik zamówił.
 */
function poiRadiusForRoute(
  distanceKm: number | null,
  isLoop: boolean,
  days?: number | null,
  structure?: string
): number | undefined {
  const dayCount = days ?? 1;
  // Gdy padła liczba dni, ale nie trudność, dystans bywa nieustalony — zamiast
  // spadać do ciasnego domyślnego promienia przyjmujemy umiarkowane tempo,
  // inaczej główny szczyt pasma wypada poza obszar szukania.
  const effectiveDistanceKm = distanceKm ?? (dayCount >= 2 ? dayCount * 20 : null);
  if (!effectiveDistanceKm) return undefined;
  distanceKm = effectiveDistanceKm;

  // "radial" = nocleg w bazie, czyli kilka niezależnych jednodniowych pętli —
  // zasięg wyznacza pojedynczy dzień, nie suma wyjazdu.
  if (structure === 'radial' && dayCount >= 2) {
    return Math.min(150, Math.max(6, Math.round(distanceKm / dayCount / (2 * Math.PI))));
  }

  // Wędrówka wielodniowa z noclegiem na trasie nie jest okręgiem wokół startu —
  // turysta idzie do celu i wraca inną drogą, więc punkt zwrotny leży ok. D/2.5
  // od startu. Traktowanie jej jak pętli (D/2π) zawężało obszar tak, że główny
  // szczyt pasma wypadał poza zasięg (Śnieżka 22 km od Szklarskiej Poręby przy
  // promieniu 8 km).
  const isMultiDay = dayCount >= 2 || structure === 'traverse';
  const raw = isMultiDay
    ? distanceKm / 2
    : isLoop
      ? distanceKm / (2 * Math.PI)
      : distanceKm / 2.2;
  return Math.min(150, Math.max(6, Math.round(raw)));
}

/**
 * Jednorazowa korekta doboru waypointów, gdy szacowany dystans rażąco odbiega od celu.
 * Gemini w trybie JSON (bez wyszukiwarki) dostaje obecną listę, szacunek i cel oraz
 * listę zweryfikowanych kandydatów OSM do dodania/wymiany.
 */
async function correctWaypointSelection(
  apiKey: string,
  currentNames: string[],
  estimatedKm: number,
  targetKm: number,
  candidates: { name: string; kind: string; score: number; distanceKm?: number }[],
  routeType: string
): Promise<string[] | null> {
  const ratio = estimatedKm / targetKm;
  const direction = estimatedKm > targetKm
    ? `ZA DŁUGA ${ratio.toFixed(1)}x — zamień najbardziej oddalone punkty na bliższe (nie usuwaj wszystkich naraz, celuj dokładnie w ${targetKm} km)`
    : `ZA KRÓTKA — dodaj kolejne punkty z listy, rozkładając je szerzej wokół trasy (celuj dokładnie w ${targetKm} km)`;
  const prompt = `Trasa (${routeType}) przez punkty:
${currentNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}
ma szacunkowo ${estimatedKm.toFixed(0)} km, a użytkownik chce ${targetKm} km. Trasa jest ${direction}.

Dostępne zweryfikowane punkty w okolicy (używaj DOKŁADNIE tych nazw):
${candidates.slice(0, 40).map((c) => `- "${c.name}" (${c.kind}${c.distanceKm != null ? `, ${c.distanceKm} km od startu` : ''})`).join('\n')}

ZASADY:
- Zachowaj pierwszy i ostatni punkt bez zmian.
- Zachowaj logiczną kolejność geograficzną (bez zawracania i krzyżowania się trasy).
- NIE przestrzel w drugą stronę: suma odległości między kolejnymi punktami ma wynieść ok. ${targetKm} km, a nie znacznie mniej.
- Jeśli trasa jest za długa, częściej pomaga zamiana odległego punktu na bliższy niż skasowanie kilku punktów.

Odpowiedz WYŁĄCZNIE obiektem JSON: {"waypoints": ["nazwa1", "nazwa2", ...]}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  if (!response.ok) throw new Error(`Gemini correction error ${response.status}`);
  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  return Array.isArray(parsed.waypoints) ? parsed.waypoints : null;
}

// Healthcheck
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '2.0.0', service: 'route-builder-api' });
});

// Get short description and recommendations for a waypoint/POI
app.post('/point-details', async (c) => {
  try {
    const { name, lat, lng } = await c.req.json() as { name: string, lat?: number, lng?: number };
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
      throw new Error("Gemini API error " + await response.text());
    }

    const data = await response.json() as any;
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (generatedText) {
      const cleanText = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const resultObj = JSON.parse(cleanText);
      return c.json(resultObj);
    }
    throw new Error("No text from Gemini");
  } catch (err: any) {
    console.error("Point details error:", err);
    return c.json({ error: err.message }, 500);
  }
});

app.use('/route-projects/*', authMiddleware);

// Listowanie projektów
app.get('/route-projects', async (c) => {
  const user = c.get('user');
  try {
    const projects = await repo.listProjects(user);
    return c.json(projects);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Chat AI Interview
app.post('/chat-interview', async (c) => {
  try {
    const { messages, project_id, input_notes, current_waypoints, vehicle_type, bike_subtype, routing_preference, trip_profile } = await c.req.json() as { 
      messages: {role: string, text: string}[], 
      project_id?: string, 
      input_notes?: string,
      current_waypoints?: {lat: number, lng: number}[],
      vehicle_type?: string,
      bike_subtype?: string,
      routing_preference?: string,
      trip_profile?: Record<string, any>
    };
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    let projectContext = '';
    if (project_id) {
      try {
        const project = await repo.getProject(project_id);
        if (project) {
          const isHikingOrCity = project.requirements.route_type === 'hiking' || project.requirements.route_type === 'city' || vehicle_type === 'hiking' || vehicle_type === 'city';
          projectContext = `\nAktualny stan projektu:
  Trasa: z ${project.requirements.start_point || '?'} do ${project.requirements.end_point || '?'}
  Typ: ${project.requirements.route_type || '?'}
  Dystans docelowy: ${isHikingOrCity ? 'NIE DOTYCZY (używamy Dni i Trudności)' : (project.requirements.distance_target_km || '?') + ' km'}`;
        }
      } catch (err) {
        console.warn('Could not fetch project for chat notes context', err);
      }
    }

    if (routing_preference) {
      const prefText = routing_preference === 'popular' ? 'KLASYKI REGIONU (wybieraj najbardziej znane, turystyczne, popularne i sprawdzone punkty)' : 'POZA UTARTYM SZLAKIEM (szukaj ukrytych perełek, unikaj tłumów, wybieraj boczne dróżki i dzikie zakątki)';
      projectContext += `\n\n[PREFERENCJA TRASY] Użytkownik wybrał styl: **${prefText}**. Dopasuj do tego swoje rekomendacje!`;
    }

    // Decyzje podjęte przez kliknięcie kart w poprzednich fazach — to ustalenia,
    // nie sugestie; agent nie ma o nie pytać drugi raz.
    if (trip_profile && Object.keys(trip_profile).length > 0) {
      const labels: Record<string, string> = {
        structure: 'Struktura wyjazdu',
        region: 'Wybrany rejon',
        difficulty: 'Trudność',
        pattern: 'Wzorzec trasy',
        accommodation: 'Nocleg',
        variant: 'Wybrany wariant'
      };
      const decided = Object.entries(trip_profile)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `- ${labels[k] || k}: **${v}**`)
        .join('\n');
      if (decided) {
        projectContext += `\n\n=== USTALENIA Z POPRZEDNICH FAZ (użytkownik już to wybrał — NIE PYTAJ PONOWNIE) ===\n${decided}`;
        if (trip_profile.structure === 'radial') {
          projectContext += `\nStruktura "radial" oznacza nocleg w bazie: zaplanuj kilka niezależnych jednodniowych pętli startujących i kończących się w miejscowości bazowej. Punkty trzymaj blisko bazy.`;
        } else if (trip_profile.structure === 'traverse') {
          projectContext += `\nStruktura "traverse" oznacza nocleg na trasie: zaplanuj JEDNĄ ciągłą trasę z dalekim punktem zwrotnym (główny cel pasma) i noclegiem w schronisku ok. półmetka. Powrót inną drogą niż dojście.`;
        }
      }
    }

    if (input_notes) {
      projectContext += `\n\n[KONTEKST UI] Notatki wpisane obok mapy przez użytkownika:\n"${input_notes}"\nUwzględnij je bezwzględnie!`;
    }

    if (current_waypoints && current_waypoints.length > 0) {
      projectContext += `\n\n[KONTEKST UI] Użytkownik postawił już na mapie ${current_waypoints.length} punkt(ów).`;
      
      try {
        const startWp = current_waypoints[0];
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${startWp.lat}&lon=${startWp.lng}&format=json`, {
          headers: { 'User-Agent': 'RouteMarketBuilderV3/1.0' }
        });
        if (res.ok) {
          const geocodeData = await res.json() as any;
          if (geocodeData && geocodeData.address) {
            const placeName = geocodeData.address.city || geocodeData.address.town || geocodeData.address.village || geocodeData.name || 'nieznane miejsce';
            projectContext += ` Zidentyfikowano ten punkt jako okolice: **${placeName}**. Użyj tego jako PUNKT STARTOWY. Nie pytaj już o miejsce startu!`;
          }
        }
      } catch (err) {
        console.warn("Reverse geocoding failed", err);
      }
    }
    
    if (vehicle_type) {
      const subtypeText = (vehicle_type === 'hiking' || vehicle_type === 'city') ? '' : (bike_subtype ? ` (typ: ${bike_subtype})` : '');
      projectContext += `\n\n[KONTEKST UI] Użytkownik ma zaznaczony typ pojazdu w aplikacji: **${vehicle_type}${subtypeText}**. Nie pytaj już o środek transportu!`;
    }

    const conversationText = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

    // Warstwa prawdy o POI: realne atrakcje z OSM wokół punktu startu.
    // Gemini wybiera z tej listy zamiast wymyślać nazwy — współrzędne bierzemy z OSM.
    // Centrum bierzemy z pinezki, a gdy jej nie ma (użytkownik podał start w czacie),
    // ustalamy je z treści rozmowy — inaczej cała warstwa POI by nie zadziałała.
    let poiCandidates: PoiCandidate[] = [];
    let poiMatchPool: PoiCandidate[] = [];
    const poiRouteType = vehicle_type === 'bicycle' ? (bike_subtype || 'cycling') : (vehicle_type || 'hiking');
    let poiCenter: { lat: number; lng: number } | null =
      current_waypoints && current_waypoints.length > 0
        ? { lat: current_waypoints[0].lat, lng: current_waypoints[0].lng }
        : null;
    let conversationDistanceKm: number | null = null;
    let conversationIsLoop = true;
    let conversationDays: number | null = null;

    if (messages.length > 0) {
      try {
        const extracted = await extractLocationFromConversation(GEMINI_API_KEY, conversationText, input_notes);
        conversationDistanceKm = extracted.distanceKm;
        conversationIsLoop = extracted.isLoop;
        conversationDays = extracted.days;
        if (!poiCenter && extracted.startPlace) {
          const startPlace = await geocodingService.geocodeSettlement(extracted.startPlace);
          poiCenter = { lat: startPlace.lat, lng: startPlace.lng };
          console.log(`[chat-interview] POI center from conversation: "${extracted.startPlace}" -> ${poiCenter.lat},${poiCenter.lng}`);
        }
      } catch (err) {
        console.warn('[chat-interview] Could not derive POI center from conversation:', err);
      }
    }

    const poiRadiusKm = poiRadiusForRoute(conversationDistanceKm, conversationIsLoop, conversationDays, trip_profile?.structure);
    if (poiCenter) {
      try {
        poiCandidates = await poiService.fetchCandidates(
          poiCenter,
          poiRouteType,
          poiRadiusKm ? { radiusKm: poiRadiusKm, limit: 45 } : { limit: 45 }
        );
        console.log(`[chat-interview] Loaded ${poiCandidates.length} OSM POI candidates (${poiRouteType}, radius ${poiRadiusKm || 'default'} km)`);
        // Do promptu idzie top 45, ale dopasowywać nazwy chcemy do pełnej puli —
        // punkt w rodzaju grani "Kępa" bywa poza czołówką rankingu, a to właśnie
        // jego współrzędne z OSM ratują go przed pomyłką geokodera.
        poiMatchPool = await poiService.fetchCandidates(
          poiCenter,
          poiRouteType,
          poiRadiusKm ? { radiusKm: poiRadiusKm, limit: 800 } : { limit: 800 }
        );
      } catch (err) {
        console.warn('[chat-interview] POI candidates fetch failed, continuing without:', err);
      }
    }
    if (poiCandidates.length > 0) {
      projectContext += poiService.buildPromptSection(poiCandidates, routing_preference);
      if (conversationDistanceKm && poiRadiusKm) {
        projectContext += `\n\n=== BUDŻET GEOGRAFICZNY (twarde ograniczenie) ===
Trasa ma mieć ok. ${conversationDistanceKm} km${conversationDays && conversationDays >= 2 ? ` i zająć ${conversationDays} dni` : conversationIsLoop ? ' i być PĘTLĄ' : ''}. Przy każdej atrakcji podana jest jej odległość od startu w linii prostej.
${conversationDays && conversationDays >= 2
  ? `Wędrówka ${conversationDays}-dniowa — turysta ma DOJŚĆ DO CELU, nie krążyć wokół startu:
- Główny cel (najważniejszy szczyt/obiekt pasma) powinien leżeć ok. ${poiRadiusKm} km od startu w linii prostej. Punkty w promieniu 2-3 km od startu to strata dnia — wybieraj je tylko jako początek i koniec trasy.
- Ułóż punkty jako ciąg: start → kolejne punkty w stronę celu → NOCLEG (schronisko) ok. połowy trasy → cel → powrót INNĄ drogą do startu.
- Suma odległości między kolejnymi punktami ma wynieść ok. ${conversationDistanceKm} km (${Math.round(conversationDistanceKm / conversationDays)} km na dzień).`
  : conversationIsLoop
  ? `Dla pętli tej długości:
- Najdalszy punkt może leżeć maksymalnie ok. ${poiRadiusKm} km od startu. Punkty położone dalej ROZSADZĄ dystans — nie wybieraj ich, nawet jeśli są klasykami.
- Punkty rozłóż DOOKOŁA startu, w różnych kierunkach (np. część na północ, część na wschód, część na południe), tak aby tworzyły pierścień. Nie wybieraj 5 punktów po jednej stronie — powstanie wtedy trasa "tam i z powrotem", o połowę za krótka.
- Wybierz 6-10 punktów: suma odległości między kolejnymi punktami (start → 1 → 2 → ... → start) ma wynosić ok. ${conversationDistanceKm} km.`
  : `Punkty rozłóż równomiernie wzdłuż kierunku przejazdu, do ok. ${poiRadiusKm} km od startu, tak aby suma odległości między kolejnymi punktami dała ok. ${conversationDistanceKm} km.`}`;
      }
    }

    // Determine what we already know from UI context
    const knowStart = current_waypoints && current_waypoints.length > 0;
    const knowVehicle = !!vehicle_type;
    const knownCount = [knowStart, knowVehicle].filter(Boolean).length;

    const prompt = `Jesteś ekspertem podróżniczym i licencjonowanym przewodnikiem Atlas Agent. Twoje zadanie: zebrać dane o trasie, zaplanować PRZEMYŚLANĄ, CIEKAWĄ i spójną geograficznie trasę, a następnie SZYBKO JĄ WYGENEROWAĆ.

${projectContext}

=== CO JUŻ WIEMY (z interfejsu, NIE pytaj o to!) ===
${knowStart ? '✅ PUNKT STARTOWY - znamy z pinezki na mapie' : '❌ Brak punktu startowego - zapytaj!'}
${knowVehicle ? `✅ POJAZD - ${vehicle_type}${(vehicle_type === 'hiking' || vehicle_type === 'city') ? '' : (bike_subtype ? ` (${bike_subtype})` : '')} - wybrane w interfejsie` : '❌ Brak pojazdu - zapytaj!'}
${routing_preference ? `✅ POPULARNOŚĆ - wybrano: ${routing_preference}` : '⚠️ Brak preferencji popularności - NIE pytaj o to osobno; zamiast tego niech Twoje warianty w fazie "variant_choice" różnią się charakterem (klasyki vs miejsca na uboczu), a użytkownik wybierze kartą.'}

=== JAK ZACHOWAĆ SIĘ W ZALEŻNOŚCI OD POPULARNOŚCI (BARDZO WAŻNE!) ===
Jeśli wybrano Klasyk ("popular"):
- Użyj wyszukiwarki Google, aby sprawdzić, jak przebiegają FAKTYCZNE, popularne i sprawdzone trasy polecane w internecie dla danego obszaru i pojazdu (blogi turystyczne, motocyklowe, rowerowe, portale) — wyszukiwarka służy do ustalenia LOGIKI i KOLEJNOŚCI trasy.
- Konkretne punkty trasy dobieraj z sekcji "ZWERYFIKOWANE ATRAKCJE W OKOLICY" (jeśli jest dostępna) — to są potwierdzone miejsca z dokładnymi współrzędnymi. Trasa ma prowadzić przez punkty oznaczone "KLASYK".
- NIE WYMYŚLAJ losowych punktów!

Jeśli wybrano Niszowa ("wild"):
- Omijaj zatłoczone, komercyjne i najbardziej oblegane punkty (oznaczone "KLASYK").
- Wybieraj z listy zweryfikowanych atrakcji miejsca mniej znane; wyszukiwarki Google użyj, by potwierdzić ich charakter i znaleźć logiczne połączenie w trasę.
- Skup się na pokazaniu unikalnego charakteru poza głównym szlakiem.

=== CZEGO JESZCZE BRAKUJE ===
Te informacje są potrzebne do wygenerowania trasy. NIE odpytuj z nich po kolei jak z ankiety — wplataj je w fazy rozmowy opisane niżej, a większość ustal sam na podstawie wybranego wariantu:
- Zależnie od POJAZDU:
  a) Dla "hiking" (pieszo) lub "city" (spacer miejski): potrzebna ILOŚĆ DNI i POZIOM TRUDNOŚCI. Jeśli dni nie padły — zapytaj. Trudności NIE pytaj osobno: wynika z wybranego wariantu (każdy wariant ma podaną trudność w "subtitle").
  b) Dla rowerów/motocykli/aut: potrzebny DYSTANS lub CZAS. Jeśli nie padł — zapytaj w fazie "discovery" razem z pytaniem o strukturę.
- PĘTLA czy LINIOWA — wynika z odpowiedzi na pytanie o strukturę w fazie "discovery", nie pytaj osobno.
- PREFERENCJE terenu — jeśli to gravel/mtb, nie pytaj, bo wiemy.
- POPULARNOŚĆ — nie pytaj osobno. Warianty w fazie "variant_choice" mają się różnić charakterem, w tym stopniem oblegania.

=== JAK PROWADZIĆ ROZMOWĘ: JESTEŚ DORADCĄ, NIE ANKIETĄ ===
Użytkownik często NIE ZNA terenu — może lecieć do Tirany i nie mieć pojęcia, co tam jest. Twoim zadaniem jest zrobić rozeznanie ZA NIEGO, pokazać możliwości i przeprowadzić go przez decyzje. Nigdy nie odpytuj go z parametrów technicznych, których nie ma jak znać.

Prowadzisz rozmowę w FAZACH. W każdej odpowiedzi zwracasz pole "phase" oraz — gdy dajesz wybór — tablicę "options" z konkretnymi kartami do kliknięcia.

FAZA 1 — "discovery" (otwarcie rozeznaniem, NIE pytaniem o parametry)
Masz miejscowość, czas i pojazd. Użyj wyszukiwarki Google, żeby dowiedzieć się, co realnie jest w zasięgu.
Zacznij od KONKRETU, który pokazuje, że znasz teren, a potem zadaj JEDNO pytanie rozstrzygające o STRUKTURĘ wyjazdu — bo ono przesądza kształt trasy:
- Wyjazd wielodniowy pieszo: "nocujesz w bazie i robisz wypady, czy śpisz na trasie (schroniska)?"
  → baza = kilka niezależnych jednodniowych pętli; schroniska = jedna ciągła trasa z dalekim punktem zwrotnym. To ZUPEŁNIE inne trasy.
- Motocykl/rower/auto: "wracasz na noc do bazy, czy jedziesz w jedną stronę?"
- Wyjazd jednodniowy: pomiń tę fazę i przejdź od razu do FAZY 2.
Podaj to jako "options" z 2 kartami.

FAZA 2 — "variant_choice" (ZAWSZE 2-4 NAZWANE warianty tematyczne — nigdy jeden!)
Na podstawie rozeznania i listy zweryfikowanych atrakcji zaproponuj konkretne, różniące się charakterem warianty. To najważniejszy moment rozmowy.
Każdy wariant MUSI mieć WSZYSTKIE cztery pola wypełnione:
- "title" — nazwa własna mówiąca, dokąd się idzie/jedzie (np. "Grzbietem Karkonoszy na Śnieżkę", a nie "Wariant A")
- "subtitle" — POLE OBOWIĄZKOWE, same twarde liczby oddzielone znakiem •, dokładnie w formacie:
  "<dystans> km • +<przewyższenie> m • <trudność>"   np. "22 km • +900 m • umiarkowana"
  (dla tras wielodniowych podaj dystans dzienny, np. "25 km/dzień • +1400 m • wymagająca")
  NIGDY nie zostawiaj tego pola pustego ani nie wpisuj tam opisu słownego.
- "description" — jedno zdanie: co zobaczysz i jaki jest charakter (ruch turystyczny, nawierzchnia, trudność)
- "highlights" — 3-5 NAZW WŁASNYCH MIEJSC na tej trasie (szczyty, schroniska, wodospady, przełęcze, miejscowości).
  DOBRZE: ["Skrzyczne", "Hala Jaworzyna", "Schronisko na Klimczoku", "Szyndzielnia"]
  ŹLE: ["klasyczna", "jednodniowa", "pętla", "malownicze tereny"] — to są przymiotniki i opisy, a nie miejsca. Takie wartości są błędem.
Warianty mają się RÓŻNIĆ kierunkiem lub charakterem (inne pasmo, grzbiet vs doliny, klasyki vs miejsca na uboczu), a nie być wariacjami tego samego.
MINIMUM DWA WARIANTY — podanie jednej propozycji to błąd, bo użytkownik nie ma wtedy czego wybierać. Jeśli region wydaje się oczywisty, i tak pokaż wariant alternatywny (np. krótszy/łatwiejszy, inne pasmo, albo ten sam kierunek w odwrotną stronę).
CEL WĘDRÓWKI: przy wyjeździe wielodniowym co najmniej jeden wariant MUSI prowadzić do najważniejszego obiektu pasma (najwyższy szczyt, główna atrakcja), nawet jeśli leży 20 km od startu. Wariant kręcący się w promieniu kilku kilometrów od bazy jest do przyjęcia tylko przy noclegu w bazie (structure: radial).

FAZA 3 — "refine" (1-2 dopytania istotne dla wybranego wariantu)
Po wyborze wariantu dopytaj o rzeczy, które faktycznie zmieniają trasę — np. konkretne schronisko na nocleg, czy zahaczyć o sąsiedni kraj, czy dołożyć dodatkową atrakcję po drodze. Podaj jako "options", zawsze zostawiając możliwość wpisania czegoś od siebie.

FAZA 4 — "confirm" (podsumowanie do zatwierdzenia)
Streść plan w 1-2 zdaniach z konkretami (dokąd, przez co, ile km, gdzie nocleg) i zapytaj, czy generować.

FAZA 5 — generowanie: done: true, pełna lista "add_waypoints".

=== POZOSTAŁE ZASADY ===
1. NIGDY NIE GENERUJ TRASY W PIERWSZEJ ODPOWIEDZI (zasada nadrzędna):
Podanie miejscowości, liczby dni czy dystansu to NORMALNY początek rozmowy, a NIE prośba o natychmiastową trasę. Na wiadomość w stylu "Szczyrk, 1 dzień, umiarkowana pętla" masz odpowiedzieć fazą "discovery" lub "variant_choice" z kartami — nigdy gotową trasą. Użytkownik chce najpierw ZOBACZYĆ MOŻLIWOŚCI.

SKRÓT DLA ZNAWCÓW — wyłącznie w dwóch przypadkach:
  a) użytkownik napisał wprost polecenie generowania: "generuj", "rób", "nie pytaj", "bez pytań", "od razu";
  b) użytkownik sam wymienił KONKRETNE PUNKTY trasy, przez które chce iść/jechać (np. "chcę przez Skrzyczne, Malinowską Skałę i Klimczok") — wtedy nie ma czego wybierać.
Sama nazwa miejscowości, liczba dni, dystans, trudność ani typ pojazdu NIE są takim sygnałem.
2. Jeśli użytkownik nie był zadowolony z trasy i mówi "nie podoba mi się" / "przebuduj" / "inaczej" → WYGENERUJ NATYCHMIAST nową trasę (done: true) ze zmienionymi punktami.
3. Zadawaj JEDNO pytanie naraz, max 2-3 zdania tekstu. Konkrety wrzucaj w "options", nie w ścianę tekstu.
4. UKRYTY DYSTANS: dla trasy pieszej/miejskiej (hiking/city) przy done: true wylicz sumaryczny dystans z liczby dni i trudności:
   - Lekki: 15 km/dzień (np. 3 dni = 45)
   - Umiarkowany: 20 km/dzień (np. 3 dni = 60)
   - Wymagający: 25 km/dzień (np. 3 dni = 75)
   Wpisz go jako liczbę w polu "distance", a liczbę dni w polu "days".
5. KOLEJNOŚĆ PUNKTÓW (BARDZO WAŻNE!): Zwrócona tablica \`suggested_waypoints\` MUSI być ułożona w logicznej, geograficznej kolejności, tworząc płynną ścieżkę lub pętlę BEZ KRZYŻOWANIA SIĘ (tzw. pajęczyn). Upewnij się, że punkty następują po sobie chronologicznie w taki sposób, jak przebiegałaby prawdziwa podróż.


=== ZASADY SELEKCJI PUNKTÓW (JAKOŚĆ I LOGIKA) ===
Nie wybieraj przypadkowych punktów geometrycznych ani losowych małych wsi bez znaczenia turystycznego! Zamiast tego dobieraj punkty reprezentujące rzeczywiste atrakcje, walory przyrodnicze lub znane szlaki dla danego pojazdu:

1. pieszo (hiking / route_type = hiking):
   - Szukaj: szczytów, przełęczy, schronisk turystycznych, wodospadów, formacji skalnych, polan leśnych, rezerwatów przyrody.
   - BEZWZGLĘDNY zakaz prowadzenia tras po miastach i drogach asfaltowych (poza punktem startu/mety).
   - PRZYKŁAD (Karkonosze z Karpacza): ["Karpacz, Świątynia Wang", "Schronisko Samotnia, Karpacz", "Schronisko Strzecha Akademicka, Karpacz", "Śnieżka, Karkonosze", "Schronisko nad Łomniczką, Karpacz", "Karpacz"]

   WĘDRÓWKA WIELODNIOWA (2+ dni) — TO NIE JEST DUŻA PĘTLA WOKÓŁ MIEJSCOWOŚCI!
   Turysta idzie DOKĄDŚ: zdobywa główny cel pasma i nocuje po drodze w schronisku. Kręcenie się w promieniu kilku kilometrów od startu to najgorszy możliwy wynik.
   Obowiązkowy schemat:
   a) Wyznacz GŁÓWNY CEL wędrówki — najważniejszy szczyt/obiekt pasma, nawet jeśli leży 20-25 km od startu (np. ze Szklarskiej Poręby celem jest Śnieżka, nie okoliczne wodospady).
   b) Dzień 1: dojście do celu jedną drogą — dla pasm górskich prowadź GRZBIETEM (najlepsze widoki).
   c) NOCLEG: wskaż konkretne schronisko możliwie blisko półmetka trasy — to osobny punkt w "add_waypoints".
   d) Dzień 2: powrót INNĄ drogą niż dzień 1 — typowo niżej, pod reglami/doliną. Powrót tą samą ścieżką jest błędem.
   - PRZYKŁAD (Karkonosze, 2 dni ze Szklarskiej Poręby): ["Szklarska Poręba", "Wodospad Kamieńczyka, Szklarska Poręba", "Szrenica, Karkonosze", "Śnieżne Kotły, Karkonosze", "Schronisko Dom Śląski, Karkonosze", "Śnieżka, Karkonosze", "Przełęcz Okraj, Karkonosze", "Jagniątków", "Szklarska Poręba"]
     (dzień 1 grzbietem przez Szrenicę na Śnieżkę z noclegiem, dzień 2 powrót niżej)

2. rower szutrowy/MTB (gravel/mtb / route_type = gravel):
   - Szukaj: dróg pożarowych/leśnych, dróg szutrowych, grobli między stawami (np. Stawy Milickie), punktów widokowych, wiat turystycznych, jezior, rzek.
   - Unikaj ruchliwych dróg krajowych (np. DK15, DK5 itp.) oraz bardzo trudnych technicznie szlaków pieszych (gdzie rower trzeba nieść).
   - PRZYKŁAD (Stawy Milickie z Milicza): ["Milicz", "Stawy Milickie (Dyminy), Milicz", "Sułów (ścieżka rowerowa), Milicz", "Jaz Grabownica, Milicz", "Ostoja Konika Polskiego, Grabownica", "Milicz"]
   
3. rower szosowy (road / route_type = cycling):
   - Szukaj: bocznych, mało ruchliwych dróg asfaltowych o dobrej nawierzchni, przełęczy drogowych, urokliwych małych miasteczek.
   - BEZWZGLĘDNY zakaz wprowadzania dróg szutrowych/piaskowych.
   
4. motocykl (motorcycle / route_type = motorcycle):
   - Szukaj: krętych, malowniczych szos (np. "Droga Stu Zakrętów", przełęcze górskie, serpentyny), zamków, zapór wodnych, jezior.
   - BEZWZGLĘDNY zakaz dróg gruntowych i piaszczystych.
   
5. spacer miejski (city_walk / route_type = city_walk):
   - Szukaj: rynków, zabytków architektonicznych, parków miejskich, tarasów widokowych, bulwarów, znanych kawiarni.
   - BARDZO WAŻNE: Pilnuj dystansu! Jeśli użytkownik poprosił o wycieczkę "1 dniową", to trasa z samego ścisłego centrum (np. Rynek -> Ratusz -> Most) będzie miała zaledwie 3-4 kilometry! Aby ułożyć pełnowymiarową trasę na cały dzień (ok 15 km), MUSISZ rozciągnąć wycieczkę, dodając klasyki również z bardziej oddalonych dzielnic (np. we Wrocławiu koniecznie dodaj Halę Stulecia i ZOO, które są daleko od Rynku). Używaj rozumu przestrzennego.
   
=== WAŻNE: FORMATOWANIE PUNKTÓW DLA GEOKODERA ===
Aby geokoder bezbłędnie zlokalizował punkty pośrednie, każdy punkt w tablicy "add_waypoints" MUSI być podany w formacie:
"NAZWA ATRAKCJI/PUNKTU, NAJBLIŻSZA MIEJSCOWOŚĆ" (np. "Schronisko Odrodzenie, Karkonosze", "Wodospad Szklarki, Szklarska Poręba", "Zamek Chojnik, Jelenia Góra", "Postolin (wieża widokowa), Milicz").
Unikaj podawania samych gołych, pospolitych nazw typu "Stawno" czy "Laskowa", bo geokoder znajdzie je w innej części Polski! Zawsze dodawaj kontekst geograficzny (np. "Stawno, Milicz" lub "Laskowa, Milicz").

KRYTYCZNE — NAZWY MIEJSCOWE, NIE POLSKIE TŁUMACZENIA:
Geokoder korzysta z OpenStreetMap, gdzie miejsca zapisane są w języku KRAJU, w którym leżą.
- Używaj oryginalnej pisowni: "Červenohorské sedlo", "Vrbno pod Pradědem", "Praděd" (NIE "Pradziad").
- Jako kontekst po przecinku podawaj REALNĄ pobliską miejscowość, nigdy polski egzonim pasma górskiego.
  ŹLE: "Vidly, Jesioniki", "Rejvíz, Jesioniki" (nazwa "Jesioniki" nie istnieje w OpenStreetMap → punkt przepada).
  DOBRZE: "Vidly, Vrbno pod Pradědem", "Rejvíz, Zlaté Hory".
- Ta sama zasada dotyczy każdego kraju: "Kruja Castle, Krujë" (nie "Kruja, Albania Środkowa").

=== ZASADY TWORZENIA PĘTLI ===
Dla PĘTLI (loop: true):
- Pętla MUSI być OKRĘGIEM na mapie, nie linią tam i z powrotem!
- Strategia: wyjeżdżamy z punktu A w jednym kierunku (np. na północ), okrążamy teren przez ciekawe atrakcje i wracamy z przeciwnej strony (np. od południa).
- Minimum 6-10 bogatych w atrakcje punktów pośrednich, aby ORS (routing) mógł wytyczyć idealny krąg. Pierwszy i ostatni element w "add_waypoints" muszą być takie same.

Dla TRASY LINIOWEJ (loop: false):
- Start → ciekawe punkty po drodze → meta. Minimum 5 punktów na 20km.

Oto historia czatu:
${conversationText}

Odpowiedz WYŁĄCZNIE W FORMACIE JSON (bez markdown, czysty JSON):

Przykład 1 — FAZA "discovery": otwierasz rozeznaniem i pytasz o strukturę wyjazdu:
{
  "done": false,
  "phase": "discovery",
  "reply": "Szklarska Poręba to świetna baza — w 2 dni masz w zasięgu główny grzbiet Karkonoszy ze Śnieżką albo spokojniejsze Góry Izerskie. Najpierw jedna rzecz, bo przesądza kształt trasy: nocujesz w Szklarskiej, czy śpisz na trasie?",
  "options": [
    {
      "id": "base",
      "title": "Baza w Szklarskiej Porębie",
      "subtitle": "2 × jednodniowa pętla",
      "description": "Co wieczór wracasz do miasta, idziesz z lekkim plecakiem. Zasięg ok. 10 km od miasta.",
      "implies": { "structure": "radial" }
    },
    {
      "id": "huts",
      "title": "Nocleg w schronisku na trasie",
      "subtitle": "jedna ciągła trasa 2-dniowa",
      "description": "Pełny plecak, ale otwiera się cały grzbiet aż po Śnieżkę (22 km od startu).",
      "implies": { "structure": "traverse" }
    }
  ],
  "allow_custom": true
}

Przykład 2 — FAZA "variant_choice": nazwane warianty z twardymi liczbami:
{
  "done": false,
  "phase": "variant_choice",
  "reply": "Świetnie — nocleg na trasie otwiera Ci Śnieżkę. Mam dwa pomysły o różnym charakterze:",
  "options": [
    {
      "id": "ridge",
      "title": "Grzbietem Karkonoszy na Śnieżkę",
      "subtitle": "25 km/dzień • +1400 m • wymagająca",
      "description": "Klasyka: dzień 1 grzbietem przez Szrenicę i Śnieżne Kotły, nocleg w Domu Śląskim, dzień 2 powrót niżej pod reglami. Najlepsze widoki w Sudetach, ale w sezonie tłoczno.",
      "highlights": ["Wodospad Kamieńczyka", "Szrenica", "Śnieżne Kotły", "Śnieżka"],
      "implies": { "region": "Karkonosze", "difficulty": "hard", "pattern": "ridge_out_valley_back" }
    },
    {
      "id": "izery",
      "title": "Torfowiska Gór Izerskich",
      "subtitle": "20 km/dzień • +600 m • umiarkowana",
      "description": "Łagodniejsze podejścia, hale i torfowiska wysokie, nocleg w Chatce Górzystów. Zdecydowanie spokojniej niż na grzbiecie Karkonoszy.",
      "highlights": ["Hala Izerska", "Stóg Izerski", "Torfowiska Izerskie"],
      "implies": { "region": "Góry Izerskie", "difficulty": "moderate", "pattern": "loop" }
    }
  ],
  "allow_custom": true
}

Przykład 3 — FAZA "refine": dopytanie istotne dla wybranego wariantu:
{
  "done": false,
  "phase": "refine",
  "reply": "Gdzie wolisz nocleg na półmetku?",
  "options": [
    { "id": "dom_slaski", "title": "Dom Śląski", "subtitle": "tuż pod Śnieżką, 1400 m", "description": "Najwyżej, krótkie podejście na szczyt o wschodzie słońca." },
    { "id": "odrodzenie", "title": "Schronisko Odrodzenie", "subtitle": "Przełęcz Karkonoska, 1237 m", "description": "Bliżej półmetka, równiej rozkłada oba dni." }
  ],
  "allow_custom": true
}

Przykład 4 — FAZA "confirm": podsumowanie do zatwierdzenia:
{
  "done": false,
  "phase": "confirm",
  "reply": "Plan: 2 dni ze Szklarskiej Poręby, dzień 1 grzbietem przez Szrenicę i Śnieżne Kotły na Śnieżkę z noclegiem w Domu Śląskim, dzień 2 powrót pod reglami. Około 50 km. Generuję?",
  "options": [
    { "id": "go", "title": "Generuj trasę", "subtitle": "", "description": "" },
    { "id": "change", "title": "Chcę coś zmienić", "subtitle": "", "description": "" }
  ],
  "allow_custom": true
}

Przykład 5 — użytkownik zatwierdził → generujesz trasę (done: true):
{
  "done": true,
  "phase": "generate",
  "reply": "Proszę bardzo! Dzień 1 grzbietem na Śnieżkę z noclegiem w Domu Śląskim, dzień 2 powrót pod reglami. Sprawdź mapę!",
  "add_waypoints": ["Szklarska Poręba", "Wodospad Kamieńczyka, Szklarska Poręba", "Szrenica, Karkonosze", "Śnieżne Kotły, Karkonosze", "Schronisko Dom Śląski, Karkonosze", "Śnieżka, Karkonosze", "Jagniątków", "Szklarska Poręba"],
  "extracted": {
    "start_point": "Szklarska Poręba",
    "end_point": "Szklarska Poręba",
    "route_type": "hiking",
    "distance": "50",
    "days": 2,
    "intent": "2 dni grzbietem Karkonoszy na Śnieżkę, nocleg w schronisku, powrót pod reglami",
    "loop": true,
    "key_waypoints": ["Szrenica, Karkonosze", "Śnieżka, Karkonosze", "Schronisko Dom Śląski, Karkonosze"]
  }
}`;

    // === ETAP 1: Gemini z Google Search (tekst, bez wymuszenia JSON) ===
    const searchResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }]
      })
    });

    if (!searchResponse.ok) {
      throw new Error("Gemini Search API error " + await searchResponse.text());
    }

    const searchData = await searchResponse.json() as any;
    const rawText = searchData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log("[chat-interview] Gemini raw response (first 500 chars):", rawText.substring(0, 500));

    // Etap 1 zwykle zwraca już gotowy JSON (opakowany w ```json). Jeśli da się go
    // sparsować, druga tura jest zbędna — a była ryzykowna: gubiła punkty trasy,
    // podwajała czas odpowiedzi i przy kartach wyboru potrafiła wpaść w pętlę
    // generowania (138 tys. znaków uciętych w połowie = zerwana rozmowa).
    let directResult: any = null;
    try {
      const stripped = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      if (stripped.startsWith('{')) {
        const parsed = JSON.parse(stripped);
        if (parsed && typeof parsed.reply === 'string') {
          directResult = parsed;
          console.log('[chat-interview] Stage 1 output parsed directly, skipping conversion pass.');
        }
      }
    } catch {
      // Niepoprawny JSON z etapu 1 — schodzimy do konwersji poniżej
    }

    // === ETAP 2 (fallback): Konwersja tekstu na czysty JSON (bez narzedzi, z wymuszeniem JSON) ===
    const jsonPrompt = directResult ? '' : `Przekonwertuj ponizszy tekst na CZYSTY obiekt JSON. Nie dodawaj zadnych komentarzy.
Tekst do konwersji:
---
${rawText}
---

Zwroc DOKLADNIE obiekt JSON z polami:
- "done": boolean (true jesli agent zakonczyl zbieranie danych i podaje trase, false jesli jeszcze pyta)
- "phase": string (jedna z: discovery, variant_choice, refine, confirm, generate)
- "reply": string (odpowiedz agenta po polsku)
- "options": tablica kart wyboru, kazda z polami id, title, subtitle, description, highlights (tablica stringow), implies (obiekt) — TYLKO gdy tekst przedstawia warianty do wyboru
- "allow_custom": boolean (czy uzytkownik moze wpisac wlasna odpowiedz zamiast wybrac karte)
- "add_waypoints": tablica stringow z nazwami punktow (TYLKO gdy done=true)
- "extracted": obiekt z polami start_point, end_point, route_type, distance, days, intent, loop, key_waypoints (TYLKO gdy done=true)

Jesli tekst zawiera pytanie do uzytkownika, ustaw done=false.
Jesli tekst przedstawia warianty/opcje do wyboru (wyliczenie z nazwami, liczbami, opisami) — KONIECZNIE przenies je do tablicy "options" jako osobne karty, a w "reply" zostaw samo zdanie wprowadzajace. Nie zostawiaj wariantow jako wypunktowania w tekscie reply.
Jesli tekst zawiera gotowa trase z punktami, ustaw done=true i wypelnij add_waypoints i extracted.
WAZNE: nazwy punktow w add_waypoints kopiuj DOKLADNIE, znak w znak, tak jak wystepuja w tekscie zrodlowym (z polskimi znakami). Nie skracaj, nie parafrazuj, nie pomijaj zadnego punktu z tekstu.`;

    let generatedText: string | null = null;
    if (!directResult) {
      const jsonResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: jsonPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            // Schemat zamiast polegania na dyscyplinie modelu — przy zagnieżdżonych
            // kartach wyboru swobodne generowanie JSON-a potrafiło zwrócić składnię
            // nie do sparsowania i wywalić całą rozmowę.
            responseSchema: CHAT_RESPONSE_SCHEMA,
            // Twardy limit: bez niego model potrafił wpaść w pętlę i wygenerować
            // 138 tys. znaków uciętych w połowie.
            maxOutputTokens: 8192
          }
        })
      });

      if (!jsonResponse.ok) {
        throw new Error("Gemini JSON API error " + await jsonResponse.text());
      }

      const jsonData = await jsonResponse.json() as any;
      generatedText = jsonData.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    if (directResult || generatedText) {
      const resultObj = directResult
        ? directResult
        : JSON.parse((generatedText as string).replace(/```json/g, '').replace(/```/g, '').trim());
      
      // Jeśli agent zasugerował dodanie waypointów, geokodujemy je przed zwróceniem na frontend
      if (resultObj.add_waypoints && Array.isArray(resultObj.add_waypoints)) {
        const suggested_waypoints = [];
        // poiCenter to pinezka z mapy albo start ustalony z rozmowy — w obu przypadkach
        // najlepszy punkt odniesienia dla geokodera.
        let biasPoint: {lat: number, lng: number} | undefined = poiCenter || undefined;

        // Jeśli nie mamy biasPoint z UI, spróbujmy geokodować pierwszy sugerowany punkt bez biasu i użyć go jako bias
        if (!biasPoint && resultObj.add_waypoints.length > 0) {
          try {
            const firstPlace = await geocodingService.geocodeSinglePoint(resultObj.add_waypoints[0]);
            if (firstPlace) {
              biasPoint = { lat: firstPlace.lat, lng: firstPlace.lng };
            }
          } catch (e) {
            console.error("Geocoding failed for initial bias point:", resultObj.add_waypoints[0], e);
          }
        }

        const failed_waypoints: string[] = [];
        for (const placeName of resultObj.add_waypoints) {
          // Najpierw dopasowanie do zweryfikowanych POI z OSM — dokładne współrzędne bez geokodera
          const matched = poiService.matchCandidate(placeName, poiMatchPool);
          if (matched) {
            suggested_waypoints.push({ lat: matched.lat, lng: matched.lng, name: placeName });
            if (!biasPoint) biasPoint = { lat: matched.lat, lng: matched.lng };
            continue;
          }
          try {
            const place = await geocodingService.geocodeSinglePoint(placeName, biasPoint);
            if (place) {
              suggested_waypoints.push({
                lat: place.lat,
                lng: place.lng,
                name: placeName
              });
              // Aktualizujemy biasPoint na ostatnio znaleziony punkt, by kolejne punkty pętli były blisko siebie
              if (!biasPoint) {
                biasPoint = { lat: place.lat, lng: place.lng };
              }
            }
          } catch (e) {
            console.error("Geocoding failed for place:", placeName, e);
            failed_waypoints.push(placeName);
          }
        }
        // Walidacja 1: odrzuć punkty absurdalnie oddalone od startu (pomyłki geokodera)
        const routeTypeForValidation = resultObj.extracted?.route_type || (vehicle_type === 'bicycle' ? (bike_subtype || 'cycling') : (vehicle_type || 'hiking'));
        let finalWaypoints = suggested_waypoints;
        if (suggested_waypoints.length > 1) {
          const { kept, dropped } = routeValidatorService.filterOutliers(
            suggested_waypoints[0],
            suggested_waypoints,
            routeTypeForValidation
          );
          if (dropped.length > 0) {
            console.warn('[chat-interview] Dropped outlier waypoints:', dropped.map((d: any) => d.name));
            failed_waypoints.push(...dropped.map((d: any) => `${d.name} (znaleziono w złym regionie)`));
            finalWaypoints = kept;
          }
        }

        // Walidacja 2: szacowany dystans łańcucha punktów vs cel — przy rażącej
        // rozbieżności jedna automatyczna korekta doboru punktów przez Gemini
        const targetKm = Number(resultObj.extracted?.distance) || conversationDistanceKm || null;
        // Front potrzebuje celu, żeby przy przeliczaniu trasy uruchomić kontrolę dystansu
        if (targetKm) resultObj.distance_target_km = targetKm;
        // Korekta na podstawie REALNEGO dystansu po drogach, nie szacunku z linii
        // prostych — ten w terenie górskim mylił się o kilkadziesiąt procent i korekta
        // w ogóle się nie uruchamiała. Kosztuje to jedno dodatkowe zapytanie do routingu.
        const measureRouteKm = async (wps: any[]): Promise<number | null> => {
          try {
            const measured = await routingService.getRoute(
              wps.map((w: any) => ({ name: w.name, lat: w.lat, lng: w.lng })) as any,
              routeTypeForValidation
            );
            return measured.distance_km;
          } catch (err: any) {
            console.warn(`[chat-interview] Could not measure route distance: ${err.message}`);
            return null;
          }
        };

        if (targetKm && finalWaypoints.length >= 3 && poiCandidates.length > 0) {
          for (let pass = 0; pass < 2; pass++) {
            const measuredKm = await measureRouteKm(finalWaypoints);
            const estimatedKm = measuredKm ?? routeValidatorService.estimateChainKm(finalWaypoints, routeTypeForValidation);
            const deviation = Math.abs(estimatedKm - targetKm) / targetKm;
            if (deviation <= 0.25) {
              if (pass > 0) console.log(`[chat-interview] Route within tolerance: ${estimatedKm.toFixed(1)} km (target ${targetKm} km).`);
              break;
            }

            console.warn(`[chat-interview] Distance mismatch (pass ${pass + 1}): ${measuredKm ? 'routed' : 'estimated'} ${estimatedKm.toFixed(1)} km vs target ${targetKm} km. Requesting correction...`);
            try {
              const corrected = await correctWaypointSelection(
                GEMINI_API_KEY, finalWaypoints.map((w: any) => w.name), estimatedKm, targetKm, poiCandidates, routeTypeForValidation
              );
              if (!corrected || corrected.length < 2) break;

              const rebuilt: any[] = [];
              for (const name of corrected) {
                const matched = poiService.matchCandidate(name, poiMatchPool);
                if (matched) {
                  rebuilt.push({ lat: matched.lat, lng: matched.lng, name });
                  continue;
                }
                const prev = finalWaypoints.find((w: any) => w.name === name);
                if (prev) {
                  rebuilt.push(prev);
                  continue;
                }
                try {
                  const place = await geocodingService.geocodeSinglePoint(name, biasPoint);
                  if (place) rebuilt.push({ lat: place.lat, lng: place.lng, name });
                } catch { /* pomijamy niegeokodowalne punkty korekty */ }
              }
              if (rebuilt.length < 2) break;

              const newEstimate = (await measureRouteKm(rebuilt)) ?? routeValidatorService.estimateChainKm(rebuilt, routeTypeForValidation);
              const oldDev = (estimatedKm - targetKm) / targetKm;
              const newDev = (newEstimate - targetKm) / targetKm;
              // Model potrafi wyciąć za dużo punktów naraz i przestrzelić w drugą stronę
              // (np. 160 km -> 40 km przy celu 90). Taka "poprawka" jest odrzucana.
              const overshot = Math.sign(newDev) !== Math.sign(oldDev) && Math.abs(newDev) > 0.25;
              if (Math.abs(newDev) >= Math.abs(oldDev) || overshot) {
                console.log(`[chat-interview] Correction rejected (${newEstimate.toFixed(1)} km vs ${estimatedKm.toFixed(1)} km, target ${targetKm} km).`);
                break;
              }
              console.log(`[chat-interview] Correction accepted: ${newEstimate.toFixed(1)} km (was ${estimatedKm.toFixed(1)} km)`);
              finalWaypoints = rebuilt;
            } catch (corrErr) {
              console.warn('[chat-interview] Waypoint correction failed, keeping original:', corrErr);
              break;
            }
          }
        }

        resultObj.suggested_waypoints = finalWaypoints;
        if (failed_waypoints.length > 0) {
          // Nie gubimy punktów po cichu — informujemy użytkownika, których miejsc nie udało się zlokalizować
          resultObj.failed_waypoints = failed_waypoints;
          resultObj.reply = `${resultObj.reply}\n\n⚠️ Nie udało się zlokalizować: ${failed_waypoints.join(', ')}. Trasa została wyznaczona bez tych punktów.`;
        }
      }

      return c.json(resultObj);
    }
    throw new Error("No text from Gemini");
  } catch (err: any) {
    console.error("Chat interview error:", err);
    return c.json({ error: err.message }, 500);
  }
});

// Tworzenie projektu
app.post('/route-projects', zValidator('json', RouteRequirementsSchema), async (c) => {
  const reqs = c.req.valid('json');
  const userId = c.get('userId');
  try {
    let start_point = reqs.start_point;
    let region = reqs.region;
    let distance_target_km = reqs.distance_target_km;
    let difficulty = reqs.difficulty;
    let duration_pref: 'short' | 'long' | null = null;

    // Jeżeli mamy notatki użytkownika lub źródła, wyciągamy z nich szczegóły AI:
    const hasSources = reqs.input_notes || (reqs.source_links && reqs.source_links.length > 0) || (reqs.source_files && reqs.source_files.length > 0);
    if (hasSources) {
      console.log(`[API] Extracting AI details from user notes and sources...`);
      const extracted = await reportService.extractStartPointAndRegion(reqs.input_notes || '', reqs.source_links || [], reqs.source_files || []);
      
      start_point = extracted.start_point || start_point;
      region = extracted.region || region;
      distance_target_km = extracted.distance_target_km || distance_target_km;
      difficulty = extracted.difficulty || difficulty;
      duration_pref = extracted.duration_pref || null;
      
      console.log(`[API] Extracted: Start="${start_point}", Region="${region}", Distance=${distance_target_km}, Difficulty=${difficulty}, Duration=${duration_pref}`);
    } else {
      start_point = start_point || 'Zakopane';
      region = region || 'Tatry i Podhale';
    }

    const project = await repo.createProject({
      ...reqs,
      start_point,
      region,
      distance_target_km,
      difficulty
    }, userId);

    return c.json({
      ...project,
      ai_extracted_meta: {
        distance_target_km,
        difficulty,
        duration_pref
      }
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Pobieranie projektu
app.get('/route-projects/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const project = await repo.getProject(id);
  if (!project) return c.json({ error: 'Not found' }, 404);
  if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);
  return c.json(project);
});

// Aktualizacja projektu
app.patch('/route-projects/:id', zValidator('json', RouteRequirementsSchema.partial()), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const updates = c.req.valid('json');
  try {
    const project = await repo.getProject(id);
    if (!project) return c.json({ error: 'Not found' }, 404);
    if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);
    
    const updated = await repo.updateProject(id, {
      ...project.requirements,
      ...updates
    });
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Pobieranie artefaktów projektu
app.get('/route-projects/:id/artifacts', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  try {
    const project = await repo.getProject(id);
    if (!project) return c.json({ error: 'Not found' }, 404);
    if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);

    const artifacts = await repo.getArtifacts(id);
    return c.json(artifacts);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Pobieranie konkretnego artefaktu
app.get('/route-projects/:id/artifacts/:type', async (c) => {
  const id = c.req.param('id');
  const type = c.req.param('type');
  const user = c.get('user');
  try {
    const project = await repo.getProject(id);
    if (!project) return c.json({ error: 'Not found' }, 404);
    if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);

    const artifact = await repo.getArtifactByType(id, type);
    if (!artifact) return c.json({ error: 'Artifact not found' }, 404);
    return c.json(artifact);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Pobieranie pliku GPX
app.get('/route-projects/:id/gpx', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  try {
    const project = await repo.getProject(id);
    if (!project) return c.json({ error: 'Not found' }, 404);
    if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);

    const artifact = await repo.getArtifactByType(id, 'gpx');
    if (!artifact || !artifact.raw_data) return c.json({ error: 'GPX not found' }, 404);
    
    c.header('Content-Type', 'application/gpx+xml');
    c.header('Content-Disposition', `attachment; filename="route-${id}.gpx"`);
    return c.body(artifact.raw_data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Wgrywanie pliku GPX
app.post('/route-projects/:id/gpx', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const project = await repo.getProject(projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);

  const gpxText = await c.req.text();
  
  try {
    const { trackPoints, distance_km, name } = gpxParserService.parseGpx(gpxText);
    
    if (trackPoints.length < 2) {
      return c.json({ error: 'Za mało punktów w pliku GPX (min. 2)' }, 400);
    }

    const summary = {
      distance_km,
      duration_h: parseFloat((distance_km / 15).toFixed(2)),
      points_count: trackPoints.length,
      track: trackPoints
    };

    await repo.upsertArtifact(projectId, 'gpx', { raw_data: gpxText });
    await repo.upsertArtifact(projectId, 'summary', { content: summary });

    await repo.updateProject(projectId, {
      ...project.requirements,
      distance_target_km: distance_km,
      start_point: name
    });

    return c.json(summary);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Wybór alternatywnego wariantu trasy
app.post('/route-projects/:id/select-alternative', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const { variantId } = await c.req.json() as { variantId: string };

  try {
    const project = await repo.getProject(projectId);
    if (!project) return c.json({ error: 'Project not found' }, 404);
    if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);

    const altsArtifact = await repo.getArtifactByType(projectId, 'alternatives');
    if (!altsArtifact || !altsArtifact.content) {
      return c.json({ error: 'Alternatives not found for this project' }, 400);
    }

    const variants = altsArtifact.content as any[];
    const selected = variants.find(v => v.id === variantId);
    if (!selected) {
      return c.json({ error: `Variant ${variantId} not found` }, 404);
    }

    // 1. Przebudowa summary
    const summary = {
      distance_km: selected.distance_km,
      duration_h: selected.duration_h,
      points_count: selected.track.length,
      track: selected.track
    };

    // 2. Przebudowa GPX
    const route = {
      distance_km: selected.distance_km,
      duration_h: selected.duration_h,
      trackPoints: selected.track
    };
    const newGpx = gpxService.buildGpx(route, projectId);

    // 3. Przebudowa POI (miejsc)
    const newPlaces = selected.pois || [
      { name: 'Start', lat: selected.track[0][0], lng: selected.track[0][1] },
      { name: 'Meta', lat: selected.track[selected.track.length - 1][0], lng: selected.track[selected.track.length - 1][1] }
    ];

    // 4. Wygenerowanie przewodnika AI dla nowego wariantu
    const { text: newReportText, sources } = await reportService.generateShortReport(route, project.requirements, newPlaces);

    // 5. Zapisanie/nadpisanie artefaktów
    await Promise.all([
      repo.upsertArtifact(projectId, 'gpx', { raw_data: newGpx }),
      repo.upsertArtifact(projectId, 'summary', { content: summary }),
      repo.upsertArtifact(projectId, 'places', { content: newPlaces }),
      repo.upsertArtifact(projectId, 'report', { raw_data: newReportText }),
      repo.upsertArtifact(projectId, 'research_sources', { content: sources })
    ]);

    // 6. Aktualizacja projektu o dystans
    await repo.updateProject(projectId, {
      ...project.requirements,
      distance_target_km: selected.distance_km
    });

    return c.json({ status: 'success', selected: variantId, summary });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Tworzenie joba
app.post('/route-projects/:id/jobs', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const project = await repo.getProject(projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);
  
  try {
    const atlasUrl = process.env.ATLAS_API_BASE_URL || 'http://host.docker.internal:8787';
    
    // Check if it's GPX or prompt-based
    const gpxArtifact = await repo.getArtifactByType(projectId, 'gpx');
    const summaryArtifact = await repo.getArtifactByType(projectId, 'summary');
    
    if (gpxArtifact && summaryArtifact) {
      // Legacy GPX flow, keep it unchanged for now as it works locally
      let job = await repo.createJob(projectId);
      job = await repo.updateJobState(job.id, {
        status: 'running',
        current_step: 'building_artifacts',
        progress: 60,
        human_message: 'Generowanie przewodnika dla wgranej trasy GPX...'
      });

      (async () => {
        try {
          const summary = summaryArtifact.content as any;
          const trackPoints = summary.track;
          const firstPoint = trackPoints[0];
          const lastPoint = trackPoints[trackPoints.length - 1];
          const places = [
            { name: 'Start (z pliku GPX)', lat: firstPoint[0], lng: firstPoint[1] },
            { name: 'Meta (z pliku GPX)', lat: lastPoint[0], lng: lastPoint[1] }
          ];

          const { text: reportText, sources } = await reportService.generateShortReport({
            trackPoints,
            distance_km: summary.distance_km,
            duration_h: summary.duration_h
          } as any, project.requirements);

          const alternatives = await routingService.getRouteAlternatives(places as any[], project.requirements.route_type);

          await Promise.all([
            repo.upsertArtifact(projectId, 'report', { raw_data: reportText }),
            repo.upsertArtifact(projectId, 'research_sources', { content: sources }),
            repo.upsertArtifact(projectId, 'alternatives', { content: alternatives }),
            repo.upsertArtifact(projectId, 'places', { content: places })
          ]);

          await repo.updateJobState(job.id, {
            status: 'ready',
            progress: 100,
            current_step: 'completed',
            human_message: 'Gotowe! Przewodnik dla Twojej trasy GPX został wygenerowany.'
          });
        } catch (err: any) {
          console.error(`[Job ${job.id}] GPX Flow FAILED:`, err);
          await repo.updateJobState(job.id, {
            status: 'failed',
            error_message: err.message
          }).catch(console.error);
        }
      })();

      return c.json(job, 201);
    }

    // Proxy to atlas-engine
    const res = await fetch(`${atlasUrl}/projects/${projectId}/jobs/run-mvp2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // empty body if required
    });
    
    if (!res.ok) {
      const errorData = await res.text();
      console.error(`Atlas Engine returned ${res.status}: ${errorData}`);
      throw new Error(`Błąd tworzenia zadania w silniku. Status: ${res.status}`);
    }
    
    const data = await res.json() as any;
    const atlasJob = data.job || data;
    
    // Map AtlasJob back to legacy Job format for the frontend immediately
    return c.json({
      id: atlasJob.id,
      project_id: projectId,
      status: 'running',
      progress: atlasJob.progress || 0,
      current_step: atlasJob.currentStep || 'routing',
      human_message: 'Uruchamianie silnika Atlas...',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, 201);
  } catch (err: any) {
    console.error(`[Atlas Proxy FAILED]:`, err);
    return c.json({ error: err.message }, 500);
  }
});

app.get('/route-projects/:id/jobs/:jobId', async (c) => {
  const projectId = c.req.param('id');
  const jobId = c.req.param('jobId');
  const user = c.get('user');

  const project = await repo.getProject(projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);

  if (jobId.startsWith('job_')) {
    // This is an atlas-engine job
    try {
      const atlasUrl = process.env.ATLAS_API_BASE_URL || 'http://host.docker.internal:8787';
      const res = await fetch(`${atlasUrl}/jobs/${jobId}`);
      if (!res.ok) {
        return c.json({ error: 'Atlas Job not found' }, 404);
      }
      const data = await res.json() as any;
      const atlasJob = data.job || data;
      
      // Map to frontend format
      let mappedStatus = 'running';
      let missingInputs: string[] = [];
      let humanMsg = 'Przetwarzanie...';

      if (atlasJob.status === 'completed') {
        mappedStatus = 'ready';
        humanMsg = 'Trasa gotowa do podglądu.';
      } else if (atlasJob.status === 'failed') {
        mappedStatus = 'failed';
        humanMsg = atlasJob.error || 'Wystąpił błąd.';
      } else if (atlasJob.status === 'waiting_for_approval') {
        mappedStatus = 'waiting_for_user';
        humanMsg = 'Wymagane dodatkowe informacje.';
        
        // Fetch missing inputs from atlas project
        try {
          const miRes = await fetch(`${atlasUrl}/projects/${projectId}/missing-inputs`);
          if (miRes.ok) {
            missingInputs = await miRes.json();
          }
        } catch (e) {
          console.error("Failed fetching missing inputs", e);
        }
      }

      return c.json({
        id: atlasJob.id,
        project_id: projectId,
        status: mappedStatus,
        progress: atlasJob.progress || 0,
        current_step: atlasJob.currentStep || 'routing',
        human_message: humanMsg,
        missing_inputs: missingInputs,
        error_message: atlasJob.error || null,
        created_at: atlasJob.createdAt,
        updated_at: atlasJob.updatedAt
      });
    } catch (err: any) {
      console.error(`[Atlas Proxy GET FAILED]:`, err);
      return c.json({ error: err.message }, 500);
    }
  }

  // Legacy job
  const job = await repo.getJob(jobId);
  if (!job) return c.json({ error: 'Not found' }, 404);
  return c.json(job);
});

// Fast endpoint for live routing on the interactive map
app.post('/live-route', async (c) => {
  try {
    const { points, route_type, surface_preferences, intent, distance_target_km } = await c.req.json();
    if (!points || points.length < 2) {
      return c.json({ error: 'At least 2 points required' }, 400);
    }
    
    // Konwersja na GeocodedPlace
    const places = points.map((p: any, i: number) => ({
      name: p.name || `Punkt ${i+1}`,
      lat: p.lat,
      lng: p.lng,
      type: i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'waypoint')
    }));

    const route = await routingService.getRoute(places, route_type || 'hiking', {
      intent: intent || '',
      surfacePreferences: surface_preferences || []
    });

    // Walidacja: czy ślad faktycznie przechodzi przy zadanych punktach, czy pętla domknięta
    const isLoop = points.length > 2 &&
      Math.abs(points[0].lat - points[points.length - 1].lat) < 1e-6 &&
      Math.abs(points[0].lng - points[points.length - 1].lng) < 1e-6;
    const validation = routeValidatorService.validate(route.trackPoints, places, {
      routeType: route_type || 'hiking',
      distanceTargetKm: distance_target_km || null,
      actualDistanceKm: route.distance_km,
      isLoop
    });
    if (!validation.ok) {
      console.warn('[LiveRoute] Validation warnings:', validation.warnings);
    }

    return c.json({ ...route, validation });
  } catch (err: any) {
    console.error('[LiveRoute] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Proxy do twardej geometrii Atlasa
app.post('/route-projects/atlas/geometry', async (c) => {
  try {
    const body = await c.req.json();
    const ATLAS_API = process.env.ATLAS_API_URL || 'http://atlas-api:8787';
    const ATLAS_TOKEN = process.env.ATLAS_API_TOKEN || '';
    
    const response = await fetch(`${ATLAS_API}/api/routes/geometry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ATLAS_TOKEN}`
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Proxy do Deep Research Atlasa
app.post('/route-projects/atlas/research', async (c) => {
  try {
    const body = await c.req.json();
    const ATLAS_API = process.env.ATLAS_API_URL || 'http://atlas-api:8787';
    const ATLAS_TOKEN = process.env.ATLAS_API_TOKEN || '';
    
    const response = await fetch(`${ATLAS_API}/api/routes/research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ATLAS_TOKEN}`
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8081;
console.log(`Route Builder API v2 is running on port ${port}`);

serve({ fetch: app.fetch, port });
