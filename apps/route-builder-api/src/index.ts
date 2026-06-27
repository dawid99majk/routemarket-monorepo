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

const app = new Hono<{ Variables: { user: any, userId: string } }>();

// Healthcheck
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '2.0.0', service: 'route-builder-api' });
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
    const { messages, project_id, input_notes, current_waypoints, vehicle_type, bike_subtype, routing_preference } = await c.req.json() as { 
      messages: {role: string, text: string}[], 
      project_id?: string, 
      input_notes?: string,
      current_waypoints?: {lat: number, lng: number}[],
      vehicle_type?: string,
      bike_subtype?: string,
      routing_preference?: string
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
          projectContext = `\nAktualny stan projektu:
Trasa: z ${project.requirements.start_point || '?'} do ${project.requirements.end_point || '?'}
Typ: ${project.requirements.route_type || '?'}
Dystans docelowy: ${project.requirements.distance_target_km || '?'} km`;
        }
      } catch (err) {
        console.warn('Could not fetch project for chat notes context', err);
      }
    }

    if (routing_preference) {
      const prefText = routing_preference === 'popular' ? 'KLASYKI REGIONU (wybieraj najbardziej znane, turystyczne, popularne i sprawdzone punkty)' : 'POZA UTARTYM SZLAKIEM (szukaj ukrytych perełek, unikaj tłumów, wybieraj boczne dróżki i dzikie zakątki)';
      projectContext += `\n\n[PREFERENCJA TRASY] Użytkownik wybrał styl: **${prefText}**. Dopasuj do tego swoje rekomendacje!`;
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
      projectContext += `\n\n[KONTEKST UI] Użytkownik ma zaznaczony typ pojazdu w aplikacji: **${vehicle_type}${bike_subtype ? ` (typ: ${bike_subtype})` : ''}**. Nie pytaj już o środek transportu!`;
    }

    const conversationText = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

    // Determine what we already know from UI context
    const knowStart = current_waypoints && current_waypoints.length > 0;
    const knowVehicle = !!vehicle_type;
    const knownCount = [knowStart, knowVehicle].filter(Boolean).length;

    const prompt = `Jesteś ekspertem podróżniczym i licencjonowanym przewodnikiem Atlas Agent. Twoje zadanie: zebrać dane o trasie, zaplanować PRZEMYŚLANĄ, CIEKAWĄ i spójną geograficznie trasę, a następnie SZYBKO JĄ WYGENEROWAĆ.

${projectContext}

=== CO JUŻ WIEMY (z interfejsu, NIE pytaj o to!) ===
${knowStart ? '✅ PUNKT STARTOWY - znamy z pinezki na mapie' : '❌ Brak punktu startowego - zapytaj!'}
${knowVehicle ? `✅ POJAZD - ${vehicle_type}${bike_subtype ? ` (${bike_subtype})` : ''} - wybrane w interfejsie` : '❌ Brak pojazdu - zapytaj!'}

=== CZEGO JESZCZE BRAKUJE ===
MUSISZ JESZCZE ZEBRAĆ (jeśli nie padło w rozmowie):
- DYSTANS lub CZAS (np. "25km", "na 3 godziny")
- PĘTLA czy LINIOWA? Domyślnie zakładaj pętlę.
- PREFERENCJE terenu (np. gravel, szuter, leśne drogi, itp.) - ale jeśli już znamy pojazd typu gravel, nie pytaj o to!

=== ZASADY DZIAŁANIA ===
1. Jeśli znamy już START + POJAZD i użytkownik podał DYSTANS → NATYCHMIAST generuj trasę (done: true). Nie pytaj o nic więcej!
2. Jeśli użytkownik nie był zadowolony z trasy i mówi "nie podoba mi się" / "przebuduj" / "inaczej" → WYGENERUJ NATYCHMIAST nową trasę (done: true) ze zmienionymi punktami. NIE PYTAJ O SZCZEGÓŁY!
3. Pytaj tylko o JEDNO brakujące pole naraz.
4. Bądź energiczny i konkretny, maksymalnie 2 zdania w odpowiedzi.

=== ZASADY SELEKCJI PUNKTÓW (JAKOŚĆ I LOGIKA) ===
Nie wybieraj przypadkowych punktów geometrycznych ani losowych małych wsi bez znaczenia turystycznego! Zamiast tego dobieraj punkty reprezentujące rzeczywiste atrakcje, walory przyrodnicze lub znane szlaki dla danego pojazdu:

1. pieszo (hiking / route_type = hiking):
   - Szukaj: szczytów, przełęczy, schronisk turystycznych, wodospadów, formacji skalnych, polan leśnych, rezerwatów przyrody.
   - BEZWZGLĘDNY zakaz prowadzenia tras po miastach i drogach asfaltowych (poza punktem startu/mety).
   - PRZYKŁAD (Karkonosze z Karpacza): ["Karpacz, Świątynia Wang", "Schronisko Samotnia, Karpacz", "Schronisko Strzecha Akademicka, Karpacz", "Śnieżka, Karkonosze", "Schronisko nad Łomniczką, Karpacz", "Karpacz"]

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
   
=== WAŻNE: FORMATOWANIE PUNKTÓW DLA GEOKODERA ===
Aby geokoder bezbłędnie zlokalizował punkty pośrednie, każdy punkt w tablicy "add_waypoints" MUSI być podany w formacie:
"NAZWA ATRAKCJI/PUNKTU, NAJBLIŻSZA MIEJSCOWOŚĆ lub REGION" (np. "Schronisko Odrodzenie, Karkonosze", "Wodospad Szklarki, Szklarska Poręba", "Zamek Chojnik, Jelenia Góra", "Postolin (wieża widokowa), Milicz").
Unikaj podawania samych gołych, pospolitych nazw typu "Stawno" czy "Laskowa", bo geokoder znajdzie je w innej części Polski! Zawsze dodawaj kontekst geograficzny (np. "Stawno, Milicz" lub "Laskowa, Milicz").

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

Przykład gdy pytasz o brakujący dystans:
{
  "done": false,
  "reply": "Świetnie! Widzę pinezkę w okolicach Milicza i wybrany Gravel. Jaki dystans planujesz — 25km, 40km, dłużej?"
}

Przykład gdy generujesz gotową pętlę (done: true) — WŁAŚCIWY OKRĄG:
{
  "done": true,
  "reply": "Wytyczyłem rewelacyjną pętlę gravelową ~25km wokół Milicza! Trasa okrąża Stawy Milickie i wiedzie wzdłuż rzeki Barycz — mnóstwo szutru i brak asfaltu. Sprawdź mapę!",
  "add_waypoints": ["Milicz", "Stawno (stawy), Milicz", "Jaz Grabownica, Milicz", "Postolin, Milicz", "Sułów, Milicz", "Milicz"],
  "extracted": {
    "start_point": "Milicz",
    "end_point": "Milicz",
    "route_type": "gravel",
    "distance": "25",
    "intent": "pętla gravelowa 25km Milicz Stawy Milickie Barycz",
    "loop": true,
    "key_waypoints": ["Stawno, Milicz", "Jaz Grabownica, Milicz", "Sułów, Milicz"]
  }
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
      
      // Jeśli agent zasugerował dodanie waypointów, geokodujemy je przed zwróceniem na frontend
      if (resultObj.add_waypoints && Array.isArray(resultObj.add_waypoints)) {
        const suggested_waypoints = [];
        let biasPoint: {lat: number, lng: number} | undefined = undefined;
        
        if (current_waypoints && current_waypoints.length > 0) {
          biasPoint = { lat: current_waypoints[0].lat, lng: current_waypoints[0].lng };
        }
        
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

        for (const placeName of resultObj.add_waypoints) {
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
          }
        }
        resultObj.suggested_waypoints = suggested_waypoints;
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
    const { text: newReportText, sources } = await reportService.generateShortReport(route, project.requirements);

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
    let job = await repo.createJob(projectId);

    // Sprawdzenie czy istnieje GPX
    const gpxArtifact = await repo.getArtifactByType(projectId, 'gpx');
    const summaryArtifact = await repo.getArtifactByType(projectId, 'summary');

    if (gpxArtifact && summaryArtifact) {
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

          // Generujemy warianty na bazie pierwszego/ostatniego punktu
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

    const reqs = project.requirements;
    const missingInputs: string[] = [];
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let newStatus: typeof job.status = 'running';
    
    if (!reqs.end_point && !reqs.loop) {
      newStatus = 'waiting_for_user';
      errorCode = 'missing_end_or_loop_permission';
      errorMessage = 'Do wygenerowania GPX potrzebuję punktu końcowego albo zgody na zaproponowanie pętli.';
      missingInputs.push('end_point');
    } else if (!reqs.distance_target_km && !reqs.duration_target_h && reqs.loop) {
      newStatus = 'waiting_for_user';
      errorCode = 'missing_distance_for_loop';
      errorMessage = 'Aby wygenerować pętlę, musisz podać oczekiwany dystans (w km) lub czas (w h).';
      missingInputs.push('distance_target_km');
    }

    if (newStatus === 'waiting_for_user') {
      job = await repo.updateJobState(job.id, {
        status: newStatus,
        error_code: errorCode,
        error_message: errorMessage,
        missing_inputs: missingInputs,
        human_message: errorMessage || 'Brakuje wymaganych danych wejściowych.',
        current_step: 'validation_failed'
      });
      return c.json(job, 201);
    }
    
    job = await repo.updateJobState(job.id, {
      status: 'running',
      current_step: 'geocoding',
      human_message: 'Geokodowanie punktów...'
    });
    
    // Zautomatyzowany pipeline MVP v2
    (async () => {
      try {
        const places = await geocodingService.geocodePoints(reqs.start_point || '', reqs.end_point, { 
          loop: reqs.loop,
          distanceTargetKm: reqs.distance_target_km,
          intent: reqs.input_notes || '',
          routeType: reqs.route_type,
          keyWaypoints: reqs.key_waypoints || []
        });
        await repo.updateJobState(job.id, { 
          progress: 30, 
          current_step: 'routing', 
          human_message: 'Wyznaczanie trasy...' 
        });

        const route = await routingService.getRoute(places, reqs.route_type, {
          intent: reqs.input_notes || '',
          surfacePreferences: reqs.surface_preferences || [],
          distanceTargetKm: reqs.distance_target_km || undefined,
          difficulty: reqs.difficulty
        });
        await repo.updateJobState(job.id, { 
          progress: 60, 
          current_step: 'building_artifacts', 
          human_message: 'Budowanie artefaktów (GPX, Raport)...' 
        });

        const gpx = gpxService.buildGpx(route, project.id);
        const { text: reportText, sources } = await reportService.generateShortReport(route, reqs);
        const alternatives = await routingService.getRouteAlternatives(places, reqs.route_type, reqs.surface_preferences);
        
        // Save Artifacts
        await Promise.all([
          repo.upsertArtifact(project.id, 'gpx', { raw_data: gpx }),
          repo.upsertArtifact(project.id, 'report', { raw_data: reportText }),
          repo.upsertArtifact(project.id, 'research_sources', { content: sources }),
          repo.upsertArtifact(project.id, 'places', { content: places }),
          repo.upsertArtifact(project.id, 'alternatives', { content: alternatives }),
          repo.upsertArtifact(project.id, 'summary', { content: {
            distance_km: route.distance_km,
            duration_h: route.duration_h,
            points_count: route.trackPoints.length,
            track: route.trackPoints
          }})
        ]);
        
        console.log(`[Job ${job.id}] Pipeline logic finished. Artifacts saved.`);

        await repo.updateJobState(job.id, {
          status: 'ready',
          progress: 100,
          current_step: 'completed',
          human_message: 'Trasa gotowa do podglądu.'
        });
      } catch (err: any) {
        console.error(`[Job ${job.id}] FAILED:`, err);
        await repo.updateJobState(job.id, {
          status: 'failed',
          error_message: err.message
        }).catch(console.error);
      }
    })();
    
    return c.json(job, 201);
  } catch (err: any) {
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

  const job = await repo.getJob(jobId);
  if (!job) return c.json({ error: 'Not found' }, 404);
  return c.json(job);
});

// Fast endpoint for live routing on the interactive map
app.post('/live-route', async (c) => {
  try {
    const { points, route_type, surface_preferences, intent } = await c.req.json();
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

    return c.json(route);
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
