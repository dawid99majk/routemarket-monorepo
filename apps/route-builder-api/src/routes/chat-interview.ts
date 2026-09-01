import { Hono } from 'hono';
import { repo } from '../db/repository.js';
import { geocodingService } from '../services/geocoding.js';
import { routingService } from '../services/routing.js';
import { poiService, poiClusterCenter, PoiCandidate } from '../services/poi.js';
import { routeValidatorService } from '../services/route-validator.js';
import { callGeminiTracked } from '../services/ai-usage.js';

export const chatInterviewRouter = new Hono<{ Variables: { user: any, userId: string } }>();


/** Kształt odpowiedzi agenta wywiadu, wymuszany na Gemini (OpenAPI subset). */
const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    phase: { type: 'string', enum: ['start_point', 'discovery', 'variant_choice', 'refine', 'confirm', 'generate'] },
    reply: { type: 'string' },
    suggested_title: { type: 'string' },
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
          requires_input: { type: 'boolean' },
          input_placeholder: { type: 'string' },
          implies: {
            type: 'object',
            properties: {
              structure: { type: 'string' },
              mode: { type: 'string' },
              theme: { type: 'string' },
              start_point: { type: 'string' },
              region: { type: 'string' },
              pace: { type: 'string' },
              interests: { type: 'string' },
              difficulty: { type: 'string' },
              pattern: { type: 'string' },
              accommodation: { type: 'string' },
              variant: { type: 'string' },
              distance_km: { type: 'number' }
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
): Promise<{ startPlace: string | null; distanceKm: number | null; isLoop: boolean; days: number | null; durationH: number | null }> {
  const prompt = `Z poniższej rozmowy o planowaniu trasy wyciągnij:
1. "start_place" — nazwę miejscowości startu w formie NADAJĄCEJ SIĘ DO WYSZUKANIA NA MAPIE:
   - mianownik, oficjalna pisownia w języku kraju, w którym leży to miejsce (np. z "ze Złotych Hor i okolicy" → "Zlaté Hory", z "spod Zakopanego" → "Zakopane", z "w Krakowie" → "Kraków");
   - SAMA nazwa miejscowości — bez słów "okolice", "i okolicy", "rejon", bez przyimków i bez opisów;
   - jeśli w rozmowie nie padła żadna konkretna miejscowość, zwróć null.
2. "distance_km" — docelowy dystans trasy w km jako liczbę.
   Dla wędrówek GÓRSKICH/terenowych w dniach: lekki 15 km/dzień, umiarkowany 20, wymagający 25 (bez podanej trudności przyjmij 20).
   Dla ZWIEDZANIA MIASTA w dniach: spokojnie 5 km/dzień, normalnie 8, intensywnie 12 (bez podanej trudności przyjmij 8) — w mieście czas schodzi na zwiedzanie, nie na marsz.
   Zwróć null tylko wtedy, gdy nie padł ani dystans, ani liczba dni.
3. "is_loop" — true jeśli trasa ma być pętlą (powrót do startu), false jeśli liniowa. Domyślnie true.
4. "days" — liczba dni wędrówki, jeśli padła w rozmowie (np. "2 dni" → 2). Jeśli nie padła, zwróć null.
5. "duration_h" — ile GODZIN ma zająć trasa, jeśli padło w rozmowie ("na kilka godzin" → 4, "całodniowy" → 8, "na pół dnia" → 4, "2-3 godziny" → 2.5). Jeśli nie padło, null.

Rozmowa:
"""
${conversationText.slice(0, 6000)}
"""
${inputNotes ? `Notatki użytkownika: "${inputNotes.slice(0, 2000)}"` : ''}

Odpowiedz WYŁĄCZNIE obiektem JSON: {"start_place": "...", "distance_km": 50, "is_loop": true, "days": null, "duration_h": null}`;

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
  if (!text) return { startPlace: null, distanceKm: null, isLoop: true, days: null, durationH: null };
  const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  return {
    startPlace: parsed.start_place || null,
    distanceKm: Number(parsed.distance_km) || null,
    isLoop: parsed.is_loop !== false,
    days: Number(parsed.days) || null,
    durationH: Number(parsed.duration_h) || null
  };
}

/**
 * Zasięg obszaru poszukiwań POI. Dla pętli o obwodzie D promień koła wynosi D/(2π),
 * więc szukanie atrakcji dalej niż ~D/5 od startu z założenia produkuje trasę
 * dłuższą, niż użytkownik zamówił.
 */
/**
 * Ile realnie da się przejść w zadanym czasie. Ludzie nie mają wyczucia, ile to
 * 8 km po mieście — myślą godzinami. Przy zwiedzaniu większość czasu schodzi na
 * oglądanie, nie na marsz, więc na chodzenie zostaje ok. 40% godzin przy ~3,5 km/h.
 */
function walkableKmForHours(hours: number, routeType: string): number {
  const cityLike = routeType === 'city' || routeType === 'city_walk';
  return cityLike ? Math.round(hours * 1.4 * 10) / 10 : Math.round(hours * 3 * 10) / 10;
}

function poiRadiusForRoute(
  distanceKm: number | null,
  isLoop: boolean,
  days?: number | null,
  structure?: string,
  routeType?: string
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
  // Spacer po mieście jest pętlą po dzielnicach — punkty leżą blisko siebie,
  // a szeroki promień wpuszcza imienników z drugiego końca aglomeracji.
  if (routeType === 'city' || routeType === 'city_walk') {
    const perDay = distanceKm / Math.max(1, dayCount);
    return Math.min(12, Math.max(2, Math.round(perDay / 2)));
  }

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

/**
 * Awaryjne wygenerowanie samej listy punktów. Model potrafi ogłosić gotową trasę
 * ("Oto Twoja przemyślana trasa...") i nie dołączyć add_waypoints — użytkownik
 * dostaje wtedy komunikat o sukcesie i pustą mapę.
 */
async function generateWaypointList(
  apiKey: string,
  conversationText: string,
  tripProfile: Record<string, any> | undefined,
  candidates: PoiCandidate[],
  routeType: string,
  targetKm: number | null
): Promise<string[] | null> {
  const decided = tripProfile && Object.keys(tripProfile).length > 0
    ? `Ustalenia: ${JSON.stringify(tripProfile)}`
    : '';
  const poiList = candidates.slice(0, 40)
    .map((c) => `- "${c.name}"${c.distanceKm != null ? ` (${c.distanceKm} km od startu)` : ''}`)
    .join('\n');

  const prompt = `Na podstawie rozmowy ułóż KONKRETNĄ listę punktów trasy (${routeType}).
${decided}
${targetKm ? `Docelowy dystans: ok. ${targetKm} km.` : ''}

Rozmowa:
"""
${conversationText.slice(0, 6000)}
"""

${poiList ? `Zweryfikowane miejsca w okolicy (kopiuj nazwy DOKŁADNIE stąd):\n${poiList}` : ''}

Zasady: pierwszy i ostatni punkt to start/meta, kolejność geograficzna bez zawracania, 6-12 punktów.
Odpowiedz WYŁĄCZNIE obiektem JSON: {"waypoints": ["nazwa1", "nazwa2", ...]}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: { waypoints: { type: 'array', items: { type: 'string' } } },
          required: ['waypoints']
        },
        maxOutputTokens: 2048
      }
    })
  });
  if (!res.ok) throw new Error(`Gemini waypoint list error ${res.status}`);
  const data = await res.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  return Array.isArray(parsed.waypoints) ? parsed.waypoints : null;
}

// Chat AI Interview
chatInterviewRouter.post('/chat-interview', async (c) => {
  try {
    const { messages, project_id, input_notes, current_waypoints, vehicle_type, bike_subtype, routing_preference, trip_profile, creator_preferences } = await c.req.json() as { 
      messages: {role: string, text: string}[], 
      project_id?: string, 
      input_notes?: string,
      current_waypoints?: {lat: number, lng: number}[],
      vehicle_type?: string,
      bike_subtype?: string,
      routing_preference?: string,
      trip_profile?: Record<string, any>,
      creator_preferences?: Record<string, number>
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

    // Preferencje z profilu twórcy — suwak 0-100, 50 to brak preferencji.
    // Przekładamy je na konkretne wytyczne, bo sama liczba nic modelowi nie mówi.
    if (creator_preferences && Object.keys(creator_preferences).length > 0) {
      const axis = (v: number | undefined, low: string, high: string): string | null => {
        if (v == null || (v >= 40 && v <= 60)) return null;
        const strong = v <= 20 || v >= 80;
        return `${v < 50 ? low : high}${strong ? ' (wyraźnie)' : ''}`;
      };
      const lines = [
        axis(creator_preferences.pace,
          'Tempo: zobaczyć jak najwięcej — planuj więcej krótszych przystanków',
          'Tempo: spokojnie — mniej punktów, za to z czasem na dokładne zwiedzenie każdego'),
        axis(creator_preferences.popularity,
          'Miejsca: klasyki i must-see regionu',
          'Miejsca: niszowe i nieoczywiste, omijaj najbardziej oblegane ikony'),
        axis(creator_preferences.wandering,
          'Charakter: prowadź sprawdzonymi, uczęszczanymi trasami',
          'Charakter: prowadź bocznymi uliczkami, podwórkami i deptakami zamiast najkrótszą drogą — po drodze ma być co odkrywać'),
        axis(creator_preferences.dining,
          'Gastronomia: eleganckie restauracje i kawiarnie z półki',
          'Gastronomia: lokalny street food, bary mleczne, przydrożna kawa'),
        axis(creator_preferences.effort,
          'Wysiłek: spokojnie i płasko, unikaj stromych podejść i schodów',
          'Wysiłek: podejścia mile widziane — wzgórza, tarasy widokowe, przewyższenia'),
        axis(creator_preferences.crowds,
          'Tłumy: nie stanowią problemu',
          'Tłumy: unikaj zatłoczonych miejsc, sugeruj mniej oblegane pory dnia')
      ].filter(Boolean);
      if (lines.length > 0) {
        projectContext += `\n\n=== STAŁE PREFERENCJE TEGO TWÓRCY (z jego profilu) ===\n${lines.map((l) => `- ${l}`).join('\n')}\nUwzględniaj je bez pytania. Jeśli w tej rozmowie użytkownik powie coś przeciwnego, jego bieżąca prośba ma pierwszeństwo.`;
      }
    }

    // Decyzje podjęte przez kliknięcie kart w poprzednich fazach — to ustalenia,
    // nie sugestie; agent nie ma o nie pytać drugi raz.
    if (trip_profile && Object.keys(trip_profile).length > 0) {
      const labels: Record<string, string> = {
        structure: 'Struktura wyjazdu',
        start_point: 'Punkt startu',
        pace: 'Tempo',
        mode: 'Tryb',
        theme: 'Motyw spaceru',
        interests: 'Zainteresowania',
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
        if (trip_profile.mode === 'stroll') {
          projectContext += `\nTryb "stroll" oznacza LUŹNY SPACER: punkty są mijane (5-15 min), a nie zwiedzane od środka. Godziny otwarcia nie decydują o doborze — obiekt zamknięty nadal można obejrzeć z zewnątrz. Prowadź deptakami, placami i uliczkami, nie najkrótszą drogą.`;
        }
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
    let poiRouteType = vehicle_type === 'bicycle' ? (bike_subtype || 'cycling') : (vehicle_type || 'hiking');
    // Spacer zieloną stroną szuka zupełnie innych obiektów niż zwiedzanie zabytków
    if (trip_profile?.mode === 'stroll' && trip_profile?.theme === 'green') {
      poiRouteType = 'green';
    }
    let poiCenter: { lat: number; lng: number } | null =
      current_waypoints && current_waypoints.length > 0
        ? { lat: current_waypoints[0].lat, lng: current_waypoints[0].lng }
        : null;
    let conversationDistanceKm: number | null = null;
    let conversationIsLoop = true;
    let conversationDays: number | null = null;
    let conversationDurationH: number | null = null;

    if (messages.length > 0) {
      try {
        const extracted = await extractLocationFromConversation(GEMINI_API_KEY, conversationText, input_notes);
        conversationDistanceKm = extracted.distanceKm;
        conversationIsLoop = extracted.isLoop;
        conversationDays = extracted.days;
        conversationDurationH = extracted.durationH;
        // Podany czas jest wiarygodniejszy niż kilometry — użytkownik wie, ile ma godzin
        if (extracted.durationH && !extracted.distanceKm) {
          conversationDistanceKm = walkableKmForHours(extracted.durationH, poiRouteType);
          console.log(`[chat-interview] ${extracted.durationH} h -> ok. ${conversationDistanceKm} km marszu (${poiRouteType})`);
        }
        if (!poiCenter && extracted.startPlace) {
          const startPlace = await geocodingService.geocodeSettlement(extracted.startPlace);
          poiCenter = { lat: startPlace.lat, lng: startPlace.lng };
          console.log(`[chat-interview] POI center from conversation: "${extracted.startPlace}" -> ${poiCenter.lat},${poiCenter.lng}`);
        }
      } catch (err) {
        console.warn('[chat-interview] Could not derive POI center from conversation:', err);
      }
    }

    const poiRadiusKm = poiRadiusForRoute(conversationDistanceKm, conversationIsLoop, conversationDays, trip_profile?.structure, poiRouteType);
    if (poiCenter) {
      try {
        poiCandidates = await poiService.fetchCandidates(
          poiCenter,
          poiRouteType,
          poiRadiusKm ? { radiusKm: poiRadiusKm, limit: 45 } : { limit: 45 }
        );
        console.log(`[chat-interview] Loaded ${poiCandidates.length} OSM POI candidates (${poiRouteType}, radius ${poiRadiusKm || 'default'} km)`);

        // Geokoder dla rozległego miasta oddaje centroid granic administracyjnych.
        // Dla Wrocławia wypadał w magazynie na Gądowie, 4,5 km od Rynku, więc
        // promień szukania obejmował przedmieścia zamiast starówki i trasa
        // układała się z rozrzuconych kościołów. Przy spacerze po mieście
        // przesuwamy się na środek ciężkości atrakcji i pobieramy je ponownie.
        if (poiRouteType === 'city_walk' || poiRouteType === 'green') {
          const cluster = poiClusterCenter(poiCandidates);
          if (cluster) {
            const dLat = (cluster.lat - poiCenter.lat) * 111;
            const dLng = (cluster.lng - poiCenter.lng) * 111 * Math.cos((poiCenter.lat * Math.PI) / 180);
            const shiftKm = Math.sqrt(dLat * dLat + dLng * dLng);
            if (shiftKm > 1) {
              console.log(`[chat-interview] Środek atrakcji przesunięty o ${shiftKm.toFixed(1)} km: ${poiCenter.lat.toFixed(4)},${poiCenter.lng.toFixed(4)} -> ${cluster.lat.toFixed(4)},${cluster.lng.toFixed(4)}`);
              poiCenter = cluster;
              poiCandidates = await poiService.fetchCandidates(
                poiCenter,
                poiRouteType,
                poiRadiusKm ? { radiusKm: poiRadiusKm, limit: 45 } : { limit: 45 }
              );
            }
          }
        }
        // Do promptu idzie top 45, ale dopasowywać nazwy chcemy do pełnej puli —
        // punkt w rodzaju grani "Kępa" bywa poza czołówką rankingu, a to właśnie
        // jego współrzędne z OSM ratują go przed pomyłką geokodera.
        poiMatchPool = await poiService.fetchCandidates(
          poiCenter,
          poiRouteType,
          poiRadiusKm ? { radiusKm: poiRadiusKm, limit: 800 } : { limit: 800 }
        );
        console.log(`[chat-interview] Match pool: ${poiMatchPool.length} POI`);
      } catch (err) {
        console.warn('[chat-interview] POI candidates fetch failed, continuing without:', err);
      }
      if (poiMatchPool.length === 0) poiMatchPool = poiCandidates;

      // Parking i lokal to dodatek do rozmowy, nie jej warunek. Gdy Overpass
      // się dławi, lepiej poprowadzić wywiad bez tych list niż kazać człowiekowi
      // patrzeć w kręcące się kółko. Oba zapytania idą równolegle i mają twardy
      // limit czasu — po nim po prostu ich nie ma.
      const withDeadline = async <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => {
        let timer: NodeJS.Timeout;
        const guard = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
        try {
          return await Promise.race([p, guard]);
        } finally {
          clearTimeout(timer!);
        }
      };

      // Wymyślony przez model "Parking przy Starym Bazarze" zakotwiczył kiedyś
      // trasę po Krujë w Nowym Sączu — parking musi przyjść z OSM ze
      // współrzędnymi, a nie z nazwy oddanej geokoderowi.
      const arrivesByCar = vehicle_type === 'car' || vehicle_type === 'motorcycle'
        || trip_profile?.arrival === 'car';
      const isCityWalk = poiRouteType === 'city_walk' || poiRouteType === 'city';

      const [parkings, food] = await Promise.all([
        arrivesByCar
          ? withDeadline(poiService.fetchCandidates(poiCenter, 'parking', { radiusKm: 3, limit: 8 }), 8000, [] as PoiCandidate[])
              .catch(() => [] as PoiCandidate[])
          : Promise.resolve([] as PoiCandidate[]),
        isCityWalk
          ? withDeadline(poiService.fetchCandidates(poiCenter, 'food', { radiusKm: 3, limit: 12 }), 8000, [] as PoiCandidate[])
              .catch(() => [] as PoiCandidate[])
          : Promise.resolve([] as PoiCandidate[])
      ]);

      if (parkings.length > 0) {
        poiMatchPool = [...poiMatchPool, ...parkings];
        projectContext += `\n\nPARKINGI W OKOLICY (prawdziwe, z OpenStreetMap — kopiuj nazwy DOKŁADNIE):\n`
          + parkings.map((p) => {
              const oplata = p.fee === 'yes' ? 'płatny' : (p.fee === 'no' ? 'bezpłatny' : 'opłata nieznana');
              const miejsca = p.capacity ? `, ${p.capacity} miejsc` : '';
              return `- "${p.name}" (${oplata}${miejsca})`;
            }).join('\n')
          + `\nGdy pytasz o punkt startu, zaproponuj 2-3 z tej listy jako karty wyboru: w "subtitle" podaj opłatę i liczbę miejsc, w "description" napisz, ile stąd idzie się do pierwszej atrakcji. NIGDY nie wymyślaj parkingu spoza listy.`;
        console.log(`[chat-interview] ${parkings.length} parkingów w puli`);
      }

      if (food.length > 0) {
        poiMatchPool = [...poiMatchPool, ...food];
        projectContext += `\n\nLOKALE W OKOLICY (prawdziwe, z OpenStreetMap — kopiuj nazwy DOKŁADNIE):\n`
          + food.map((f) => `- "${f.name}" (${f.kind}${f.openingHours ? `, godziny: ${f.openingHours}` : ''})`).join('\n')
          + `\nW spacerze po mieście ZAWSZE zapytaj raz o przerwę na jedzenie — najlepiej po ustaleniu charakteru trasy, a przed jej wygenerowaniem (faza "refine"). Daj 2-3 karty z tej listy plus kartę "bez przerwy". Na karcie napisz typ lokalu i godziny otwarcia. Wybrane miejsce wstaw w trasę TAM, GDZIE WYPADA PORA POSIŁKU — między punktami, a nie na końcu listy. NIGDY nie wymyślaj lokalu spoza listy.`;
        console.log(`[chat-interview] ${food.length} lokali w puli`);
      }
    }
    if (poiCandidates.length > 0) {
      projectContext += poiService.buildPromptSection(poiCandidates, routing_preference);
      if (conversationDistanceKm && poiRadiusKm) {
        projectContext += `\n\n=== BUDŻET GEOGRAFICZNY (twarde ograniczenie) ===
Trasa ma mieć ok. ${conversationDistanceKm} km${conversationDays && conversationDays >= 2 ? ` i zająć ${conversationDays} dni` : conversationIsLoop ? ' i być PĘTLĄ' : ''}. Przy każdej atrakcji podana jest jej odległość od startu w linii prostej.
${poiRouteType === 'city' || poiRouteType === 'city_walk'
  ? `Zwiedzanie miasta — NIE UKŁADAJ PUNKTÓW W PIERŚCIEŃ:
${conversationDurationH ? `- Budżet czasu: ok. ${conversationDurationH} h. To około ${conversationDistanceKm} km marszu — reszta godzin schodzi na zwiedzanie, kawę i jedzenie. MÓW DO UŻYTKOWNIKA GODZINAMI, nie kilometrami.\n` : ''}- ${conversationDistanceKm} km to GÓRNY LIMIT marszu, a nie cel do wyrobienia. Krótsza trasa z lepszymi miejscami jest lepsza niż dłuższa z gorszymi.
- Wybierz 6-10 NAJWAŻNIEJSZYCH punktów z listy powyżej — te najwyżej na liście są najbardziej znane. Nie pomijaj ikon miasta na rzecz mniej znanych obiektów tylko po to, żeby rozciągnąć trasę.
- Punkty mają leżeć BLISKO SIEBIE i układać się dzielnicami: zwiedź jedną okolicę do końca, dopiero potem przejdź do sąsiedniej. Rozrzucanie punktów na wszystkie strony od startu to błąd — turysta spędzi dzień na chodzeniu między nimi zamiast na zwiedzaniu.
- Jeśli suma odległości wychodzi wyraźnie poniżej ${conversationDistanceKm} km, to DOBRZE — zostaje czas na wejście do muzeów.`
  : conversationDays && conversationDays >= 2
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
  c) DLA MIASTA PYTAJ O CZAS, NIE O KILOMETRY. Nikt nie wie, ile to jest 8 km po mieście — za to każdy wie, że ma "3 godziny" albo "cały dzień". Pytaj: "ile czasu masz na zwiedzanie?" i proponuj karty: 2-3 godziny / pół dnia (4 h) / cały dzień (7-8 h). Kilometry wylicz sam i podawaj co najwyżej jako informację dodatkową.
- PĘTLA czy LINIOWA — wynika z odpowiedzi na pytanie o strukturę w fazie "discovery", nie pytaj osobno.
- PREFERENCJE terenu — jeśli to gravel/mtb, nie pytaj, bo wiemy.
- POPULARNOŚĆ — nie pytaj osobno. Warianty w fazie "variant_choice" mają się różnić charakterem, w tym stopniem oblegania.

=== JAK PROWADZIĆ ROZMOWĘ: JESTEŚ DORADCĄ, NIE ANKIETĄ ===
Użytkownik często NIE ZNA terenu — może lecieć do Tirany i nie mieć pojęcia, co tam jest. Twoim zadaniem jest zrobić rozeznanie ZA NIEGO, pokazać możliwości i przeprowadzić go przez decyzje. Nigdy nie odpytuj go z parametrów technicznych, których nie ma jak znać.

Prowadzisz rozmowę w FAZACH. W każdej odpowiedzi zwracasz pole "phase" oraz — gdy dajesz wybór — tablicę "options" z konkretnymi kartami do kliknięcia.

FAZA 0 — "start_point" (PUNKT STARTU — ZAWSZE PIERWSZE PYTANIE)
Jeśli użytkownik podał tylko miasto/region, a nie wiadomo, skąd konkretnie rusza (brak pinezki na mapie), TO JEST PIERWSZA RZECZ DO USTALENIA — start determinuje całą resztę trasy.
Nie pytaj sucho „skąd startujesz?". Zaproponuj wybór:
- karta 1: konkretny, popularny punkt startowy, który SAM dobierzesz dla tego miasta i rodzaju trasy (parking przy szlaku, dworzec, rynek, węzeł szlaków) — podaj jego nazwę w "title" i uzasadnij w "description" (dojazd, parking, komunikacja);
- karta 2: „Chcę podać własny punkt" — MUSI mieć "requires_input": true oraz "input_placeholder" z przykładem (np. "np. Hotel Rogner, Tirana"). Kliknięcie takiej karty otwiera użytkownikowi pole tekstowe; nie każ mu pisać w rozmowie.
Jeśli region ma kilka naturalnych baz wypadowych, możesz dać 2-3 karty z propozycjami plus kartę „własny punkt".
Gdy użytkownik wybierze konkretny punkt, zapisz go w implies jako {"start_point": "<dokładna nazwa>"}.

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

FAZA 3 — "refine" (2-4 dopytania — to jest WYWIAD, nie formalność)
Klient ma poczuć, że trasa powstaje pod NIEGO. Zadaj kolejno kilka pytań, każde jako osobna odpowiedź z kartami (jedno pytanie naraz). Dobieraj je do pojazdu i wybranego wariantu — pytaj o rzeczy, które REALNIE zmienią trasę lub przewodnik:
- tempo i kondycja: spokojnie z zapasem czasu / normalnie / sportowo bez przystanków;
- co Cię najbardziej ciekawi: widoki i przyroda / historia i zabytki / jedzenie i lokalne knajpy / fotografia / cisza i pustka;
- przerwy i jedzenie: schroniska i knajpki po drodze / prowiant własny, bez postojów;
- czego unikać: stromych podejść, ekspozycji i łańcuchów, tłumów, dróg ruchliwych, odcinków płatnych;
- pora startu i światło: wschód słońca, wczesny start, spokojne popołudnie;
- konkrety zależne od wariantu: które schronisko na nocleg, czy zahaczyć o sąsiedni kraj, czy dołożyć konkretną atrakcję po drodze.
Nie zadawaj wszystkich naraz i nie pytaj o rzeczy, które już wynikają z rozmowy albo z wybranego wariantu. Po 2-4 pytaniach przechodź do podsumowania.
Przy każdym pytaniu zostawiaj "allow_custom": true — użytkownik może dopisać coś od siebie zamiast wybierać kartę.

FAZA 4 — "confirm" (podsumowanie do zatwierdzenia)
Streść plan z konkretami: skąd start, dokąd, przez co, ile km, gdzie nocleg — ORAZ wypunktuj, jak uwzględniłeś odpowiedzi z wywiadu (np. „spokojne tempo, przerwa w schronisku, omijamy odcinki z łańcuchami"). To moment, w którym klient ma zobaczyć, że trasa jest ułożona pod niego. Zapytaj, czy generować.

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

3c. FORMATOWANIE ODPOWIEDZI (pole "reply" renderujemy jako Markdown):
   - Pytania w fazach 0-3: krótki akapit, bez nagłówków i list. To ma być zdanie, nie dokument.
   - PODSUMOWANIE (faza "confirm") i opis wygenerowanej trasy: ZAWSZE ustrukturyzowane, nigdy jednolity blok tekstu:
     * jedno zdanie wprowadzenia,
     * potem nagłówek trzeciego poziomu "Trasa" i wypunktowana lista przystanków — każdy w OSOBNEJ LINII, w formacie: myślnik, spacja, pogrubiona nazwa, myślnik, jedno zdanie czym to miejsce jest,
     * nagłówek "Jedzenie" z propozycją posiłku, jeśli jest,
     * nagłówek "Dobrze wiedzieć" z rzeczami praktycznymi (godziny, bilety, tempo, dziecko, pogoda),
     * na końcu pytanie do użytkownika w osobnej linii.
   - Wyliczenia ZAWSZE jako lista markdown (myślnik i spacja na początku linii), każdy element od nowej linii. NIGDY nie wypisuj punktów po przecinku ani gwiazdkami w jednym akapicie.
   - Nazwy własne miejsc pogrubiaj podwójnymi gwiazdkami.
   - Bez emoji i bez ozdobników.
3a. NIGDY NIE POWTARZAJ TEJ SAMEJ FAZY. Jeśli ostatnia wypowiedź użytkownika odpowiada tytułowi karty, którą właśnie zaproponowałeś, to znaczy, że DOKONAŁ WYBORU — przejdź do NASTĘPNEJ fazy, nie pokazuj tych samych wariantów jeszcze raz. Ponowne wyświetlenie tego samego wyboru jest błędem.
3b. Każda karta wariantu MUSI mieć wypełnione "implies" (np. {"variant": "<tytuł>", "region": "...", "difficulty": "..."}), żeby wybór został zapamiętany.
4. UKRYTY DYSTANS: przy done: true wylicz sumaryczny dystans z liczby dni i trudności. UWAGA — miasto i góry mają ZUPEŁNIE inne tempo:
   Wędrówka górska/terenowa (hiking):
   - Lekki: 15 km/dzień (np. 3 dni = 45)
   - Umiarkowany: 20 km/dzień (np. 3 dni = 60)
   - Wymagający: 25 km/dzień (np. 3 dni = 75)
   Zwiedzanie miasta (city / city_walk) — dzień wypełnia ZWIEDZANIE, nie marsz:
   - Spokojnie: 5 km/dzień
   - Normalnie: 8 km/dzień
   - Intensywnie: 12 km/dzień
   Więcej niż 12 km marszu dziennie po mieście oznacza, że turysta nie wejdzie do żadnego muzeum — to błąd, nie ambitny plan.
   Wpisz wynik jako liczbę w polu "distance", a liczbę dni w polu "days".
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

   DWA TRYBY ZWIEDZANIA — ZAWSZE DAJ WYBÓR PRZY MIEŚCIE:
   Niektórzy chcą wejść do muzeów, inni po prostu POWŁÓCZYĆ SIĘ po mieście. To
   zupełnie inne trasy i nie wolno zakładać pierwszego. W fazie "variant_choice"
   dla miasta zaproponuj warianty z OBU rodzin:
   a) ZWIEDZANIE Z WEJŚCIAMI — muzea, wnętrza, bilety, godziny otwarcia mają znaczenie.
   b) LUŹNY SPACER — idziesz i patrzysz, wnętrza opcjonalnie. Warianty tematyczne:
      • „Luźny spacer po klasykach" — kultowe miejsca widziane z zewnątrz, place, deptaki
      • „Luźny spacer po miejscach na uboczu" — boczne uliczki, podwórka, dzielnice bez turystów
      • „Luźny spacer zieloną stroną" — parki, bulwary, nabrzeża, aleje
   W karcie trybu spacerowego ustaw "implies": {"mode": "stroll", "theme": "classic" | "niche" | "green"}.

   GDY WYBRANO TRYB SPACERU (mode: stroll):
   - Punkty to rzeczy MIJANE, nie zwiedzane. Czas przy punkcie 5-15 minut, nie 60-90.
   - Godziny otwarcia przestają rządzić trasą — obiekt zamknięty nadal można obejrzeć z zewnątrz. Wspomnij o tym w opisie zamiast wyrzucać punkt.
   - Liczy się DROGA MIĘDZY punktami: prowadź deptakami, przez place, parki i uliczki, a nie najkrótszym przejściem.
   - Możesz dać więcej punktów niż przy zwiedzaniu, bo każdy zabiera mniej czasu.

   - Szukaj: rynków, zabytków architektonicznych, muzeów, parków miejskich, tarasów widokowych, bulwarów, znanych kawiarni.
   - LICZY SIĘ CZAS, NIE KILOMETRY. Dzień zwiedzania to 6-10 km marszu i 6-10 przystanków — reszta dnia schodzi na zwiedzanie wnętrz, kawę i jedzenie. Nie nadrabiaj kilometrów dorzucaniem odległych dzielnic.
   - KOLEJNOŚĆ WEDŁUG SĄSIEDZTWA: prowadź trasę dzielnicami, zwiedzając każdą do końca, zanim przejdziesz dalej (np. w Krakowie: całe Stare Miasto → Wawel → Kazimierz → Podgórze). Skakanie tam i z powrotem między dzielnicami to najgorszy możliwy układ.
   - Jeśli dzień wychodzi zbyt napakowany, LEPIEJ USUNĄĆ punkt niż wydłużyć marsz.
   - NIE TWÓRZ TRASY NA SIŁĘ. Dystans i liczba punktów to sufit, nie norma do wyrobienia. Jeśli w okolicy jest 5 naprawdę dobrych miejsc, daj 5 — dorzucanie słabych punktów tylko po to, żeby "wyszły kilometry", psuje trasę. Krótsza i dobra bije dłuższą i rozwodnioną.
   - Przy kilku dniach rozbij miasto na dni TEMATYCZNE/DZIELNICOWE (dzień 1 Stare Miasto, dzień 2 Kazimierz i Podgórze), a nie na jedną wielką pętlę.
   - Uwzględniaj godziny otwarcia i dni zamknięcia muzeów — wspomnij o nich w opisie, jeśli mają znaczenie dla kolejności.
   
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

NAZWY PUNKTÓW: w "add_waypoints" podawaj nazwy W ORYGINALNYM JĘZYKU, tak jak figurują na mapie i w OpenStreetMap — "Kalaja e Krujës", nie "Zamek w Krujë"; "Pazari i Vjetër", nie "Stary Bazar". Nie tłumacz nazw własnych na polski i nie wymyślaj opisowych określeń w rodzaju "Parking przy Starym Bazarze" — takie nazwy nie istnieją w bazie map i trafiają w przypadkowe miejsca na świecie. Polskie tłumaczenie możesz podać w "reply", ale nigdy w nazwie punktu.

SPACER PO MIEŚCIE — ZWARTOŚĆ I RÓŻNORODNOŚĆ (obowiązuje przy pojeździe "city"/"spacer"):
- Punkty mają leżeć BLISKO SIEBIE. Między sąsiednimi przystankami nie więcej niż ok. 1 km marszu; cała trasa ma mieścić się w podanym budżecie kilometrów, a nie w budżecie ambicji. 13 km na "4 godziny z dziećmi" to zepsuty plan, nie bogaty program.
- NIE WIĘCEJ NIŻ DWA obiekty tego samego rodzaju w całej trasie. Sześć kościołów pod rząd to katalog, nie spacer. Przeplataj: zabytek, plac lub rynek, park albo bulwar, punkt widokowy, coś dla dzieci.
- Z DZIEĆMI: między atrakcjami wpleć miejsca, gdzie można usiąść i odpocząć — park, plac zabaw, fontanna, deptak. Wnętrza muzeów i kościołów dawkuj, bo dziecko nie wytrzyma czterech z rzędu.
- Trzymaj się okolicy, w której faktycznie coś jest. Punkt oddalony o kilka kilometrów od reszty wyrzuć, nawet jeśli jest znany — dojście zje czas przeznaczony na zwiedzanie.

DYSTANS WARIANTU: jeśli karta wyboru podaje długość trasy (np. "3.5 km" w subtitle), MUSISZ powtórzyć tę liczbę w jej "implies": {"distance_km": 3.5}. Bez tego sprawdzamy trasę względem innego celu niż ten, który obiecałeś użytkownikowi.

NAZWA TRASY — POLE OBOWIĄZKOWE W KAŻDEJ ODPOWIEDZI:
Do każdego obiektu JSON dokładaj "suggested_title": krótką nazwę oddającą to, o co prosi użytkownik — miejsce plus charakter, 2-5 słów, bez cudzysłowów i bez doklejania słowa "trasa" na siłę.
Dla "chcę coś dla dzieci w Durrës" → "Durrës z dziećmi". Dla przejażdżki po Beskidach → "Pętla beskidzka na motocykl". Dla wieczornego spaceru w Krakowie → "Kraków wieczorem".
Aktualizuj ją, gdy rozmowa doprecyzuje charakter wyjazdu. Nigdy nie zostawiaj jej pustej ani nie pomijaj.

Odpowiedz WYŁĄCZNIE W FORMACIE JSON (bez markdown, czysty JSON):

Przykład 1 — FAZA "discovery": otwierasz rozeznaniem i pytasz o strukturę wyjazdu:
{
  "done": false,
  "phase": "discovery",
  "suggested_title": "Karkonosze w 2 dni",
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
      "id": "custom",
      "title": "Chcę podać własny punkt",
      "subtitle": "hotel, dworzec, adres",
      "description": "Wpisz miejsce, z którego faktycznie ruszasz.",
      "requires_input": true,
      "input_placeholder": "np. Hotel Rogner, Tirana"
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
    const searchData = await callGeminiTracked(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }], tools: [{ googleSearch: {} }] },
      { operation: 'chat-interview', model: 'gemini-2.5-flash', userId: c.get('userId') || null, projectId: project_id || null }
    );
    const rawText = searchData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log("[chat-interview] Gemini raw response (first 500 chars):", rawText.substring(0, 500));

    // Etap 1 zwykle zwraca już gotowy JSON (opakowany w ```json). Jeśli da się go
    // sparsować, druga tura jest zbędna — a była ryzykowna: gubiła punkty trasy,
    // podwajała czas odpowiedzi i przy kartach wyboru potrafiła wpaść w pętlę
    // generowania (138 tys. znaków uciętych w połowie = zerwana rozmowa).
    let directResult: any = null;
    try {
      const stripped = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      // Model z Google Search lubi poprzedzić obiekt zdaniem wstępu ("Witaj! Punkt
      // startu jest doskonały..."). Sam startsWith('{') odrzucał wtedy poprawny
      // JSON i spychał rozmowę do konwersji, która potrafiła urwać się w połowie.
      const firstBrace = stripped.indexOf('{');
      const lastBrace = stripped.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
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
- "phase": string (jedna z: start_point, discovery, variant_choice, refine, confirm, generate)
- "reply": string (odpowiedz agenta po polsku)
- "suggested_title": string (krotka nazwa trasy, 2-5 slow, np. "Spacer po Durres z dziecmi")
- "options": tablica kart wyboru, kazda z polami id, title, subtitle, description, highlights (tablica stringow), implies (obiekt), requires_input (boolean), input_placeholder (string) — TYLKO gdy tekst przedstawia warianty do wyboru
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
            // Limit chroni przed pętlą generowania, ale 8192 nie mieściło tury
            // z dwoma wariantami trasy w kartach — JSON urywał się w połowie
            // stringa i wywalał całą rozmowę.
            maxOutputTokens: 24576
          }
        })
      });

      if (!jsonResponse.ok) {
        throw new Error("Gemini JSON API error " + await jsonResponse.text());
      }

      const jsonData = await jsonResponse.json() as any;
      generatedText = jsonData.candidates?.[0]?.content?.parts?.[0]?.text || null;
      const finish = jsonData.candidates?.[0]?.finishReason;
      if (finish && finish !== 'STOP') {
        console.warn(`[chat-interview] Konwersja niekompletna, finishReason=${finish}, długość=${generatedText?.length ?? 0}`);
      }
    }

    if (directResult || generatedText) {
      let resultObj: any;
      if (directResult) {
        resultObj = directResult;
      } else {
        // Urwana odpowiedź kończyła się błędem 500 i pustym ekranem — rozmowa
        // umierała bez śladu. Lepiej oddać treść z etapu 1 i pozwolić pytać dalej.
        const cleaned = (generatedText as string).replace(/```json/g, '').replace(/```/g, '').trim();
        try {
          resultObj = JSON.parse(cleaned);
        } catch (parseErr: any) {
          console.error(`[chat-interview] Niepoprawny JSON konwersji (${cleaned.length} zn.): ${parseErr.message}`);
          resultObj = {
            done: false,
            phase: 'discovery',
            reply: rawText.trim()
              ? rawText.replace(/```json[\s\S]*$/i, '').trim()
              : 'Coś mi się urwało po drodze. Powtórz proszę ostatnią wiadomość albo doprecyzuj, czego szukasz.',
            options: [],
            allow_custom: true
          };
        }
      }
      
      // Zapowiedź gotowej trasy bez listy punktów kończyła się komunikatem o sukcesie
      // i pustą mapą — w takim wypadku dogenerowujemy samą listę.
      if (resultObj.done === true && (!Array.isArray(resultObj.add_waypoints) || resultObj.add_waypoints.length < 2)) {
        console.warn('[chat-interview] done=true without waypoints — generating the list explicitly.');
        try {
          const list = await generateWaypointList(
            GEMINI_API_KEY, conversationText, trip_profile, poiCandidates, poiRouteType, conversationDistanceKm
          );
          if (list && list.length >= 2) {
            resultObj.add_waypoints = list;
            console.log(`[chat-interview] Recovered ${list.length} waypoints.`);
          } else {
            resultObj.done = false;
            resultObj.reply = `${resultObj.reply}\n\n⚠️ Nie udało mi się ułożyć listy punktów. Napisz proszę, co koniecznie ma się znaleźć na trasie.`;
          }
        } catch (err) {
          console.error('[chat-interview] Waypoint recovery failed:', err);
          resultObj.done = false;
          resultObj.reply = `${resultObj.reply}\n\n⚠️ Nie udało mi się ułożyć listy punktów. Spróbuj ponownie albo doprecyzuj oczekiwania.`;
        }
      }

      // Jeśli agent zasugerował dodanie waypointów, geokodujemy je przed zwróceniem na frontend
      // Domyślne "Nowa Trasa AI" nie mówiło nic ani na liście tras, ani w pliku GPX.
    if (typeof resultObj.suggested_title === 'string') {
      resultObj.suggested_title = resultObj.suggested_title.trim().replace(/^["'„”]+|["'„”]+$/g, '').slice(0, 80);
    }

    // Reguła "nigdy nie generuj trasy w pierwszej odpowiedzi" siedzi w prompcie
    // od dawna, ale model potrafi ją zignorować — zwłaszcza odkąd dostaje z
    // ekranu startowego pojazd, styl i charakter wyjazdu i uznaje, że wie już
    // wszystko. Wtedy użytkownik zamiast rozmowy dostaje od razu mapę z trasą,
    // której nikt z nim nie ustalił. Prompt to prośba, to jest warunek.
    const userTurnCount = messages.filter((m: any) => m.role === 'user').length;
    const lastUserText = [...messages].reverse().find((m: any) => m.role === 'user')?.text || '';
    const explicitGenerate = /(generuj|zrób|rób\b|nie pytaj|bez pyta|od razu|natychmiast)/i.test(lastUserText);
    if (resultObj.done === true && userTurnCount <= 1 && !explicitGenerate && !knowStart) {
      console.log('[chat-interview] Trasa w pierwszej turze bez polecenia — cofam do pytania o start.');
      resultObj.done = false;
      resultObj.phase = 'start_point';
      delete resultObj.add_waypoints;
      delete resultObj.extracted;
      resultObj.allow_custom = true;
      resultObj.reply = 'Zanim wyznaczę przebieg — skąd dokładnie zaczynacie? Start przesądza o kształcie całej trasy, więc wolę o niego zapytać, zamiast zgadywać.';
    }

    if (resultObj.add_waypoints && Array.isArray(resultObj.add_waypoints)) {
        const suggested_waypoints = [];
        // poiCenter to pinezka z mapy albo start ustalony z rozmowy — w obu przypadkach
        // najlepszy punkt odniesienia dla geokodera.
        let biasPoint: {lat: number, lng: number} | undefined = poiCenter || undefined;

        // Kotwica regionu z tego, co agent sam podał w "extracted". Bez niej
        // punktem odniesienia stawał się pierwszy waypoint geokodowany na ślepo,
        // a agent nazywa miejsca po polsku ("Parking przy Starym Bazarze").
        // Nominatim dopasowywał takie nazwy do polskich miejscowości: cała trasa
        // po Krujë dostała kotwicę w Nowym Sączu i wszystkie punkty wypadły
        // jako odstające.
        if (!biasPoint) {
          const anchorName = resultObj.extracted?.region || resultObj.extracted?.start_point;
          if (anchorName) {
            try {
              const anchor = await geocodingService.geocodeSettlement(String(anchorName));
              if (anchor) {
                biasPoint = { lat: anchor.lat, lng: anchor.lng };
                console.log(`[chat-interview] Kotwica regionu: "${anchorName}" -> ${anchor.lat},${anchor.lng}`);
              }
            } catch (e) {
              console.warn(`[chat-interview] Nie udało się zakotwiczyć regionu "${anchorName}"`);
            }
          }
        }

        // Dopiero gdy nie ma ani pinezki, ani regionu: pierwszy punkt na ślepo.
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
        // Punkty były rozwiązywane jeden po drugim, choć zależą od siebie tylko
        // przez biasPoint — a ten ustala się na pierwszym trafieniu i dalej się
        // nie zmienia. Dlatego: sekwencyjnie tylko do momentu ustalenia biasu,
        // reszta równolegle. Pojedyncze zapytanie o punkt to nawet kilka wywołań
        // HTTP (warianty nazwy × przebieg zawężony i globalny), więc przy
        // kilkunastu punktach to była większość czasu odpowiedzi.
        const placeNames: string[] = resultObj.add_waypoints;
        const resolved: Array<{ lat: number; lng: number; name: string; kind?: string } | null> =
          new Array(placeNames.length).fill(null);

        let cursor = 0;
        while (cursor < placeNames.length && !biasPoint) {
          const placeName = placeNames[cursor];
          const matched = poiService.matchCandidate(placeName, poiMatchPool, poiCenter || biasPoint);
          if (matched) {
            resolved[cursor] = { lat: matched.lat, lng: matched.lng, name: placeName, kind: matched.kind };
            biasPoint = { lat: matched.lat, lng: matched.lng };
          } else {
            try {
              const place = await geocodingService.geocodeSinglePoint(placeName, biasPoint, poiRadiusKm);
              if (place) {
                resolved[cursor] = { lat: place.lat, lng: place.lng, name: placeName };
                biasPoint = { lat: place.lat, lng: place.lng };
              }
            } catch (e) {
              console.error("Geocoding failed for place:", placeName, e);
              failed_waypoints.push(placeName);
            }
          }
          cursor++;
        }

        // Dopasowania do POI są darmowe i natychmiastowe — odsiewamy je najpierw,
        // żeby do geokodera trafiło jak najmniej nazw.
        const needGeocoding: number[] = [];
        for (let i = cursor; i < placeNames.length; i++) {
          const placeName = placeNames[i];
          const matched = poiService.matchCandidate(placeName, poiMatchPool, poiCenter || biasPoint);
          if (matched) {
            resolved[i] = { lat: matched.lat, lng: matched.lng, name: placeName, kind: matched.kind };
          } else {
            needGeocoding.push(i);
          }
        }

        // Pętla ma ten sam punkt na starcie i na mecie, więc ta sama nazwa
        // trafiała do geokodera dwa razy — równolegle, czyli obie próby ruszały
        // przed zapisem do cache'u. Jedna nierozpoznana nazwa to nawet sześć
        // wywołań HTTP, a cała tura wpadała przez to w limit czasu bramy.
        const byName = new Map<string, number[]>();
        for (const i of needGeocoding) {
          const key = placeNames[i].trim().toLowerCase();
          const list = byName.get(key);
          if (list) list.push(i);
          else byName.set(key, [i]);
        }
        const uniqueGroups = [...byName.values()];

        // Współbieżność ograniczona: Nominatim prosi o umiar, a i tak zwykle
        // zostaje kilka nazw, bo większość punktów pochodzi już z OSM.
        const GEOCODE_CONCURRENCY = 3;
        for (let from = 0; from < uniqueGroups.length; from += GEOCODE_CONCURRENCY) {
          const batch = uniqueGroups.slice(from, from + GEOCODE_CONCURRENCY);
          await Promise.all(batch.map(async (indices) => {
            const placeName = placeNames[indices[0]];
            try {
              const place = await geocodingService.geocodeSinglePoint(placeName, biasPoint, poiRadiusKm);
              if (place) {
                for (const i of indices) {
                  resolved[i] = { lat: place.lat, lng: place.lng, name: placeNames[i] };
                }
              }
            } catch (e) {
              console.error("Geocoding failed for place:", placeName, e);
              failed_waypoints.push(placeName);
            }
          }));
        }

        // Kolejność punktów decyduje o przebiegu trasy, więc odtwarzamy ją
        // z oryginalnej listy, a nie z kolejności, w jakiej wróciły odpowiedzi.
        for (const wp of resolved) {
          if (wp) suggested_waypoints.push(wp);
        }
        // Walidacja 0: punkt o właściwej nazwie, ale złych współrzędnych.
        // Geokoder potrafi odesłać imiennika z drugiego końca aglomeracji ("Planty"
        // 7 km od Rynku). Zanim uznamy punkt za odległy, próbujemy odzyskać jego
        // prawdziwą lokalizację z listy zweryfikowanych POI.
        // Bez podanego dystansu poiRadiusKm zostaje nieustawiony, a POI i tak są
        // pobierane w promieniu domyślnym — kontrola musi używać tej samej wartości,
        // inaczej cały mechanizm jest po cichu pomijany.
        const anchorRadiusKm = poiRadiusKm ?? poiService.defaultRadiusKm(poiRouteType);
        if (poiCenter && poiMatchPool.length > 0) {
          const maxReasonableKm = anchorRadiusKm * 1.5;
          for (const wp of suggested_waypoints) {
            const distKm = routeValidatorService.distanceKm(poiCenter, wp);
            if (distKm <= maxReasonableKm) continue;
            const nearby = poiMatchPool.find((c) => {
              if (routeValidatorService.distanceKm(poiCenter!, c) > maxReasonableKm) return false;
              return poiService.matchCandidate(wp.name, [c], poiCenter!) !== null;
            });
            if (nearby) {
              console.warn(`[chat-interview] Re-anchored "${wp.name}" from ${distKm.toFixed(1)} km to OSM match at ${routeValidatorService.distanceKm(poiCenter, nearby).toFixed(1)} km`);
              wp.lat = nearby.lat;
              wp.lng = nearby.lng;
            }
          }
        }

        // Walidacja 1: odrzuć punkty absurdalnie oddalone od startu (pomyłki geokodera)
        const routeTypeForValidation = resultObj.extracted?.route_type || (vehicle_type === 'bicycle' ? (bike_subtype || 'cycling') : (vehicle_type || 'hiking'));
        let finalWaypoints = suggested_waypoints;
        if (suggested_waypoints.length > 1) {
          // Punktem odniesienia jest centrum ustalone z miejscowości, a nie pierwszy
          // punkt trasy. Gdy start zgeokodował się źle (Lipsk w Polsce zamiast
          // Leipzig), wszystkie poprawne punkty wypadały jako "zły region".
          const { kept, dropped } = routeValidatorService.filterOutliers(
            poiCenter || suggested_waypoints[0],
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

        let finalKm: number | null = null;
        if (targetKm && finalWaypoints.length >= 3 && poiCandidates.length > 0) {
          for (let pass = 0; pass < 2; pass++) {
            const measuredKm = await measureRouteKm(finalWaypoints);
            const estimatedKm = measuredKm ?? routeValidatorService.estimateChainKm(finalWaypoints, routeTypeForValidation);
            finalKm = estimatedKm;
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
                const matched = poiService.matchCandidate(name, poiMatchPool, poiCenter || biasPoint);
                if (matched) {
                  rebuilt.push({ lat: matched.lat, lng: matched.lng, name, kind: matched.kind });
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
              finalKm = newEstimate;
            } catch (corrErr) {
              console.warn('[chat-interview] Waypoint correction failed, keeping original:', corrErr);
              break;
            }
          }
        }

        resultObj.suggested_waypoints = finalWaypoints;

        // Gdy korekta nie dowiozła obiecanej długości, użytkownik dowiadywał się
        // o tym dopiero z mapy: agent pisał o 3,5 km, a trasa miała 1,3 km.
        // Zamiast udawać, że wszystko się zgadza, mówimy to wprost i podpowiadamy
        // najbliższy ruch — sam rozjazd zwykle znaczy, że w okolicy nie ma z czego
        // ułożyć dłuższej pętli.
        if (targetKm && finalKm && Math.abs(finalKm - targetKm) / targetKm > 0.25) {
          resultObj.route_distance_km = Math.round(finalKm * 10) / 10;
          const shorter = finalKm < targetKm;
          resultObj.reply = `${resultObj.reply}\n\n---\n\n**Trasa wyszła ${finalKm.toFixed(1)} km**, a celowaliśmy w ok. ${targetKm} km. ` +
            (shorter
              ? 'W tej okolicy nie ma więcej sensownych punktów w zasięgu spaceru — napisz, czy dorzucić coś dalej od centrum, czy zostawiamy krócej i spokojniej.'
              : 'Wyszło dłużej, niż zakładaliśmy — napisz, czy skracamy, czy zostawiamy w tej formie.');
        }

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
