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
    const { messages } = await c.req.json() as { messages: {role: string, text: string}[] };
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const conversationText = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    const prompt = `Jesteś dociekliwym i profesjonalnym ekspertem podróżniczym Atlas Agent. Twoim zadaniem jest zebranie informacji o planowanej trasie.
ABY ZAKOŃCZYĆ WYWIAD, MUSISZ ZEBRAĆ DOKŁADNIE 5 INFORMACJI:
1. PRECYZYJNY punkt startowy (konkretna miejscowość, parking, schronisko — NIE region). Jeśli użytkownik podaje region (np. "Karkonosze"), zapytaj skąd dokładnie startujemy.
2. Środek transportu / Typ trasy (np. rower szosowy, motocykl, auto, pieszo).
3. Oczekiwany dystans (w kilometrach) lub czas trwania (np. "20km", "na cały dzień").
4. Punkt końcowy LUB zgoda na pętlę. Jeśli to trasa liniowa (np. "grzbietem"), spytaj o punkt końcowy.
5. Specjalne preferencje / charakter terenu (np. "grzbietem", "leśnymi drogami", "unikaj asfaltu", "szlaki turystyczne"). To KLUCZOWE.

ZASADY:
- Nie kończ wywiadu, dopóki użytkownik nie określi dystansu/czasu oraz specjalnych preferencji!
- Gdy użytkownik mówi o KONKRETNYM szlaku (np. "grzbiet Karkonoszy", "Główny Szlak Sudecki"), zaproponuj znane punkty pośrednie (np. Szrenica, Śnieżka, Karpacz).
- Wyodrębnij PUNKT STARTOWY i PUNKT KOŃCOWY jako osobne pola.
- Jeśli użytkownik chce trasę "grzbietem" lub "wzdłuż czegoś", to NIE jest pętla — to trasa liniowa.
- Zadawaj tylko JEDNO, maksymalnie DWA krótkie pytania naraz.
- Gdy zdobędziesz WSZYSTKIE wymagane elementy, dopiero wtedy zwróć "done": true i sformatuj JSON.
- Domyślny \`distance\` ustawiaj w km jako liczbę (np. "30").
- Kategorie \`route_type\` do wyboru to wyłącznie: motorcycle, cycling, gravel, hiking, city_walk.

Oto historia czatu:
${conversationText}

Odpowiedz ZAWSZE W FORMACIE JSON (bez znaczników markdown, czysty json):
Przykład, gdy brakuje dystansu i startu:
{
  "done": false,
  "reply": "Super, Karkonosze pieszo to wspaniały wybór! Z jakiej miejscowości chciałbyś wystartować i na jaki dystans (w km) się nastawiasz?"
}

Przykład, gdy masz KOMPLET danych:
{
  "done": true,
  "reply": "Wszystko jasne! Rozpoczynam planowanie trasy z Szklarskiej Poręby do Karpacza, ok. 50km, szlakami turystycznymi.",
  "extracted": {
    "start_point": "Szklarska Poręba",
    "end_point": "Karpacz",
    "route_type": "hiking",
    "distance": "50",
    "intent": "trasa grzbietem Karkonoszy, szlakami turystycznymi, unikanie dróg asfaltowych",
    "loop": false,
    "key_waypoints": ["Szrenica", "Łabski Szczyt", "Wielki Szyszak", "Śnieżka"],
    "surface_preferences": ["trail", "mountain_path"],
    "difficulty": "moderate"
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
      return c.json(JSON.parse(cleanText));
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
