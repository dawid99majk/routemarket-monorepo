import type {
  Claim,
  MissingInputs,
  Poi,
  ProjectRepository,
  ResearchPack,
  RouteProject
} from "../../../atlas-core/src/index.js";
import {
  buildGpxXml,
  GoogleRoutesRoutingProvider,
  GraphHopperRoutingProvider,
  type RoutingProfile,
  type Waypoint,
  validateGpxXml
} from "../../../atlas-gis/src/index.js";

type RouteWaypoint = Waypoint & {
  name: string;
  type: Poi["type"];
  description?: string;
  source: string;
  sortOrder: number;
  evidence?: string;
};

export type RouteGpxGenerationResult = {
  status: "existing" | "generated" | "blocked";
  message: string;
  waypointCount: number;
  trackPointCount?: number;
  distanceKm?: number;
  gpxXml?: string;
};

export async function ensureRouteGpx(project: RouteProject, repository: ProjectRepository): Promise<RouteGpxGenerationResult> {
  const existing = await readExistingValidGpx(project, repository);
  if (existing) return existing;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) {
    await saveRouteMissingInputs(project, repository, "google_maps_missing", "Brakuje GOOGLE_MAPS_API_KEY, więc Atlas nie może wyznaczyć śladu po drogach.");
    return { status: "blocked", message: "Brakuje konfiguracji Google Maps API.", waypointCount: 0 };
  }

  const waypoints = await buildRouteWaypoints(project, repository, apiKey);
  if (waypoints.length < 2) {
    await saveRouteMissingInputs(project, repository, "route_waypoints_missing", "Brakuje co najmniej dwóch konkretnych punktów trasy. Dodaj start, koniec, postoje lub plik GPX.");
    await saveGenerationReport(project, repository, {
      status: "blocked",
      reason: "route_waypoints_missing",
      waypointCount: waypoints.length,
      waypoints
    });
    return {
      status: "blocked",
      message: "Nie da się uczciwie wygenerować GPX bez minimum dwóch konkretnych punktów trasy.",
      waypointCount: waypoints.length
    };
  }

  const profile = profileFromCategory(project.category);
  const graphHopperKey = process.env.GRAPHHOPPER_API_KEY || "";
  
  let routingProvider;
  let activeProviderName = "google_routes";
  
  if (graphHopperKey && profile === "hiking") {
    routingProvider = new GraphHopperRoutingProvider(graphHopperKey);
    activeProviderName = "graphhopper";
  } else {
    routingProvider = new GoogleRoutesRoutingProvider({ apiKey });
  }

  try {
    let route;
    let providerUsed = activeProviderName;
    try {
      if (activeProviderName === "graphhopper") {
        const segmentPoints: Waypoint[] = [];
        let totalDistanceKm = 0;
        let totalTimeH = 0;
        
        for (let i = 0; i < waypoints.length - 1; i++) {
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 2000)); // Tiny 250ms sleep to prevent 429 limits!
          }
          const start = waypoints[i];
          const end = waypoints[i + 1];
          const segmentResult = await routingProvider.getRoute([start, end], profile);
          if (i === 0) {
            segmentPoints.push(...segmentResult.points);
          } else {
            segmentPoints.push(...segmentResult.points.slice(1));
          }
          totalDistanceKm += segmentResult.distanceKm;
          totalTimeH += segmentResult.estimatedTimeH;
        }
        
        route = {
          points: segmentPoints,
          distanceKm: Math.round(totalDistanceKm * 100) / 100,
          estimatedTimeH: Math.round(totalTimeH * 100) / 100,
          geometryGeoJson: {
            type: "LineString" as const,
            coordinates: segmentPoints.map((p) => [p.lng, p.lat])
          }
        };
      } else {
        route = await routingProvider.getRoute(
          waypoints.map((point) => ({ lat: point.lat, lng: point.lng })),
          profile
        );
      }
    } catch (err) {
      if (activeProviderName === "graphhopper") {
        console.warn(`GraphHopper routing failed: ${err}. Falling back to Google Routes.`);
        const fallbackProvider = new GoogleRoutesRoutingProvider({ apiKey });
        route = await fallbackProvider.getRoute(
          waypoints.map((point) => ({ lat: point.lat, lng: point.lng })),
          profile
        );
        providerUsed = "google_routes";
      } else {
        throw err;
      }
    }
    const gpxXml = buildGpxXml(route, waypointsToPois(waypoints));
    const validation = validateGpxXml(gpxXml);
    if (!validation.valid) {
      throw new Error(`Generated GPX is invalid: ${validation.errors.join("; ")}`);
    }

    await repository.writeProjectFile(project.id, "route.gpx", gpxXml);
    await repository.writeProjectFile(project.id, "output/route.gpx", gpxXml).catch(() => undefined);
    await upsertGeneratedPoiArtifacts(project, repository, waypoints);
    await clearRouteMissingInputs(project, repository);
    await saveGenerationReport(project, repository, {
      status: "generated",
      provider: providerUsed,
      waypointCount: waypoints.length,
      trackPointCount: validation.trackPointCount,
      distanceKm: route.distanceKm,
      estimatedTimeH: route.estimatedTimeH,
      waypoints
    });

    return {
      status: "generated",
      message: `Wygenerowano GPX z ${waypoints.length} punktów używając ${providerUsed === 'graphhopper' ? 'GraphHopper (szlaki)' : 'Google Routes (drogi)'}.`,
      waypointCount: waypoints.length,
      trackPointCount: validation.trackPointCount,
      distanceKm: route.distanceKm,
      gpxXml
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveRouteMissingInputs(project, repository, "google_routes_failed", `Google Routes nie zwrócił poprawnej trasy: ${message}`);
    await saveGenerationReport(project, repository, {
      status: "blocked",
      reason: "google_routes_failed",
      message,
      waypointCount: waypoints.length,
      waypoints
    });
    return {
      status: "blocked",
      message: `Nie udało się wygenerować GPX przez Google Routes: ${message}`,
      waypointCount: waypoints.length
    };
  }
}

async function readExistingValidGpx(project: RouteProject, repository: ProjectRepository): Promise<RouteGpxGenerationResult | undefined> {
  try {
    const gpxXml = await repository.readProjectFile(project.id, "route.gpx");
    const validation = validateGpxXml(gpxXml);
    if (validation.valid) {
      return {
        status: "existing",
        message: "Projekt ma już poprawny plik GPX.",
        waypointCount: 0,
        trackPointCount: validation.trackPointCount,
        gpxXml
      };
    }
  } catch {
    // No existing GPX, generate below.
  }
  return undefined;
}

async function buildRouteWaypoints(project: RouteProject, repository: ProjectRepository, apiKey: string): Promise<RouteWaypoint[]> {
  const candidates: RouteWaypoint[] = [];
  candidates.push(...await loadPoiWaypoints(project, repository));
  candidates.push(...await extractCoordinateWaypoints(project, repository));

  if (candidates.length < 2) {
    const aiWaypoints = await extractExplicitWaypointsWithGemini(project, repository);
    candidates.push(...await geocodeWaypointCandidates(project, aiWaypoints, apiKey));
  }
  if (candidates.length < 2) {
    candidates.push(...await geocodeWaypointCandidates(project, buildRegionalFallbackWaypointCandidates(project), apiKey));
  }

  return deduplicateWaypoints(candidates)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 25);
}

async function loadPoiWaypoints(project: RouteProject, repository: ProjectRepository): Promise<RouteWaypoint[]> {
  const waypoints: RouteWaypoint[] = [];

  try {
    const candidateData = await repository.loadArtifact(project.id, "poi_candidates");
    const pois = Array.isArray(candidateData?.pois) ? candidateData.pois : [];
    pois.forEach((poi: any, index: number) => {
      const point = toWaypoint(poi, "poi_candidates", index);
      if (point) waypoints.push(point);
    });
  } catch {}

  try {
    const geojson = JSON.parse(await repository.readProjectFile(project.id, "poi.geojson"));
    if (Array.isArray(geojson?.features)) {
      geojson.features.forEach((feature: any, index: number) => {
        const coords = feature.geometry?.coordinates;
        const point = toWaypoint({
          name: feature.properties?.name ?? `POI ${index + 1}`,
          type: feature.properties?.type ?? "landmark",
          description: feature.properties?.description,
          lat: Number(coords?.[1]),
          lng: Number(coords?.[0]),
          sortOrder: feature.properties?.sortOrder ?? index
        }, "poi.geojson", index);
        if (point) waypoints.push(point);
      });
    }
  } catch {}

  return waypoints;
}

async function extractCoordinateWaypoints(project: RouteProject, repository: ProjectRepository): Promise<RouteWaypoint[]> {
  const files = ["route_concept.md", "guide_outline.md", "notes.md", "input/notes/interview_answers.md"];
  const waypoints: RouteWaypoint[] = [];
  let index = 0;

  for (const file of files) {
    const text = await repository.readProjectFile(project.id, file).catch(() => "");
    for (const match of text.matchAll(/(?:lat(?:itude)?[:=\s]+)(-?\d{1,2}\.\d+)[,\s]+(?:lng|lon|longitude)[:=\s]+(-?\d{1,3}\.\d+)/gi)) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (!isValidCoord(lat, lng)) continue;
      waypoints.push({
        name: `Punkt ${index + 1}`,
        type: "landmark",
        lat,
        lng,
        source: file,
        sortOrder: index++,
        evidence: match[0]
      });
    }
  }

  return waypoints;
}

type AiWaypointCandidate = {
  name: string;
  query?: string;
  type?: Poi["type"];
  description?: string;
  lat?: number;
  lng?: number;
  evidence?: string;
};

async function extractExplicitWaypointsWithGemini(project: RouteProject, repository: ProjectRepository): Promise<AiWaypointCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return [];

  const context = await buildTextContext(project, repository);
  if (context.trim().length < 80) return [];

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = `Jesteś ekspertem GIS. Twoim zadaniem jest wyodrębnienie lub ZAPROPONOWANIE konkretnych punktów trasy do wygenerowania pliku GPX.

PROJEKT: ${project.title}
KATEGORIA: ${project.category}
REGION: ${project.region}

MATERIAŁY TWÓRCY:
${context}

ZASADY:
1. Jeśli materiały zawierają konkretne miejsca (schroniska, szczyty, ulice, parkingi) - użyj ich jako priorytet.
2. Jeśli materiały są ogólne (np. tylko "Tatry"), ZAPROPONUJE logiczny przebieg trasy zgodny z kategorią (${project.category}). 
   - Przykład dla trekkingu w Tatrach: Kuźnice -> Murowaniec -> Czarny Staw -> Kuźnice.
   - Przykład dla moto: Najbliższa trasa widokowa w regionie.
3. Musisz zwrócić MINIMUM 2 punkty (Start i Koniec), a najlepiej 3-5.
4. Dla każdego punktu podaj "query" do geokodowania (np. "Schronisko Murowaniec, Zakopane").
5. Zachowaj logiczną kolejność.

Zwróć TYLKO JSON:
[
  {"name":"...", "query":"...", "type":"landmark|viewpoint|water|food|shelter|hazard|other", "description":"...", "evidence":"Zidentyfikowano w notatkach / Zaproponowano jako logiczny start"}
]`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });
    if (!response.ok) return [];
    const data = await response.json() as any;
    return parseWaypointJson(data.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch {
    return [];
  }
}

async function buildTextContext(project: RouteProject, repository: ProjectRepository): Promise<string> {
  const chunks: string[] = [];

  try {
    const pack = JSON.parse(await repository.readProjectFile(project.id, "research_pack.json")) as ResearchPack;
    for (const material of pack.materials ?? []) {
      if (material.status === "duplicate" || material.status === "unsupported") continue;
      chunks.push(`## ${material.title}\n${material.content}`);
    }
  } catch {}

  for (const file of ["notes.md", "input/notes/interview_answers.md", "route_concept.md", "guide_outline.md"]) {
    const content = await repository.readProjectFile(project.id, file).catch(() => "");
    if (content.trim()) chunks.push(`## ${file}\n${content}`);
  }

  try {
    const claims = await repository.loadClaims(project.id);
    const relevant = claims
      .filter((claim: Claim) => ["poi", "logistics", "route_segment", "access", "safety"].includes(claim.claimType))
      .map((claim: Claim) => `- ${claim.claim}`)
      .join("\n");
    if (relevant) chunks.push(`## Claims\n${relevant}`);
  } catch {}

  return chunks.join("\n\n").slice(0, 18000);
}

async function geocodeWaypointCandidates(project: RouteProject, candidates: AiWaypointCandidate[], apiKey: string): Promise<RouteWaypoint[]> {
  const waypoints: RouteWaypoint[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate?.name) continue;

    let lat = Number(candidate.lat);
    let lng = Number(candidate.lng);
    if (!isValidCoord(lat, lng)) {
      const resolved = await geocode(candidate.query || candidate.name, project.region, apiKey);
      lat = resolved?.lat ?? NaN;
      lng = resolved?.lng ?? NaN;
    }

    if (!isValidCoord(lat, lng)) continue;
    waypoints.push({
      name: candidate.name,
      type: normalizePoiType(candidate.type),
      description: candidate.description,
      lat,
      lng,
      source: "gemini_explicit_waypoint_extraction",
      sortOrder: index,
      evidence: candidate.evidence
    });
  }

  return waypoints;
}

async function geocode(query: string, region: string | undefined, apiKey: string): Promise<Waypoint | undefined> {
  const address = [query, region && !query.toLowerCase().includes(region.toLowerCase()) ? region : ""]
    .filter(Boolean)
    .join(", ");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || data.status !== "OK" || !data.results?.[0]?.geometry?.location) return undefined;
  const location = data.results[0].geometry.location;
  return { lat: Number(location.lat), lng: Number(location.lng) };
}

function toWaypoint(poi: Partial<Poi> & Record<string, any>, source: string, fallbackOrder: number): RouteWaypoint | undefined {
  const lat = Number(poi.lat);
  const lng = Number(poi.lng);
  if (!isValidCoord(lat, lng)) return undefined;
  if (poi.status === "rejected" || poi.approvalStatus === "rejected") return undefined;

  return {
    name: String(poi.name || `Punkt ${fallbackOrder + 1}`),
    type: normalizePoiType(poi.type),
    description: poi.description,
    lat,
    lng,
    source,
    sortOrder: Number.isFinite(Number(poi.sortOrder)) ? Number(poi.sortOrder) : fallbackOrder,
    evidence: poi.evidence
  };
}

function parseWaypointJson(text?: string): AiWaypointCandidate[] {
  if (!text) return [];
  const cleaned = text.replace(/```json\s?|```\s?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed.slice(0, 25) : [];
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed.slice(0, 25) : [];
    } catch {
      return [];
    }
  }
}

function buildRegionalFallbackWaypointCandidates(project: RouteProject): AiWaypointCandidate[] {
  const region = `${project.title} ${project.region}`.toLowerCase();
  const category = String(project.category || "").toLowerCase();

  if (region.includes("tatr")) {
    if (category.includes("motor")) {
      return routeCandidates([
        ["Zakopane", "Zakopane, Polska"],
        ["Droga Oswalda Balzera", "Droga Oswalda Balzera, Zakopane"],
        ["Łysa Polana", "Łysa Polana, Tatry"],
        ["Zakopane", "Zakopane, Polska"]
      ]);
    }
    return routeCandidates([
      ["Kuźnice", "Kuźnice, Zakopane"],
      ["Hala Gąsienicowa", "Schronisko Murowaniec, Hala Gąsienicowa"],
      ["Czarny Staw Gąsienicowy", "Czarny Staw Gąsienicowy, Tatry"],
      ["Kuźnice", "Kuźnice, Zakopane"]
    ]);
  }

  if (region.includes("dolomit")) {
    return routeCandidates([
      ["Cortina d'Ampezzo", "Cortina d'Ampezzo, Dolomites"],
      ["Passo Giau", "Passo Giau, Dolomites"],
      ["Passo Falzarego", "Passo Falzarego, Dolomites"],
      ["Cortina d'Ampezzo", "Cortina d'Ampezzo, Dolomites"]
    ]);
  }

  if (region.includes("bieszczad")) {
    return routeCandidates([
      ["Ustrzyki Górne", "Ustrzyki Górne, Bieszczady"],
      ["Połonina Caryńska", "Połonina Caryńska, Bieszczady"],
      ["Brzegi Górne", "Brzegi Górne, Bieszczady"]
    ]);
  }

  const fallbackRegion = project.region || project.title || "Polska";
  return routeCandidates([
    [`Start: ${fallbackRegion}`, `${fallbackRegion}, centrum`],
    [`Punkt widokowy: ${fallbackRegion}`, `${fallbackRegion}, punkt widokowy`],
    [`Meta: ${fallbackRegion}`, `${fallbackRegion}, centrum`]
  ]);
}

function routeCandidates(points: Array<[string, string]>): AiWaypointCandidate[] {
  return points.map(([name, query], index) => ({
    name,
    query,
    type: index === 0 ? "landmark" : "viewpoint",
    description: "Punkt zaproponowany automatycznie, bo w projekcie brakowało konkretnego GPX.",
    evidence: "Best-effort fallback: wymaga późniejszej weryfikacji twórcy."
  }));
}

async function upsertGeneratedPoiArtifacts(project: RouteProject, repository: ProjectRepository, waypoints: RouteWaypoint[]): Promise<void> {
  const features = waypoints.map((point) => ({
    type: "Feature",
    properties: {
      id: `route_wp_${point.sortOrder + 1}`,
      name: point.name,
      type: point.type,
      status: "suggested",
      description: point.description,
      sortOrder: point.sortOrder,
      source: point.source,
      evidence: point.evidence
    },
    geometry: {
      type: "Point",
      coordinates: [point.lng, point.lat]
    }
  }));

  const geojson = { type: "FeatureCollection", features };
  await repository.writeProjectFile(project.id, "poi.geojson", `${JSON.stringify(geojson, null, 2)}\n`);
  await repository.saveArtifact(project.id, "poi_candidates", {
    projectId: project.id,
    updatedAt: new Date().toISOString(),
    pois: waypointsToPois(waypoints)
  });
}

function waypointsToPois(waypoints: RouteWaypoint[]): Poi[] {
  return waypoints.map((point, index) => ({
    id: `route_wp_${index + 1}`,
    name: point.name,
    type: point.type,
    lat: point.lat,
    lng: point.lng,
    description: point.description,
    sortOrder: index,
    status: "suggested"
  }));
}

async function saveRouteMissingInputs(project: RouteProject, repository: ProjectRepository, code: string, message: string): Promise<void> {
  const existing = await repository.loadMissingInputs(project.id).catch(() => ({ missing: [] }));
  const otherMissing = Array.isArray(existing?.missing)
    ? existing.missing.filter((item: any) => !String(item.code || "").startsWith("route_") && item.code !== "google_maps_missing" && item.code !== "google_routes_failed")
    : [];
  const missing: MissingInputs = {
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    blocking: true,
    missing: [
      ...otherMissing,
      { code, message, requiredFor: "gpx" }
    ]
  };
  await repository.saveMissingInputs(project.id, missing);
}

async function clearRouteMissingInputs(project: RouteProject, repository: ProjectRepository): Promise<void> {
  const existing = await repository.loadMissingInputs(project.id).catch(() => ({ missing: [] }));
  const remaining = Array.isArray(existing?.missing)
    ? existing.missing.filter((item: any) => !String(item.code || "").startsWith("route_") && item.code !== "google_maps_missing" && item.code !== "google_routes_failed")
    : [];
  await repository.saveMissingInputs(project.id, {
    ...existing,
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    blocking: remaining.length > 0 ? Boolean(existing.blocking) : false,
    missing: remaining
  });
}

async function saveGenerationReport(project: RouteProject, repository: ProjectRepository, report: Record<string, unknown>): Promise<void> {
  await repository.saveArtifact(project.id, "route_generation_report", {
    projectId: project.id,
    updatedAt: new Date().toISOString(),
    ...report
  });
}

function deduplicateWaypoints(points: RouteWaypoint[]): RouteWaypoint[] {
  const result: RouteWaypoint[] = [];
  for (const point of points) {
    const duplicate = result.some((existing) => {
      const sameName = existing.name.toLowerCase() === point.name.toLowerCase();
      const close = haversine(existing, point) < 0.1;
      return sameName || close;
    });
    if (!duplicate) result.push(point);
  }
  return result;
}

function normalizePoiType(type?: string): Poi["type"] {
  const allowed = new Set(["viewpoint", "water", "food", "shelter", "landmark", "hazard", "other"]);
  return allowed.has(String(type)) ? type as Poi["type"] : "landmark";
}

function profileFromCategory(category?: string): RoutingProfile {
  const cat = (category || "").toLowerCase();
  if (cat.includes("bike") || cat.includes("cycling") || cat.includes("rower")) return "bike";
  if (cat.includes("trek") || cat.includes("hik") || cat.includes("walk") || cat.includes("pies")) return "hiking";
  return "motorcycle";
}

function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0);
}

function haversine(a: Waypoint, b: Waypoint): number {
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(value: number): number {
  return value * Math.PI / 180;
}
