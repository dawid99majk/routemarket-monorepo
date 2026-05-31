import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";
import { AtlasWorkflowService } from "@routemarket/atlas-workflow/src/index.js";
import { FileProjectRepository, PostgresProjectRepository } from "@routemarket/atlas-core/src/index.js";
import { badRequest, HttpError, notFound, unauthorized } from "./errors.js";
import { reviewerPageHtml } from "./reviewer-page.js";
import { JobManager } from "./jobs.js";
import {
  CreateProjectBodySchema,
  DiscoverBodySchema,
  EmptyBodySchema,
  AddGpxBodySchema,
  AddLinkBodySchema,
  AddNoteBodySchema,
  RemoveInputBodySchema,
  RegisterExternalInputBodySchema,
  ArchiveProjectBodySchema,
  CollectSourcesBodySchema,
  DeepResearchBodySchema,
  JobApprovalBodySchema,
  PruneJobsBodySchema,
  SubmitReviewDecisionBodySchema,
  SubmitStageApprovalBodySchema,
  UpdateProjectStatusBodySchema,
  WriteProjectFileBodySchema,
  GeometryBodySchema,
  ResearchBodySchema
} from "./schemas.js";

import { GoogleRoutesRoutingProvider } from "@routemarket/atlas-gis/src/routing/google-routes-provider.js";
import { buildGpxXml } from "@routemarket/atlas-gis/src/gpx-builder.js";

import type { ProjectRepository } from "@routemarket/atlas-core/src/index.js";

export type AtlasApiOptions = {
  rootDir: string;
  port?: number;
  corsOrigin?: string;
  apiToken?: string;
  logRequests?: boolean;
  maxJobs?: number;
  jobsDir?: string;
  repository?: ProjectRepository;
};

type RouteParams = Record<string, string>;
type HandlerContext = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: RouteParams;
  service: AtlasWorkflowService;
  jobs: JobManager;
  corsOrigin: string;
  apiToken?: string;
  requestId: string;
  workflowId?: string;
};

type Handler = (context: HandlerContext) => Promise<unknown>;

type Route = {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  public?: boolean;
};

function validateApprovalStage(stage: string) {
  if (!/^[a-z0-9_]+$/.test(stage)) {
    throw badRequest(`Invalid approval stage provided: "${stage}".`);
  }
}

function validateSlug(slug: string) {
  // Strict alphanumeric slug validation to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw badRequest(`Invalid slug provided: "${slug}". Only lowercase letters, numbers, and dashes are allowed.`);
  }
}

export function createAtlasApiServer(options: AtlasApiOptions): Server {
  const repository = options.repository ?? new FileProjectRepository(options.rootDir);
  const service = new AtlasWorkflowService({ rootDir: options.rootDir, repository });
  const jobs = new JobManager({ maxJobs: options.maxJobs, jobsDir: options.jobsDir, repository });
  const corsOrigin = options.corsOrigin ?? "*";
  const apiToken = options.apiToken;
  const logRequests = options.logRequests ?? false;
  const routes = createRoutes();

  return createServer(async (req, res) => {
    const startedAt = Date.now();
    setCorsHeaders(res, corsOrigin, req.headers.origin as string | undefined);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const matchedRoute = matchRoute(routes, req.method ?? "GET", url.pathname);
    const requestId = req.headers["x-request-id"] as string || randomUUID();
    let errorToLog: unknown = undefined;

    if (!matchedRoute) {
      sendError(res, notFound("Endpoint not found."));
      if (logRequests) {
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: "WARN", method: req.method ?? "GET", url: url.pathname, status: res.statusCode, durationMs: Date.now() - startedAt, requestId, message: "Endpoint not found" }));
      }
      return;
    }

    try {
      if (apiToken && !matchedRoute.public) assertAuthorized(req, apiToken);
      if (matchedRoute.params.slug) validateSlug(matchedRoute.params.slug);

      const result = await matchedRoute.handler({
        req,
        res,
        url,
        params: matchedRoute.params,
        service,
        jobs,
        corsOrigin,
        apiToken,
        requestId,
      });
      if (!res.writableEnded) sendJson(res, 200, result);
    } catch (error) {
      errorToLog = error;
      sendError(res, error);
    } finally {
      if (logRequests) {
        const logLevel = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
        const logData: any = {
          timestamp: new Date().toISOString(),
          level: logLevel,
          method: req.method ?? "GET",
          url: url.pathname,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
          requestId,
          message: `${req.method ?? "GET"} ${url.pathname} completed`
        };
        if (errorToLog) {
          logData.error = errorToLog instanceof Error ? errorToLog.message : String(errorToLog);
          if (errorToLog instanceof Error && errorToLog.stack) logData.stack = errorToLog.stack;
        }
        console.log(JSON.stringify(logData));
      }
    }
  });
}

export function startAtlasApi(options: AtlasApiOptions): Server {
  const server = createAtlasApiServer(options);
  const port = options.port ?? 8787;
  server.listen(port, () => {
    console.log(`Atlas API listening on http://localhost:${port}`);
  });
  return server;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p = 0.017453292519943295;
  const c = Math.cos;
  const a = 0.5 - c((lat2 - lat1) * p)/2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p))/2;
  return 12742 * Math.asin(Math.sqrt(a)); 
}

function expandWaypoints(waypoints: {lat: number, lng: number}[], targetDistanceKm: number) {
  if (waypoints.length < 2) return waypoints;
  let totalDirect = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDirect += calculateDistance(waypoints[i].lat, waypoints[i].lng, waypoints[i+1].lat, waypoints[i+1].lng);
  }
  if (totalDirect >= targetDistanceKm * 0.9) return waypoints;

  const expanded = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i+1];
    const midLat = (start.lat + end.lat) / 2;
    const midLng = (start.lng + end.lng) / 2;
    const dx = end.lng - start.lng;
    const dy = end.lat - start.lat;
    const length = Math.sqrt(dx*dx + dy*dy);
    
    if (length > 0) {
      const nx = -dy / length;
      const ny = dx / length;
      const segmentTarget = targetDistanceKm * (calculateDistance(start.lat, start.lng, end.lat, end.lng) / totalDirect);
      const segmentDirect = calculateDistance(start.lat, start.lng, end.lat, end.lng);
      const requiredHeightKm = Math.sqrt(Math.max(0, Math.pow(segmentTarget/2, 2) - Math.pow(segmentDirect/2, 2)));
      
      const latRatio = 111;
      const lngRatio = 111 * Math.cos((midLat * Math.PI) / 180);
      const offsetLat = (ny * requiredHeightKm) / latRatio;
      const offsetLng = (nx * requiredHeightKm) / lngRatio;
      
      expanded.push({ lat: midLat + offsetLat, lng: midLng + offsetLng });
    }
    expanded.push(end);
  }
  return expanded;
}

function createRoutes(): Route[] {
  return [
    route("POST", "/api/routes/geometry", async ({ req }) => {
      const body = GeometryBodySchema.parse(await readJson(req));
      const expandedWaypoints = expandWaypoints(body.waypoints, body.targetDistance);
      
      const provider = new GoogleRoutesRoutingProvider();
      const result = await provider.getRoute(expandedWaypoints as any, body.category as any);
      const gpx = buildGpxXml(result);

      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

      const fileName = `generated-${Date.now()}.gpx`;
      const response = await fetch(`${supabaseUrl}/storage/v1/object/routes-gpx/${fileName}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/gpx+xml",
        },
        body: gpx
      });

      if (!response.ok) throw new Error("Supabase upload failed: " + await response.text());

      return {
        url: `${supabaseUrl}/storage/v1/object/public/routes-gpx/${fileName}`,
        distanceKm: result.distanceKm,
        geometry: result.geometryGeoJson
      };
    }),
    route("POST", "/api/routes/research", async ({ req, service }) => {
      const body = ResearchBodySchema.parse(await readJson(req));
      
      const project = await service.createProject({
        topic: body.userIntent.substring(0, 50) || "AI Researched Route",
        category: "touring"
      });

      const gpxContent = await fetch(body.gpxUrl).then(r => r.text());
      await service.addGpxText(project.id, { content: gpxContent, fileName: "route.gpx" });
      await service.addNoteText(project.id, { content: body.userIntent, fileName: "user_intent.md" });

      await service.runDeepResearch(project.id, { sourceLimit: 3 });
      await service.runMvp2(project.id);
      await service.setProjectStatus(project.id, "published");

      return {
        projectId: project.id,
        status: "completed"
      };
    }),
    route("GET", "/", async ({ res }) => {
      redirect(res, "/reviewer");
      return undefined;
    }, { public: true }),
    route("GET", "/health", async () => ({ ok: true }), { public: true }),
    route("GET", "/version", async () => ({ name: "routemarket-atlas-engine", version: "0.1.0" }), { public: true }),
    route("GET", "/manifest", async ({ apiToken }) => apiManifest(Boolean(apiToken)), { public: true }),
    route("GET", "/reviewer", async ({ res }) => {
      sendHtml(res, 200, reviewerPageHtml());
      return undefined;
    }, { public: true }),
    route("GET", "/categories", async ({ service }) => ({ categories: service.listCategories() })),
    route("GET", "/providers", async ({ service }) => service.listSourceProviders()),
    route("GET", "/dashboard", async ({ service }) => service.dashboard()),
    route("POST", "/discover", async ({ req, service }) => service.discover(DiscoverBodySchema.parse(await readJson(req)))),
    route("POST", "/projects", async ({ req, service }) => service.createProject(CreateProjectBodySchema.parse(await readJson(req)))),
    route("GET", "/projects", async ({ service, url }) => service.listProjects(projectFiltersFromUrl(url))),
    route("GET", "/projects/:slug", async ({ params, service }) => ({ project: await service.getProject(params.slug) })),
    route("DELETE", "/projects/:slug", async ({ params, service }) => {
      await service.deleteProject(params.slug);
      return { success: true };
    }),
    route("GET", "/projects/:slug/bundle", async ({ params, service }) => service.getProjectBundle(params.slug)),
    route("GET", "/projects/:slug/export", async ({ params, service }) => service.exportProject(params.slug)),
    route("POST", "/projects/:slug/archive", async ({ req, params, service }) => {
      const body = ArchiveProjectBodySchema.parse(await readJson(req));
      return { project: await service.archiveProject(params.slug, body.reason) };
    }),
    route("GET", "/projects/:slug/readiness", async ({ params, service }) => service.assessReadiness(params.slug)),
    route("GET", "/projects/:slug/review", async ({ params, service }) => service.getReview(params.slug)),
    route("POST", "/projects/:slug/review/decision", async ({ req, params, service }) => {
      const body = SubmitReviewDecisionBodySchema.parse(await readJson(req));
      return service.submitReviewDecision(params.slug, body);
    }),
    route("POST", "/projects/:slug/approvals/:stage", async ({ req, params, service, jobs }) => {
      validateApprovalStage(params.stage);
      const body = SubmitStageApprovalBodySchema.parse(await readJson(req));
      await service.approveStage(params.slug, params.stage, body.decision, body.notes, body.reviewer);
      const waitingJob = jobs.list().find((job) =>
        job.projectSlug === params.slug &&
        job.status === "waiting_for_approval" &&
        (job.waitingForStage === params.stage || job.currentStep === params.stage || job.pendingApprovalContext?.stage === params.stage)
      );

      if (body.decision === "approved" && waitingJob?.pendingApprovalContext?.blocking) {
        throw badRequest("This stage is blocked by missing inputs. Add the required route data or rerun the previous step before approval.");
      }

      if (body.decision === "approved" && waitingJob) {
        const nextStep = nextStepAfterApprovalStage(params.stage);
        jobs.resume(waitingJob.id, { stage: params.stage, decision: body.decision }, (update) =>
          service.runMvp2WithProgress(params.slug, update, nextStep)
        );
        return { stage: params.stage, decision: body.decision, jobId: waitingJob.id, resumed: true };
      }

      return { stage: params.stage, decision: body.decision, resumed: false };
    }),
    route("PATCH", "/projects/:slug/status", async ({ req, params, service }) => {
      const body = UpdateProjectStatusBodySchema.parse(await readJson(req));
      return { project: await service.setProjectStatus(params.slug, body.status as any) };
    }),
    route("GET", "/projects/:slug/artifacts", async ({ params, service }) => service.listArtifacts(params.slug)),
    route("GET", "/projects/:slug/events", async ({ params, service }) => service.listEvents(params.slug)),
    route("POST", "/projects/:slug/collect-sources", async ({ req, params, service }) => {
      const body = CollectSourcesBodySchema.parse(await readJson(req));
      return { sources: await service.collectSources(params.slug, body) };
    }),
    route("POST", "/projects/:slug/jobs/collect-sources", async ({ req, params, service, jobs }) => {
      const body = CollectSourcesBodySchema.parse(await readJson(req));
      return {
        job: jobs.start(`collect-sources:${params.slug}`, async (update) => {
          update({ message: "Collecting route sources.", progress: 10, currentStep: "collect_sources" });
          const sources = await service.collectSources(params.slug, body);
          update({ message: `Collected ${sources.length} sources.`, progress: 100, currentStep: "collect_sources" });
          return { sourceCount: sources.length };
        }, params.slug)
      };
    }),
    route("POST", "/projects/:slug/inputs/notes", async ({ req, params, service }) => {
      const body = AddNoteBodySchema.parse(await readJson(req, 11_000_000)); // supports 10MB documents encoded as data URLs
      return service.addNoteText(params.slug, body);
    }),
    route("POST", "/projects/:slug/inputs/gpx", async ({ req, params, service }) => {
      const body = AddGpxBodySchema.parse(await readJson(req, 11_000_000)); // 11MB raw buffer limit for 10MB content string
      return service.addGpxText(params.slug, body);
    }),
    route("POST", "/projects/:slug/inputs/links", async ({ req, params, service }) => {
      const body = AddLinkBodySchema.parse(await readJson(req));
      return service.addLink(params.slug, body);
    }),
    route("DELETE", "/projects/:slug/inputs", async ({ req, params, service }) => {
      const body = RemoveInputBodySchema.parse(await readJson(req));
      return service.removeInput(params.slug, body);
    }),
    route("POST", "/projects/:slug/inputs/external", async ({ req, params, service }) => {
      const body = RegisterExternalInputBodySchema.parse(await readJson(req));
      return service.registerExternalInput(params.slug, body);
    }),
    route("POST", "/projects/:slug/research-pack", async ({ req, params, service }) => {
      EmptyBodySchema.parse(await readJson(req));
      return service.buildResearchPack(params.slug);
    }),
    route("POST", "/projects/:slug/analyze-gpx", async ({ req, params, service }) => {
      EmptyBodySchema.parse(await readJson(req));
      return service.analyzeGpx(params.slug);
    }),
    route("POST", "/projects/:slug/deep-research", async ({ req, params, service }) => {
      const body = DeepResearchBodySchema.parse(await readJson(req));
      return service.runDeepResearch(params.slug, body);
    }),
    route("POST", "/projects/:slug/jobs/deep-research", async ({ req, params, service, jobs }) => {
      const body = DeepResearchBodySchema.parse(await readJson(req));
      return {
        job: jobs.start(`deep-research:${params.slug}`, async (update) => {
          update({ message: "Running Gemini research enrichment.", progress: 10, currentStep: "deep_research" });
          const report = await service.runDeepResearch(params.slug, body);
          update({ message: `Processed ${report.processedSourceCount} sources.`, progress: 100, currentStep: "deep_research" });
          return report;
        }, params.slug)
      };
    }),
    route("POST", "/projects/:slug/run-mvp2", async ({ req, params, service }) => {
      EmptyBodySchema.parse(await readJson(req));
      return service.runMvp2(params.slug);
    }),
    route("POST", "/projects/:slug/jobs/run-mvp2", async ({ req, params, service, jobs }) => {
      EmptyBodySchema.parse(await readJson(req));
      return { job: jobs.start(`run-mvp2:${params.slug}`, (update) => service.runMvp2WithProgress(params.slug, update), params.slug) };
    }),
    route("GET", "/jobs", async ({ jobs }) => ({ jobs: jobs.list() })),
    route("GET", "/projects/:slug/jobs", async ({ params, jobs }) => ({
      jobs: jobs.list().filter((job) => job.projectSlug === params.slug)
    })),
    route("GET", "/jobs/pending-approvals", async ({ jobs }) => ({
      jobs: jobs.list().filter(j => j.status === "waiting_for_approval")
    })),
    route("GET", "/api/jobs/pending-approvals", async ({ jobs }) => ({
      jobs: jobs.list()
        .filter(j => j.status === "waiting_for_approval")
        .map(j => ({
          id: j.id,
          type: j.type,
          status: j.status,
          progress: j.progress,
          currentStep: j.currentStep,
          updatedAt: j.updatedAt,
          pendingApprovalContext: j.pendingApprovalContext
        }))
    })),
    route("POST", "/jobs/:id/approve", async ({ req, params, jobs, service }) => {
      const body = JobApprovalBodySchema.parse(await readJson(req));
      const job = jobs.get(params.id);
      if (!job) throw notFound("Job not found.");
      if (job.status !== "waiting_for_approval") throw badRequest("Job is not waiting for approval.");
      if (job.pendingApprovalContext?.blocking) {
        throw badRequest("This stage is blocked by missing inputs. Add the required route data or rerun the previous step before approval.");
      }

      // Resume logic
      const projectSlug = job.type.split(":")[1];
      if (!projectSlug) throw badRequest("Invalid job type for approval.");
      validateSlug(projectSlug);

      const nextStepMap: Record<string, string> = {
        "claims_approval": "concept",
        "concept_approval": "guide_outline",
        "guide_outline_approval": "gpx",
        "gpx_summary_approval": "pois",
        "guide_final_approval": "poi_review",
        "poi_approval": "finalize"
      };
      const stage = job.currentStep ?? "";
      await service.approveStage(projectSlug, stage, "approved", "Approved through job resume endpoint.");
      const nextStep = nextStepMap[stage] ?? "input";

      jobs.resume(params.id, body.approvalData, (update) =>
        service.runMvp2WithProgress(projectSlug, update, nextStep)
      );

      return { message: "Job resumed.", jobId: params.id, nextStep };
    }),
    route("POST", "/api/jobs/:id/approve", async ({ req, params, jobs, service }) => {
      const body = JobApprovalBodySchema.parse(await readJson(req));
      const job = jobs.get(params.id);
      if (!job) throw notFound("Job not found.");
      if (job.status !== "waiting_for_approval") throw badRequest("Job is not waiting for approval.");
      if (job.pendingApprovalContext?.blocking) {
        throw badRequest("This stage is blocked by missing inputs. Add the required route data or rerun the previous step before approval.");
      }

      // Resume logic
      const projectSlug = job.type.split(":")[1];
      if (!projectSlug) throw badRequest("Invalid job type for approval.");
      validateSlug(projectSlug);

      const nextStepMap: Record<string, string> = {
        "claims_approval": "concept",
        "concept_approval": "guide_outline",
        "guide_outline_approval": "gpx",
        "gpx_summary_approval": "pois",
        "guide_final_approval": "poi_review",
        "poi_approval": "finalize"
      };
      const stage = job.currentStep ?? "";
      await service.approveStage(projectSlug, stage, "approved", "Approved through job resume endpoint.");
      const nextStep = nextStepMap[stage] ?? "input";

      jobs.resume(params.id, body.approvalData, (update) =>
        service.runMvp2WithProgress(projectSlug, update, nextStep)
      );

      return { message: "Job resumed.", jobId: params.id, nextStep };
    }),
    route("GET", "/projects/:slug/missing-inputs", async ({ params, service }) => {
      try {
        return JSON.parse(await service.readProjectFile(params.slug, "missing_inputs.json"));
      } catch {
        return { missing: [] };
      }
    }),
    route("POST", "/jobs/prune", async ({ req, jobs }) => {
      const body = PruneJobsBodySchema.parse(await readJson(req));
      return jobs.prune({ olderThanMs: body.olderThanMs });
    }),
    route("GET", "/jobs/:id", async ({ params, jobs }) => {
      const job = jobs.get(params.id);
      if (!job) throw notFound("Job not found.");
      return { job };
    }),
    route("GET", "/jobs/:id/logs", async ({ params, jobs }) => {
      const job = jobs.get(params.id);
      if (!job) throw notFound("Job not found.");
      return { jobId: params.id, logs: jobs.logs(params.id) };
    }),
    route("POST", "/projects/:slug/prepare-publish", async ({ req, params, service }) => {
      EmptyBodySchema.parse(await readJson(req));
      return service.preparePublish(params.slug);
    }),
    route("POST", "/projects/:slug/jobs/prepare-publish", async ({ req, params, service, jobs }) => {
      EmptyBodySchema.parse(await readJson(req));
      return {
        job: jobs.start(`prepare-publish:${params.slug}`, async (update) => {
          update({ message: "Preparing RouteMarket payload.", progress: 20, currentStep: "prepare_publish" });
          const payload = await service.preparePublish(params.slug);
          update({ message: "RouteMarket payload prepared.", progress: 100, currentStep: "prepare_publish" });
          return payload;
        }, params.slug)
      };
    }),
    route("GET", "/projects/:slug/files", async ({ params, service, url }) => {
      const file = url.searchParams.get("path");
      if (!file) throw badRequest("Missing path query parameter.");
      return { path: file, content: await service.readProjectFile(params.slug, file) };
    }),
    route("PUT", "/projects/:slug/files", async ({ req, params, service, url }) => {
      const file = url.searchParams.get("path");
      if (!file) throw badRequest("Missing path query parameter.");
      const body = WriteProjectFileBodySchema.parse(await readJson(req));
      return service.writeProjectFile(params.slug, file, body.content);
    })
  ];
}

function route(method: string, template: string, handler: Handler, options: { public?: boolean } = {}): Route {
  const keys: string[] = [];
  const pattern = new RegExp(`^${template.replace(/:([^/]+)/g, (_, key: string) => {
    keys.push(key);
    return "([^/]+)";
  })}$`);
  return { method, pattern, keys, handler, public: options.public };
}

function matchRoute(routes: Route[], method: string, pathname: string): (Route & { params: RouteParams }) | undefined {
  for (const routeDef of routes) {
    if (routeDef.method !== method) continue;
    const match = routeDef.pattern.exec(pathname);
    if (!match) continue;
    const params = Object.fromEntries(routeDef.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    return { ...routeDef, params };
  }
  return undefined;
}

function nextStepAfterApprovalStage(stage: string): string {
  const map: Record<string, string> = {
    claims_approval: "concept",
    concept_approval: "guide_outline",
    guide_outline_approval: "gpx",
    gpx_summary_approval: "pois",
    guide_final_approval: "poi_review",
    poi_approval: "finalize"
  };
  return map[stage] ?? "input";
}

async function readJson(req: IncomingMessage, maxBytes: number = 1_000_000): Promise<any> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxBytes) {
      throw badRequest(`Request body too large. Limit is ${maxBytes} bytes.`);
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw badRequest("Invalid JSON body.");
  }
}

function setCorsHeaders(res: ServerResponse, corsOrigin: string, reqOrigin?: string): void {
  if (corsOrigin === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const allowed = corsOrigin.split(",").map((s) => s.trim());
    if (reqOrigin && allowed.includes(reqOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", reqOrigin);
      res.setHeader("Vary", "Origin");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Atlas-API-Token");
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendHtml(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

import { ZodError } from "zod";
import { QualityGateError } from "@routemarket/atlas-workflow/src/index.js";

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof ZodError) {
    sendJson(res, 400, {
      error: "Validation failed.",
      code: "validation_error",
      details: error.issues
    });
    return;
  }
  if (error && typeof error === "object" && "name" in error && error.name === "JobAlreadyRunningError") {
    sendJson(res, 409, {
      error: (error as Error).message,
      code: "job_conflict"
    });
    return;
  }
  if (error && typeof error === "object" && "name" in error && error.name === "ProjectAlreadyExistsError") {
    sendJson(res, 409, {
      error: (error as Error).message,
      code: "conflict"
    });
    return;
  }
  if (error && typeof error === "object" && "name" in error && error.name === "QualityGateError") {
    sendJson(res, 422, {
      error: (error as QualityGateError).message,
      code: "quality_gate_failed",
      details: (error as QualityGateError).issues
    });
    return;
  }
  if (error instanceof HttpError) {
    sendJson(res, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message.startsWith("Invalid filename") || message.startsWith("Invalid file extension") || message.includes("too large")) {
    sendJson(res, 400, { error: message, code: "bad_request" });
    return;
  }
  sendJson(res, 500, { error: message, code: "internal_error" });
}

function assertAuthorized(req: IncomingMessage, apiToken: string): void {
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  const headerToken = req.headers["x-atlas-api-token"];
  const token = bearer ?? (Array.isArray(headerToken) ? headerToken[0] : headerToken);
  if (token !== apiToken) throw unauthorized();
}

function apiManifest(authEnabled: boolean) {
  return {
    name: "routemarket-atlas-engine",
    version: "0.1.0",
    auth: {
      enabled: authEnabled,
      header: "Authorization: Bearer <ATLAS_API_TOKEN>"
    },
    endpoints: [
      "GET /",
      "GET /health",
      "GET /version",
      "GET /manifest",
      "GET /reviewer",
      "GET /categories",
      "GET /providers",
      "GET /dashboard",
      "POST /discover",
      "POST /projects",
      "GET /projects",
      "GET /projects/:slug",
      "GET /projects/:slug/bundle",
      "GET /projects/:slug/export",
      "POST /projects/:slug/archive",
      "GET /projects/:slug/readiness",
      "GET /projects/:slug/review",
      "POST /projects/:slug/review/decision",
      "POST /projects/:slug/approvals/:stage",
      "PATCH /projects/:slug/status",
      "GET /projects/:slug/artifacts",
      "GET /projects/:slug/events",
      "POST /projects/:slug/collect-sources",
      "POST /projects/:slug/inputs/notes",
      "POST /projects/:slug/inputs/gpx",
      "POST /projects/:slug/inputs/links",
      "DELETE /projects/:slug/inputs",
      "POST /projects/:slug/inputs/external",
      "POST /projects/:slug/research-pack",
      "POST /projects/:slug/analyze-gpx",
      "POST /projects/:slug/deep-research",
      "POST /projects/:slug/run-mvp2",
      "POST /projects/:slug/jobs/run-mvp2",
      "GET /projects/:slug/jobs",
      "GET /jobs/pending-approvals",
      "POST /jobs/:id/approve",
      "GET /api/jobs/pending-approvals",
      "POST /api/jobs/:id/approve",
      "GET /jobs",
      "POST /jobs/prune",
      "GET /jobs/:id",
      "GET /jobs/:id/logs",
      "POST /projects/:slug/prepare-publish",
      "GET /projects/:slug/files?path=guide.md",
      "PUT /projects/:slug/files?path=guide.md"
    ]
  };
}

function projectFiltersFromUrl(url: URL) {
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");
  return {
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    ownerUserId: url.searchParams.get("ownerUserId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined
  };
}
