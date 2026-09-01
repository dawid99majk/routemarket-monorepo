import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RouteRequirementsSchema } from '../types/index.js';
import { repo } from '../db/repository.js';
import { routingService } from '../services/routing.js';
import { gpxService } from '../services/gpx.js';
import { reportService } from '../services/report.js';
import { gpxParserService } from '../services/gpx-parser.js';
import { routeValidatorService } from '../services/route-validator.js';
import { authMiddleware } from '../middleware/auth.js';
import { ensureTokens, TOKEN_PRICES } from '../services/tokens.js';

export const routeProjectsRouter = new Hono<{ Variables: { user: any, userId: string } }>();

routeProjectsRouter.use('/route-projects/*', authMiddleware);

// Listowanie projektów
routeProjectsRouter.get('/route-projects', async (c) => {
  const user = c.get('user');
  try {
    const projects = await repo.listProjects(user);
    return c.json(projects);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Tworzenie projektu
routeProjectsRouter.post('/route-projects', zValidator('json', RouteRequirementsSchema), async (c) => {
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
routeProjectsRouter.get('/route-projects/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const project = await repo.getProject(id);
  if (!project) return c.json({ error: 'Not found' }, 404);
  if (!repo.canAccessProject(project, user)) return c.json({ error: 'Forbidden' }, 403);
  return c.json(project);
});

// Aktualizacja projektu
routeProjectsRouter.patch('/route-projects/:id', zValidator('json', RouteRequirementsSchema.partial()), async (c) => {
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
routeProjectsRouter.get('/route-projects/:id/artifacts', async (c) => {
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
routeProjectsRouter.get('/route-projects/:id/artifacts/:type', async (c) => {
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
routeProjectsRouter.get('/route-projects/:id/gpx', async (c) => {
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
routeProjectsRouter.post('/route-projects/:id/gpx', async (c) => {
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
routeProjectsRouter.post('/route-projects/:id/select-alternative', async (c) => {
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
routeProjectsRouter.post('/route-projects/:id/jobs', async (c) => {
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

routeProjectsRouter.get('/route-projects/:id/jobs/:jobId', async (c) => {
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
routeProjectsRouter.post('/live-route', async (c) => {
  try {
    const tokenUserId = c.get('userId') || null;
    const shortfall = await ensureTokens(tokenUserId, 'live-route');
    if (shortfall) return c.json({ error: shortfall, needs_tokens: true }, 402);
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

    await repo.chargeTokens(tokenUserId!, TOKEN_PRICES['live-route'], 'wyznaczenie trasy');
    return c.json({ ...route, validation });
  } catch (err: any) {
    console.error('[LiveRoute] Error:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Proxy do twardej geometrii Atlasa
routeProjectsRouter.post('/route-projects/atlas/geometry', async (c) => {
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
routeProjectsRouter.post('/route-projects/atlas/research', async (c) => {
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
