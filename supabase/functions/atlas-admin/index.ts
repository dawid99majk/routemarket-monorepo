import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ATLAS_API_BASE_URL = Deno.env.get("ATLAS_API_BASE_URL");
const ATLAS_API_TOKEN = Deno.env.get("ATLAS_API_TOKEN");

type AtlasAction =
  | "providers"
  | "list_projects"
  | "get_project"
  | "get_workflow_state"
  | "list_events"
  | "create_project"
  | "delete_project"
  | "collect_sources"
  | "deep_research"
  | "run_mvp2"
  | "start_run_mvp2_job"
  | "get_project_jobs"
  | "get_job"
  | "get_job_logs"
  | "approve_job"
  | "get_review"
  | "submit_review_decision"
  | "approve_stage"
  | "prepare_publish"
  | "start_prepare_publish_job"
  | "import_draft"
  | "bulk_import_drafts"
  | "import_payload"
  | "add_notes"
  | "add_gpx"
  | "add_link"
  | "analyze_gpx"
  | "research_pack"
  | "get_file"
  | "put_file";

type AtlasProject = {
  id: string;
  slug: string;
  title: string;
  status: string;
  ownerUserId?: string;
  [key: string]: unknown;
};

type AtlasJob = {
  id: string;
  type?: string;
  projectSlug?: string;
  status?: string;
  currentStep?: string;
  waitingForStage?: string;
  pendingApprovalContext?: { stage?: string };
  [key: string]: unknown;
};

type AtlasPreparedDraft = {
  project?: {
    id?: string;
    title?: string;
    category?: string;
    region?: string;
    language?: string;
    status?: string;
  };
  draft?: {
    title?: string;
    description?: string;
    category_id?: number;
    currency?: string;
    price?: number;
    difficulty?: string;
    distance_km?: number;
    elevation_gain_m?: number;
    estimated_time_h?: number;
    location_string?: string;
    loop_type?: string;
    risk_level?: string;
    season?: string;
    start_point?: string;
    end_point?: string;
    surface_type?: string;
    tags?: unknown[];
    ai_assisted?: boolean;
    latitude?: number;
    longitude?: number;
    preview_track?: unknown;
  };
  tips?: Array<{
    category?: string;
    content?: string;
    sortOrder?: number;
  }>;
  pois?: Array<{
    name?: string;
    type?: string;
    lat?: number;
    lng?: number;
    description?: string;
    funFact?: string;
    sortOrder?: number;
  }>;
  recommendations?: Array<{
    name?: string;
    description?: string;
    whatToOrder?: string;
    priceRange?: string;
    sortOrder?: number;
  }>;
};

type AtlasReviewBundle = {
  readiness?: {
    status?: string;
    score?: number;
  };
  latestDecision?: {
    decision?: string;
    reviewer?: string;
    decidedAt?: string;
  } | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    assertAtlasConfigured();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "Invalid session" }, 401);

    const userId = userRes.user.id;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "creator"]);

    if (!roles || roles.length === 0) return json({ error: "Unauthorized: admin or creator role required" }, 403);

    const isAdmin = roles.some((r) => r.role === "admin");

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "") as AtlasAction;
    const input = body.input ?? {};

    console.log(`[Atlas Admin] Action: ${action}, User: ${userId}, Admin: ${isAdmin}`);

    // Helper to ensure creator only sees/edits their own projects
    const checkOwnership = async (slug: string) => {
      if (isAdmin) return;
      console.log(`[Atlas Admin] Checking ownership for slug: ${slug}`);
      try {
        const projRes = await atlasJson<{ project: AtlasProject }>("GET", `/projects/${encodeURIComponent(slug)}`);
        if (projRes.project?.ownerUserId && projRes.project.ownerUserId !== userId) {
          console.warn(`[Atlas Admin] Ownership check failed for user ${userId} on project ${slug}`);
          throw new Error("Unauthorized: you do not own this project");
        }
        console.log(`[Atlas Admin] Ownership check passed for slug: ${slug}`);
      } catch (err) {
        console.error(`[Atlas Admin] Ownership check error: ${err.message}`);
        throw err;
      }
    };

    const checkJobOwnership = async (jobId: string): Promise<AtlasJob> => {
      const jobRes = await atlasJson<{ job: AtlasJob }>("GET", `/jobs/${encodeURIComponent(jobId)}`);
      const projectSlug = jobRes.job?.projectSlug ?? projectSlugFromJob(jobRes.job);
      if (!projectSlug) throw new Error("Job is not attached to an Atlas project.");
      await checkOwnership(projectSlug);
      return jobRes.job;
    };

    switch (action) {
      case "providers":
        return atlasRequest("GET", "/providers");
      case "list_projects": {
        const query = buildQuery({
          ...input,
          ownerUserId: isAdmin ? (input.ownerUserId ?? undefined) : userId,
        });
        return atlasRequest("GET", `/projects${query}`);
      }
      case "get_project":
        await checkOwnership(input.slug);
        return atlasRequest("GET", `/projects/${encodeURIComponent(input.slug)}`);
      case "get_workflow_state":
        await checkOwnership(input.slug);
        return atlasRequest("GET", `/projects/${encodeURIComponent(input.slug)}/files?path=workflow_state.json`);
      case "list_events":
        await checkOwnership(input.slug);
        return atlasRequest("GET", `/projects/${encodeURIComponent(input.slug)}/events`);
      case "delete_project":
        await checkOwnership(input.slug);
        return atlasRequest("DELETE", `/projects/${encodeURIComponent(input.slug)}`);
      case "create_project":
        return json({
          project: await atlasJson("POST", "/projects", {
            topic: input.topic,
            category: input.category,
            region: input.region,
            language: input.language ?? "en",
            ownerUserId: userId, // Always force owner to current user
          })
        });
      case "collect_sources":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/collect-sources`, {
          provider: input.provider ?? "auto",
          limit: input.limit ?? 20,
        });
      case "deep_research":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/deep-research`, {
          sourceLimit: input.sourceLimit ?? 3,
        });
      case "run_mvp2":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/run-mvp2`, {});
      case "start_run_mvp2_job":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/jobs/run-mvp2`, {});
      case "get_project_jobs": {
        await checkOwnership(input.slug);
        const data = await atlasJson<{ jobs?: AtlasJob[] }>("GET", `/projects/${encodeURIComponent(input.slug)}/jobs`);
        return json({ jobs: data.jobs ?? [] });
      }
      case "get_job":
        await checkJobOwnership(input.jobId);
        return atlasRequest("GET", `/jobs/${encodeURIComponent(input.jobId)}`);
      case "get_job_logs":
        await checkJobOwnership(input.jobId);
        return atlasRequest("GET", `/jobs/${encodeURIComponent(input.jobId)}/logs`);
      case "approve_job":
        await checkJobOwnership(input.jobId);
        return atlasRequest("POST", `/jobs/${encodeURIComponent(input.jobId)}/approve`, {
          approvalData: input.approvalData ?? {}
        });
      case "get_review":
        await checkOwnership(input.slug);
        return atlasRequest("GET", `/projects/${encodeURIComponent(input.slug)}/review`);
      case "submit_review_decision":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/review/decision`, {
          decision: input.decision,
          reviewer: input.reviewer,
          notes: input.notes,
        });
      case "approve_stage":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/approvals/${encodeURIComponent(input.stage)}`, {
          decision: input.decision,
          reviewer: input.reviewer,
          notes: input.notes,
        });
      case "prepare_publish":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/prepare-publish`, {});
      case "start_prepare_publish_job":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/jobs/prepare-publish`, {});
      case "import_draft":
        await checkOwnership(input.slug);
        return json(await importDraftFromAtlas(supabase, userId, input));
      case "bulk_import_drafts":
        // bulkImportDraftsFromAtlas already calls importDraftFromAtlas which has ownership check
        return json(await bulkImportDraftsFromAtlas(supabase, userId, input));
      case "import_payload":
        // For import_payload, we ensure ownerUserId is correct
        return json(await importDraftFromPayload(supabase, userId, {
          ...input,
          ownerUserId: isAdmin ? (input.ownerUserId ?? userId) : userId
        }));
      case "add_notes":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/inputs/notes`, {
          fileName: input.fileName,
          content: input.content,
          note: input.note,
        });
      case "add_gpx":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/inputs/gpx`, {
          fileName: input.fileName,
          content: input.content,
        });
      case "add_link":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/inputs/links`, {
          url: input.url,
          note: input.note,
        });
      case "analyze_gpx":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/analyze-gpx`, {});
      case "research_pack":
        await checkOwnership(input.slug);
        return atlasRequest("POST", `/projects/${encodeURIComponent(input.slug)}/research-pack`, {});
      case "get_file":
        await checkOwnership(input.slug);
        return atlasRequest("GET", `/projects/${encodeURIComponent(input.slug)}/files?path=${encodeURIComponent(input.path)}`);
      case "put_file":
        await checkOwnership(input.slug);
        return atlasRequest("PUT", `/projects/${encodeURIComponent(input.slug)}/files?path=${encodeURIComponent(input.path)}`, {
          content: input.content,
        });
      default:
        return json({ error: "Unsupported atlas action." }, 400);
    }
  } catch (error) {
    console.error("atlas-admin error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

async function importDraftFromAtlas(supabase: ReturnType<typeof createClient>, currentUserId: string, input: Record<string, unknown>) {
  const slug = String(input.slug ?? "").trim();
  if (!slug) throw new Error("slug is required for import_draft.");

  await atlasJson("POST", `/projects/${encodeURIComponent(slug)}/prepare-publish`, {});

  const fileRes = await atlasJson<{ content?: string }>(
    "GET",
    `/projects/${encodeURIComponent(slug)}/files?path=${encodeURIComponent("routemarket_payload.json")}`,
  );
  if (!fileRes.content) throw new Error("Atlas did not return routemarket_payload.json content.");

  const payload = JSON.parse(fileRes.content) as AtlasPreparedDraft;
  const review = await atlasJson<AtlasReviewBundle>("GET", `/projects/${encodeURIComponent(slug)}/review`).catch(() => null);
  return importPreparedDraftPayload(supabase, currentUserId, {
    ...input,
    slug,
    payload,
    review,
  });
}

async function bulkImportDraftsFromAtlas(supabase: ReturnType<typeof createClient>, currentUserId: string, input: Record<string, unknown>) {
  const slugs = Array.isArray(input.slugs) ? input.slugs.map((value) => String(value).trim()).filter(Boolean) : [];
  if (slugs.length === 0) throw new Error("slugs[] is required for bulk_import_drafts.");

  const results: Array<{ slug: string; ok: boolean; imported?: boolean; routeId?: number; reason?: string; error?: string }> = [];

  for (const slug of slugs) {
    try {
      const result = await importDraftFromAtlas(supabase, currentUserId, { ...input, slug });
      results.push({
        slug,
        ok: true,
        imported: result.imported !== false,
        routeId: Number(result.route?.id ?? 0) || undefined,
        reason: typeof result.reason === "string" ? result.reason : undefined,
      });
    } catch (error) {
      results.push({
        slug,
        ok: false,
        error: error instanceof Error ? error.message : "Import failed.",
      });
    }
  }

  return {
    ok: true,
    total: results.length,
    imported: results.filter((result) => result.imported).length,
    skipped: results.filter((result) => result.reason === "already_imported").length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}

async function importDraftFromPayload(supabase: ReturnType<typeof createClient>, currentUserId: string, input: Record<string, unknown>) {
  const rawPayload = input.payload;
  if (!rawPayload) throw new Error("payload is required for import_payload.");

  const payload = typeof rawPayload === "string"
    ? JSON.parse(rawPayload) as AtlasPreparedDraft
    : rawPayload as AtlasPreparedDraft;

  return importPreparedDraftPayload(supabase, currentUserId, input, payload);
}

async function importPreparedDraftPayload(
  supabase: ReturnType<typeof createClient>,
  currentUserId: string,
  input: Record<string, unknown>,
  payloadFromArg?: AtlasPreparedDraft,
) {
  const payload = payloadFromArg ?? (input.payload as AtlasPreparedDraft | undefined);
  if (!payload) throw new Error("Prepared Atlas payload is required.");

  const slug =
    normalizeOptionalString(input.slug)
    ?? normalizeOptionalString(payload.project?.id)
    ?? normalizeOptionalString((payload.project as { slug?: string } | undefined)?.slug)
    ?? slugify(normalizeOptionalString(payload.draft?.title) ?? normalizeOptionalString(payload.project?.title) ?? "atlas-import");

  const ownerUserId = normalizeOptionalString(input.ownerUserId) ?? currentUserId;
  const dryRun = input.dryRun === true;
  const publish = input.publish === true;
  const review = (input.review as AtlasReviewBundle | undefined) ?? null;

  const categories = await loadCategories(supabase);
  const categoryResolution = resolveCategory(categories, payload.project?.category, payload.draft?.category_id);
  const routeInsert = buildRouteInsert(payload, slug, ownerUserId, categoryResolution.id, review, publish);

  const preview = {
    atlasProject: {
      slug,
      title: payload.project?.title ?? payload.draft?.title ?? slug,
      category: payload.project?.category ?? null,
      atlasStatus: payload.project?.status ?? null,
    },
    ownerUserId,
    routePreview: routeInsert,
    resolvedCategory: categoryResolution,
    counts: {
      tips: (payload.tips ?? []).filter((tip) => normalizeOptionalString(tip.content)).length,
      pois: (payload.pois ?? []).filter((poi) => isFiniteNumber(poi.lat) && isFiniteNumber(poi.lng) && normalizeOptionalString(poi.name)).length,
      recommendations: (payload.recommendations ?? []).filter((rec) => normalizeOptionalString(rec.name)).length,
    },
  };

  if (dryRun) {
    return { ok: true, dryRun: true, preview };
  }

  const existingRoute = await supabase
    .from("routes")
    .select("id, title, status, user_id, created_at")
    .ilike("ai_assisted_note", `%Atlas project ${slug}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingRoute.error) throw new Error(existingRoute.error.message);

  if (existingRoute.data) {
    return {
      ok: true,
      imported: false,
      reason: "already_imported",
      route: existingRoute.data,
      preview,
    };
  }

  const insertedRoute = await supabase
    .from("routes")
    .insert(routeInsert)
    .select("id, title, status, user_id, category_id, created_at")
    .single();
  if (insertedRoute.error || !insertedRoute.data) {
    throw new Error(insertedRoute.error?.message ?? "Failed to insert RouteMarket draft.");
  }

  const routeId = insertedRoute.data.id;
  const fullDescription = String(payload.draft?.description ?? "").trim();
  if (fullDescription) {
    const privateDetails = await supabase
      .from("route_private_details")
      .upsert({ route_id: routeId, full_description: fullDescription }, { onConflict: "route_id" });
    if (privateDetails.error) throw new Error(privateDetails.error.message);
  }

  const tips = (payload.tips ?? [])
    .map((tip, index) => ({
      route_id: routeId,
      category: normalizeOptionalString(tip.category) ?? "atlas",
      content: normalizeOptionalString(tip.content) ?? "",
      sort_order: typeof tip.sortOrder === "number" ? tip.sortOrder : index,
    }))
    .filter((tip) => tip.content);
  if (tips.length) {
    const tipInsert = await supabase.from("route_tips").insert(tips);
    if (tipInsert.error) throw new Error(tipInsert.error.message);
  }

  const pois = (payload.pois ?? [])
    .map((poi, index) => ({
      route_id: routeId,
      name: normalizeOptionalString(poi.name) ?? "",
      type: normalizePoiType(poi.type),
      lat: Number(poi.lat),
      lng: Number(poi.lng),
      description: normalizeOptionalString(poi.description) ?? "",
      fun_fact: normalizeOptionalString(poi.funFact),
      photo_keys: [],
      sort_order: typeof poi.sortOrder === "number" ? poi.sortOrder : index,
    }))
    .filter((poi) => poi.name && Number.isFinite(poi.lat) && Number.isFinite(poi.lng));
  if (pois.length) {
    const poiInsert = await supabase.from("route_pois").insert(pois);
    if (poiInsert.error) throw new Error(poiInsert.error.message);
  }

  const recommendations = (payload.recommendations ?? [])
    .map((rec, index) => ({
      route_id: routeId,
      name: normalizeOptionalString(rec.name) ?? "",
      description: normalizeOptionalString(rec.description),
      what_to_order: normalizeOptionalString(rec.whatToOrder),
      price_range: normalizeOptionalString(rec.priceRange),
      photo_key: null,
      sort_order: typeof rec.sortOrder === "number" ? rec.sortOrder : index,
    }))
    .filter((rec) => rec.name);
  if (recommendations.length) {
    const recommendationInsert = await supabase.from("route_recommendations").insert(recommendations);
    if (recommendationInsert.error) throw new Error(recommendationInsert.error.message);
  }

  return {
    ok: true,
    imported: true,
    route: insertedRoute.data,
    preview,
    inserted: {
      tips: tips.length,
      pois: pois.length,
      recommendations: recommendations.length,
      fullDescription: Boolean(fullDescription),
    },
  };
}

async function loadCategories(supabase: ReturnType<typeof createClient>) {
  const result = await supabase.from("categories").select("id, name").order("id");
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

function resolveCategory(
  categories: Array<{ id: number; name: string }>,
  atlasCategory: string | undefined,
  atlasCategoryId: number | undefined,
) {
  const normalizedAtlasCategory = String(atlasCategory ?? "").trim().toLowerCase();
  const aliases = atlasCategoryAliases[normalizedAtlasCategory] ?? [];

  for (const candidateName of aliases) {
    const match = categories.find((category) => category.name.toLowerCase() === candidateName.toLowerCase());
    if (match) {
      return { id: match.id, name: match.name, source: "alias_match" as const };
    }
  }

  if (typeof atlasCategoryId === "number") {
    const matchById = categories.find((category) => category.id === atlasCategoryId);
    if (matchById && aliases.some((name) => name.toLowerCase() === matchById.name.toLowerCase())) {
      return { id: matchById.id, name: matchById.name, source: "atlas_payload_id" as const };
    }
  }

  return { id: null, name: null, source: "unresolved" as const };
}

function deriveRouteGeometry(payload: AtlasPreparedDraft) {
  const draft = payload.draft ?? {};
  const draftTrack = normalizeTrackPoints(draft.preview_track);
  const poiTrack = (payload.pois ?? [])
    .map((poi) => ({
      lat: Number(poi.lat),
      lng: Number(poi.lng),
      sortOrder: typeof poi.sortOrder === "number" ? poi.sortOrder : 0,
    }))
    .filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((poi) => [poi.lat, poi.lng] as [number, number]);

  const previewTrack = draftTrack.length >= 2 ? draftTrack : (poiTrack.length >= 2 ? poiTrack : null);

  if (previewTrack && previewTrack.length > 0) {
    const latitudes = previewTrack.map((point) => point[0]);
    const longitudes = previewTrack.map((point) => point[1]);
    return {
      latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      previewTrack,
    };
  }

  const draftLatitude = normalizeOptionalNumber(draft.latitude);
  const draftLongitude = normalizeOptionalNumber(draft.longitude);
  if (draftLatitude !== null && draftLongitude !== null) {
    return {
      latitude: draftLatitude,
      longitude: draftLongitude,
      previewTrack: null,
    };
  }

  const firstPoi = poiTrack[0];
  if (firstPoi) {
    return {
      latitude: firstPoi[0],
      longitude: firstPoi[1],
      previewTrack: null,
    };
  }

  return {
    latitude: 0,
    longitude: 0,
    previewTrack: null,
  };
}

function buildRouteInsert(
  payload: AtlasPreparedDraft,
  slug: string,
  ownerUserId: string,
  categoryId: number | null,
  review: AtlasReviewBundle | null,
  publish: boolean,
) {
  const draft = payload.draft ?? {};
  const fullDescription = String(draft.description ?? "").trim();
  const atlasCategory = normalizeOptionalString(payload.project?.category);
  const geometry = deriveRouteGeometry(payload);

  return {
    user_id: ownerUserId,
    title: normalizeOptionalString(draft.title) ?? normalizeOptionalString(payload.project?.title) ?? slug,
    description: fullDescription ? fullDescription.slice(0, 3000) : "Imported from Atlas. Complete the draft before publishing.",
    price: typeof draft.price === "number" ? draft.price : 0,
    currency: normalizeOptionalString(draft.currency) ?? "PLN",
    category_id: categoryId,
    location_string: normalizeOptionalString(draft.location_string) ?? normalizeOptionalString(payload.project?.region) ?? "",
    latitude: geometry.latitude,
    longitude: geometry.longitude,
    distance_km: normalizeOptionalNumber(draft.distance_km),
    elevation_gain_m: normalizeOptionalInteger(draft.elevation_gain_m),
    estimated_time_h: normalizeOptionalNumber(draft.estimated_time_h),
    difficulty: normalizeDifficulty(draft.difficulty),
    loop_type: normalizeLoopType(draft.loop_type),
    surface_type: normalizeOptionalString(draft.surface_type),
    season: normalizeOptionalString(draft.season),
    start_point: normalizeOptionalString(draft.start_point),
    end_point: normalizeOptionalString(draft.end_point),
    status: publish ? "published" : "draft",
    risk_level: normalizeRiskLevel(draft.risk_level),
    known_hazards: [],
    required_equipment: [],
    data_confidence: review?.readiness?.status === "ready" ? "reviewed" : "unverified",
    last_verified_at: normalizeOptionalString(review?.latestDecision?.decidedAt),
    ai_assisted: draft.ai_assisted !== false,
    ai_assisted_scope: "atlas-import",
    ai_assisted_note: `Imported from Atlas project ${slug}${atlasCategory ? ` (${atlasCategory})` : ""}.`,
    route_type: atlasCategory,
    tags: Array.isArray(draft.tags) ? draft.tags.map(String).filter(Boolean) : [],
    audience: [],
    pets_friendly: false,
    preview_track: geometry.previewTrack,
  };
}

const atlasCategoryAliases: Record<string, string[]> = {
  motorcycle: ["Motorcycling", "Off-road"],
  motorcycling: ["Motorcycling", "Off-road"],
  cycling: ["Cycling"],
  gravel: ["Gravel", "Cycling"],
  mtb: ["Cycling"],
  hiking: ["Hiking"],
  trekking: ["Hiking"],
  running: ["Running"],
  trail_running: ["Trail Running", "Running"],
  roadtrip: ["Car", "Off-road"],
  car: ["Car", "Off-road"],
  scenic_drive: ["Car", "Off-road"],
  winter_sports: ["Winter Sports", "Ski Touring"],
  water_sports: ["Water Sports", "Kayaking"],
  city: ["City"],
  city_walk: ["City"],
};

async function atlasRequest(method: string, path: string, body?: unknown): Promise<Response> {
  try {
    const response = await atlasFetch(method, path, body);
    const payloadText = await response.text();
    
    if (!response.ok) {
      let errorMessage = `Atlas request failed for ${path} (status ${response.status}).`;
      try {
        const parsed = JSON.parse(payloadText);
        if (parsed && typeof parsed === "object") {
          if (parsed.error) {
            errorMessage = String(parsed.error);
          } else if (parsed.message) {
            errorMessage = String(parsed.message);
          }
        }
      } catch {
        if (payloadText.trim()) {
          errorMessage = payloadText.trim();
        }
      }
      console.warn(`[Atlas Request Error] Method: ${method}, Path: ${path}, Status: ${response.status}, Error: ${errorMessage}`);
      return json({ error: errorMessage }, response.status);
    }
    
    return new Response(payloadText, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Atlas Request Exception] Method: ${method}, Path: ${path}, Error: ${errMsg}`);
    return json({ error: errMsg }, 500);
  }
}

async function atlasFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const url = `${ATLAS_API_BASE_URL!.replace(/\/+$/, "")}${path}`;
  console.log(`[Atlas Admin] Fetching ${method} ${url}`);
  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ATLAS_API_TOKEN!}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function atlasJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await atlasFetch(method, path, body);
  const raw = await response.text();
  const payload = raw.trim() ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(String((payload as { error?: string }).error ?? `Atlas request failed for ${path}.`));
  }
  return payload as T;
}

function buildQuery(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  }
  const raw = params.toString();
  return raw ? `?${raw}` : "";
}

function projectSlugFromJob(job?: AtlasJob): string | undefined {
  if (!job) return undefined;
  if (job.projectSlug && typeof job.projectSlug === "string") return job.projectSlug;
  if (typeof job.type === "string" && job.type.includes(":")) {
    const [, slug] = job.type.split(":");
    return slug || undefined;
  }
  return undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "atlas-import";
}

function normalizeTrackPoints(raw: unknown): Array<[number, number]> {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((point): [number, number] | null => {
      if (Array.isArray(point) && point.length >= 2) {
        const lat = Number(point[0]);
        const lng = Number(point[1]);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
      }

      if (point && typeof point === "object") {
        const value = point as { lat?: unknown; lng?: unknown; lon?: unknown };
        const lat = Number(value.lat);
        const lng = Number(value.lng ?? value.lon);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
      }

      return null;
    })
    .filter((point): point is [number, number] => point !== null);
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeOptionalInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function normalizeDifficulty(value: unknown): string | null {
  return ["easy", "moderate", "hard", "expert"].includes(String(value)) ? String(value) : null;
}

function normalizeLoopType(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "out_and_back") return "out-and-back";
  if (normalized === "point_to_point") return "point-to-point";
  if (["loop", "out-and-back", "point-to-point"].includes(normalized)) return normalized;
  return null;
}

function normalizeRiskLevel(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["low", "medium", "high", "unknown"].includes(normalized) ? normalized : "unknown";
}

function normalizePoiType(value: unknown): string {
  const normalized = String(value ?? "other").trim().toLowerCase();
  if (["viewpoint", "water", "food", "shelter", "landmark", "hazard", "other"].includes(normalized)) return normalized;
  if (normalized === "restaurant") return "food";
  if (normalized === "hut") return "shelter";
  if (normalized === "warning") return "hazard";
  return "other";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertAtlasConfigured(): void {
  if (!ATLAS_API_BASE_URL || !ATLAS_API_TOKEN) {
    throw new Error("Atlas bridge is not configured. Set ATLAS_API_BASE_URL and ATLAS_API_TOKEN in Supabase function secrets.");
  }
}

function json(body: unknown, status = 200): Response {
  if (status !== 200) {
    console.warn(`[Edge Function Response Error] Status: ${status}, Body:`, body);
    const errBody = typeof body === "object" && body !== null ? body : { error: String(body) };
    return new Response(JSON.stringify({ ...errBody, status }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
