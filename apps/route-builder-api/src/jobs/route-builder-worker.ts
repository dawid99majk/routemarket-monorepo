import { repo } from '../db/repository.js';
import { RouteBuilderJob, RouteProject } from '../types/index.js';
import { geocodingService } from '../services/geocoding.js';
import { routingService } from '../services/routing.js';
import { gpxService } from '../services/gpx.js';
import { reportService } from '../services/report.js';

const WORKER_ID = process.env.HOSTNAME || `route-builder-${process.pid}`;
const POLL_INTERVAL_MS = Number(process.env.ROUTE_BUILDER_WORKER_INTERVAL_MS || 2500);
const STALE_AFTER_MINUTES = Number(process.env.ROUTE_BUILDER_JOB_STALE_MINUTES || 15);
const MAX_JOBS_PER_TICK = Number(process.env.ROUTE_BUILDER_WORKER_BATCH_SIZE || 1);

let workerStarted = false;
let workerBusy = false;
let timer: NodeJS.Timeout | null = null;

export function validateProjectForJob(project: RouteProject) {
  const reqs = project.requirements;
  const missingInputs: string[] = [];
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  if (!reqs.end_point && !reqs.loop) {
    errorCode = 'missing_end_or_loop_permission';
    errorMessage = 'Do wygenerowania GPX potrzebuję punktu końcowego albo zgody na zaproponowanie pętli.';
    missingInputs.push('end_point');
  } else if (!reqs.distance_target_km && !reqs.duration_target_h && reqs.loop) {
    errorCode = 'missing_distance_for_loop';
    errorMessage = 'Aby wygenerować pętlę, musisz podać oczekiwany dystans (w km) lub czas (w h).';
    missingInputs.push('distance_target_km');
  }

  if (!errorCode) return { ok: true as const };
  return {
    ok: false as const,
    errorCode,
    errorMessage,
    missingInputs
  };
}

async function buildGpxProject(job: RouteBuilderJob, project: RouteProject) {
  await repo.updateJobState(job.id, {
    current_step: 'building_artifacts',
    progress: 60,
    human_message: 'Generowanie przewodnika dla wgranej trasy GPX...'
  });

  const summaryArtifact = await repo.getArtifactByType(project.id, 'summary');
  if (!summaryArtifact?.content?.track) {
    throw new Error('Brakuje podsumowania GPX. Wgraj plik jeszcze raz.');
  }

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

  let alternatives: any[];
  try {
    alternatives = await routingService.getRouteAlternatives(places as any[], project.requirements.route_type);
  } catch (altErr: any) {
    console.warn(`[Job ${job.id}] Alternative generation skipped for GPX flow: ${altErr.message}`);
    alternatives = [{
      id: 'variant-original-gpx',
      name: 'Oryginalny ślad GPX',
      color: '#10b981',
      distance_km: summary.distance_km,
      duration_h: summary.duration_h,
      track: trackPoints,
      pois: places
    }];
  }

  await Promise.all([
    repo.upsertArtifact(project.id, 'report', { raw_data: reportText }),
    repo.upsertArtifact(project.id, 'research_sources', { content: sources }),
    repo.upsertArtifact(project.id, 'alternatives', { content: alternatives }),
    repo.upsertArtifact(project.id, 'places', { content: places })
  ]);

  await repo.updateJobState(job.id, {
    status: 'ready',
    progress: 100,
    current_step: 'completed',
    human_message: 'Gotowe! Przewodnik dla Twojej trasy GPX został wygenerowany.',
    locked_by: null,
    locked_at: null
  });
}

async function buildGeneratedProject(job: RouteBuilderJob, project: RouteProject) {
  const reqs = project.requirements;

  await repo.updateJobState(job.id, {
    current_step: 'geocoding',
    progress: 10,
    human_message: 'Geokodowanie punktów...'
  });

  const places = await geocodingService.geocodePoints(reqs.start_point || '', reqs.end_point, {
    loop: reqs.loop,
    distanceTargetKm: reqs.distance_target_km
  });

  await repo.updateJobState(job.id, {
    progress: 30,
    current_step: 'routing',
    human_message: 'Wyznaczanie trasy...'
  });

  const route = await routingService.getRoute(places, reqs.route_type);

  await repo.updateJobState(job.id, {
    progress: 60,
    current_step: 'building_artifacts',
    human_message: 'Budowanie artefaktów GPX i przewodnika...'
  });

  const gpx = gpxService.buildGpx(route, project.id);
  const { text: reportText, sources } = await reportService.generateShortReport(route, reqs);
  let alternatives: any[];
  try {
    alternatives = await routingService.getRouteAlternatives(places, reqs.route_type, reqs.surface_preferences);
  } catch (altErr: any) {
    console.warn(`[Job ${job.id}] Alternative generation skipped: ${altErr.message}`);
    alternatives = [{
      id: 'variant-base',
      name: 'Trasa bazowa',
      color: '#10b981',
      distance_km: route.distance_km,
      duration_h: route.duration_h,
      track: route.trackPoints,
      pois: places.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng }))
    }];
  }

  await Promise.all([
    repo.upsertArtifact(project.id, 'gpx', { raw_data: gpx }),
    repo.upsertArtifact(project.id, 'report', { raw_data: reportText }),
    repo.upsertArtifact(project.id, 'research_sources', { content: sources }),
    repo.upsertArtifact(project.id, 'places', { content: places }),
    repo.upsertArtifact(project.id, 'alternatives', { content: alternatives }),
    repo.upsertArtifact(project.id, 'summary', {
      content: {
        distance_km: route.distance_km,
        duration_h: route.duration_h,
        points_count: route.trackPoints.length,
        track: route.trackPoints
      }
    })
  ]);

  await repo.updateJobState(job.id, {
    status: 'ready',
    progress: 100,
    current_step: 'completed',
    human_message: 'Trasa gotowa do podglądu.',
    locked_by: null,
    locked_at: null
  });
}

async function processClaimedJob(job: RouteBuilderJob) {
  const project = await repo.getProject(job.project_id);
  if (!project) {
    await repo.updateJobState(job.id, {
      status: 'failed',
      current_step: 'project_missing',
      error_message: 'Projekt nie istnieje.',
      locked_by: null,
      locked_at: null
    });
    return;
  }

  const validation = validateProjectForJob(project);
  const gpxArtifact = await repo.getArtifactByType(project.id, 'gpx');
  const summaryArtifact = await repo.getArtifactByType(project.id, 'summary');

  if (!validation.ok && !(gpxArtifact && summaryArtifact)) {
    await repo.updateJobState(job.id, {
      status: 'waiting_for_user',
      error_code: validation.errorCode,
      error_message: validation.errorMessage,
      missing_inputs: validation.missingInputs,
      human_message: validation.errorMessage || 'Brakuje wymaganych danych wejściowych.',
      current_step: 'validation_failed',
      locked_by: null,
      locked_at: null
    });
    return;
  }

  try {
    if (gpxArtifact && summaryArtifact) {
      await buildGpxProject(job, project);
    } else {
      await buildGeneratedProject(job, project);
    }
    console.log(`[Job ${job.id}] Pipeline finished.`);
  } catch (err: any) {
    console.error(`[Job ${job.id}] FAILED:`, err);
    await repo.updateJobState(job.id, {
      status: 'failed',
      current_step: 'failed',
      error_message: err.message,
      locked_by: null,
      locked_at: null
    }).catch(console.error);
  }
}

async function workerTick() {
  if (workerBusy) return;
  workerBusy = true;

  try {
    const requeued = await repo.requeueStaleRunningJobs(STALE_AFTER_MINUTES);
    if (requeued > 0) {
      console.warn(`[RouteBuilderWorker] Requeued ${requeued} stale job(s).`);
    }

    for (let i = 0; i < MAX_JOBS_PER_TICK; i += 1) {
      const job = await repo.claimNextQueuedJob(WORKER_ID);
      if (!job) break;
      await processClaimedJob(job);
    }
  } catch (err) {
    console.error('[RouteBuilderWorker] tick failed:', err);
  } finally {
    workerBusy = false;
  }
}

export function wakeRouteBuilderWorker() {
  void workerTick();
}

export function startRouteBuilderWorker() {
  if (workerStarted) return;
  workerStarted = true;
  console.log(`[RouteBuilderWorker] starting as ${WORKER_ID}`);
  void workerTick();
  timer = setInterval(() => void workerTick(), POLL_INTERVAL_MS);
  timer.unref?.();
}
