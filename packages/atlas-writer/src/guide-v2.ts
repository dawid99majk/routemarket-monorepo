import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Claim,
  type Poi,
  type RouteProject,
  type RouteSummary,
  type Approvals,
  type MissingInputs,
  type MissingInputItem,
  type ProjectRepository
} from "../../atlas-core/src/index.js";

export async function writeGuideOutline(project: RouteProject, repository?: ProjectRepository): Promise<string> {
  const outline = `# Outline for ${project.title}
1. Introduction
2. Key Highlights
3. Route Details
4. Preparation
5. Conclusion`;
  if (repository) {
    await repository.writeProjectFile(project.id, "guide_outline.md", outline);
  } else {
    await writeFile(join(project.folderPath, "guide_outline.md"), outline, "utf8");
  }
  return outline;
}

export async function generateLegacyGuideDraft(input: { project: RouteProject; sources?: any[]; concept?: string }): Promise<string> {
  // Legacy method for MVP1 compatibility
  const guide = `# ${input.project.title} (Draft)

## Route overview

This is an internal draft shell for ${input.project.category} route planning in ${input.project.region}. It is not a final RouteMarket guide.

## Source coverage

Current source count: ${input.sources?.length ?? 0}
`;
  await writeFile(join(input.project.folderPath, "guide.md"), guide, "utf8");
  return guide;
}

export async function validateGuideInputs(project: RouteProject, repository?: ProjectRepository): Promise<MissingInputs | undefined> {
  const summary = await readRouteSummary(project, repository);
  const pack = await readResearchPack(project, repository);
  const claims = await readClaims(project, repository);
  const concept = await readConcept(project, repository);
  const approvals = await readApprovals(project, repository);
  
  const missing: MissingInputItem[] = [];

  if (!summary) {
    missing.push({ code: "missing_route_summary", message: "route_summary.json is missing.", requiredFor: "guide_final" });
  } else {
    if (summary.distanceKm === undefined || summary.distanceKm <= 0) {
      missing.push({ code: "invalid_distance", message: "Route distance must be greater than 0.", requiredFor: "guide_final" });
    }
    if (summary.validationStatus === "needs_validation") {
      missing.push({ code: "needs_gpx_validation", message: "GPX summary needs human approval.", requiredFor: "guide_final" });
    }
  }

  if (!pack || !pack.materials || pack.materials.length === 0) {
    missing.push({ code: "missing_research", message: "Research pack requires at least 1 material.", requiredFor: "guide_final" });
  }

  const verifiedClaims = claims.filter(c => c.status === "verified" || c.status === "likely");
  if (claims.length < 3 || verifiedClaims.length < 2) {
    missing.push({ code: "insufficient_claims", message: "At least 3 claims (min 2 verified/likely) required.", requiredFor: "guide_final" });
  }

  const outlineApproved = approvals?.approvals.some((a: any) => a.stage === "guide_outline_approval" && a.decision === "approved");
  if (!outlineApproved) {
    missing.push({ code: "missing_outline_approval", message: "Guide outline must be approved before final guide generation.", requiredFor: "guide_final" });
  }

  if (!concept || isWeakConcept(concept)) {
    missing.push({ code: "missing_route_concept", message: "A real route concept is required before final guide generation.", requiredFor: "guide_final" });
  }
  missing.push(...missingMandatorySectionFacts(project.category, verifiedClaims));

  if (missing.length > 0) {
    return {
      projectId: project.id,
      generatedAt: new Date().toISOString(),
      blocking: true,
      missing
    };
  }
  return undefined;
}

export async function generateGuideV2(project: RouteProject, repository?: ProjectRepository): Promise<string | undefined> {
  const missingInputs = await validateGuideInputs(project, repository);

  if (missingInputs) {
    if (repository) {
      await repository.saveMissingInputs(project.id, missingInputs);
    } else {
      await writeFile(join(project.folderPath, "missing_inputs.json"), JSON.stringify(missingInputs, null, 2), "utf8");
    }
    console.warn(`Guide generation blocked by missing inputs for project ${project.id}`);
    return undefined;
  }

  // Clear missing inputs if fixed
  try {
    if (repository) {
      await repository.saveMissingInputs(project.id, { missing: [] });
    } else {
      const { unlink } = await import("node:fs/promises");
      await unlink(join(project.folderPath, "missing_inputs.json"));
    }
  } catch {}

  const summary = (await readRouteSummary(project, repository))!;
  const pack = (await readResearchPack(project, repository))!;
  const claims = await readClaims(project, repository);
  const pois = await readPois(project, repository);
  const concept = await readConcept(project, repository);

  const warnings = summary.warnings ?? [];
  const segments = summary.routeSegments ?? [];
  const trustedMaterials = pack.materials.filter((m: any) => m.status === "active" || m.status === "usable");
  
  const sectionClaims = {
    logistics: claimsForTypes(claims, ["logistics", "distance", "access"]),
    safety: claimsForTypes(claims, ["safety", "legal"]),
    season: claimsForTypes(claims, ["season"]),
    practical: claimsForTypes(claims, ["surface", "logistics", "access"])
  };
  markUsed(sectionClaims.logistics, "logistics");
  markUsed(sectionClaims.safety, "safety");
  markUsed(sectionClaims.season, "season_notes");
  markUsed(sectionClaims.practical, "preparation");
  
  if (repository) {
    await repository.saveClaims(project.id, claims);
  } else {
    const { writeJsonFile } = await import("../../atlas-core/src/index.js");
    await writeJsonFile(join(project.folderPath, "claims.json"), claims);
  }

  const quickFacts = [
    `Distance: ${summary.distanceKm} km`,
    summary.elevationGainM !== undefined ? `Elevation gain: ${summary.elevationGainM} m` : null,
    summary.estimatedTimeH !== undefined ? `Estimated time: ${summary.estimatedTimeH} h` : null,
    summary.difficulty ? `Difficulty: ${summary.difficulty}` : null,
    summary.loopType ? `Loop type: ${summary.loopType}` : null,
    summary.startPoint ? `Start: ${summary.startPoint}` : null,
    summary.endPoint ? `Finish: ${summary.endPoint}` : null
  ].filter(Boolean).map(f => `- ${f}`).join("\n");

  const segmentsText = segments.length ? segments.map(segment => {
    const sFacts = [
      `Distance: ${segment.distanceKm} km`,
      segment.elevationGainM !== undefined ? `Elevation gain: ${segment.elevationGainM} m` : null,
      segment.estimatedTimeH !== undefined ? `Estimated time: ${segment.estimatedTimeH} h` : null
    ].filter(Boolean).map(f => `- ${f}`).join("\n");
    return `### Segment ${segment.index}: ${segment.from} to ${segment.to}\n\n${sFacts}`;
  }).join("\n\n") : "";

  const poisText = pois.length ? pois.map(p => `### ${p.name}\n\n${p.description || ""}`).join("\n\n") : "";
  const warningsText = warnings.length ? warnings.map((warning: any) => `- ${warning.message}`).join("\n") : "";
  const routeValue = extractConceptSection(concept!, "Route promise");
  const audience = targetAudience(project.category);

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  let guide: string;

  if (apiKey) {
    try {
      guide = await generateAiGuideV2({
        project,
        summary,
        claims,
        pois,
        concept: concept || "",
        sources: trustedMaterials,
        apiKey
      });
    } catch (error) {
      console.warn("AI Guide generation failed, falling back to template:", error);
      guide = constructTemplateGuideV2(project, summary, segmentsText, poisText, sectionClaims, audience, routeValue, trustedMaterials, claims, warningsText);
    }
  } else {
    guide = constructTemplateGuideV2(project, summary, segmentsText, poisText, sectionClaims, audience, routeValue, trustedMaterials, claims, warningsText);
  }

  if (repository) {
    await repository.writeProjectFile(project.id, "guide.md", guide);
  } else {
    await writeFile(join(project.folderPath, "guide.md"), guide, "utf8");
  }
  return guide;
}

function constructTemplateGuideV2(
  project: RouteProject,
  summary: RouteSummary,
  segmentsText: string,
  poisText: string,
  sectionClaims: any,
  audience: string,
  routeValue: string,
  trustedMaterials: any[],
  claims: Claim[],
  warningsText: string
): string {
  const quickFacts = [
    `Distance: ${summary.distanceKm} km`,
    summary.elevationGainM !== undefined ? `Elevation gain: ${summary.elevationGainM} m` : null,
    summary.estimatedTimeH !== undefined ? `Estimated time: ${summary.estimatedTimeH} h` : null,
    summary.difficulty ? `Difficulty: ${summary.difficulty}` : null,
    summary.loopType ? `Loop type: ${summary.loopType}` : null,
    summary.startPoint ? `Start: ${summary.startPoint}` : null,
    summary.endPoint ? `Finish: ${summary.endPoint}` : null
  ].filter(Boolean).map(f => `- ${f}`).join("\n");

  const guideBlocks = [
    `# ${project.title}`,
    `## Overview\n\nThis guide is based on validated GPX facts, creator materials and reviewed route claims. The route covers ${summary.distanceKm} km in ${project.region}, with ${summary.isLoop ? "a loop format" : "a point-to-point format"}.\n\nTarget audience: ${audience}\nRoute value: ${routeValue}`,
    `## Route Facts\n${quickFacts}`,
    `## Day by Day\n\n${segmentsText || "Refer to GPX segments."}`,
    `## Parking\n\n${renderClaims(sectionClaims.practical)}`,
    `## Food\n\nCheck local settlements along the route.`,
    `## Water\n\n${renderClaims(sectionClaims.logistics)}`,
    `## Accommodation\n\nCheck local options in ${project.region}.`,
    `## Danger\n\n${renderClaims(sectionClaims.safety)}\n${warningsText}`,
    `## Weather\n\n${renderClaims(sectionClaims.season)}`,
    `## Gear\n\n- GPX navigation device\n- Water and nutrition\n- First aid kit`,
    `## Tips\n\nCheck local regulations and seasonal accessibility.`,
    `## POI\n\n${poisText || "See GPX for POIs."}`,
    `## Alternatives\n\n- Shorten the route at a verified settlement, trailhead or road junction.\n- Extend only after validating extra GPX distance.`,
    `## Checklist\n\n- [ ] GPX downloaded\n- [ ] Weather checked\n- [ ] Gear verified\n- [ ] Emergency contacts shared`,
    trustedMaterials.length ? `## Sources\n\n${trustedMaterials.map((material: any) => `- ${material.title}${material.sourceUrl ? ` (${material.sourceUrl})` : ""}`).join("\n")}` : null,
    `## Disclaimer\n\nThis guide is an editorial navigation aid, not a guarantee of access, safety, weather, legality or current field conditions.`
  ].filter(Boolean).join("\n\n");

  return guideBlocks + "\n";
}

async function generateAiGuideV2(input: {
  project: RouteProject;
  summary: RouteSummary;
  claims: Claim[];
  pois: Poi[];
  concept: string;
  sources: any[];
  apiKey: string;
  model?: string;
}): Promise<string> {
  const model = input.model ?? "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.apiKey}`;

  const claimContext = input.claims.map(c => `- ${c.claim} (Status: ${c.status}, Type: ${c.claimType})`).join("\n");
  const poiContext = input.pois.map(p => `- ${p.name}: ${p.description}`).join("\n");
  const sourceContext = input.sources.map(s => `- ${s.title} (${s.sourceUrl || "no URL"})`).join("\n");

  const categoryFocus = getCategorySpecificPrompt(input.project.category);

  const prompt = `You are a RouteMarket Premium Guide Writer. Your goal is to create a "Premium Route Guide 2.0" - a highly structured, professional, and practical guide for a ${input.project.category} route.

PROJECT:
Title: ${input.project.title}
Region: ${input.project.region}
Category: ${input.project.category}

ROUTE FACTS:
Distance: ${input.summary.distanceKm} km
Elevation Gain: ${input.summary.elevationGainM ?? "N/A"} m
Estimated Time: ${input.summary.estimatedTimeH ?? "N/A"} h
Difficulty: ${input.summary.difficulty ?? "N/A"}
Loop: ${input.summary.isLoop ? "Yes" : "No"}

CONCEPT:
${input.concept}

CLAIMS & RESEARCH:
${claimContext}

POINTS OF INTEREST:
${poiContext}

SOURCES:
${sourceContext}

REQUIRED SECTIONS:
You MUST use the following exact Markdown headers in this order:
## Overview
## Route Facts
## Day by Day
## Parking
## Food
## Water
## Accommodation
## Danger
## Weather
## Gear
## Tips
## POI
## Alternatives
## Checklist

CATEGORY SPECIFIC FOCUS:
${categoryFocus}

INSTRUCTIONS:
1. Language: Polish (professional, technical, helpful).
2. Content: Be precise and factual. Strictly use the provided research data and claims.
3. If information for a section is missing from the data, do not hallucinate. Write "Brak danych" or "Do zweryfikowania" but keep the header.
4. "Day by Day" should be a logical breakdown of the route (e.g. into days or stages).
5. "Checklist" should be a practical list of things to do/take.
6. Return ONLY Markdown.
`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    })
  });

  if (!response.ok) {
    throw new Error(`AI Guide generation failed: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("AI Guide generation returned empty content");
  
  return content;
}

function getCategorySpecificPrompt(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes("motorcycle")) {
    return "Focus on asphalt quality, serpentines (serpentyny), parking, and fuel (paliwo).";
  }
  if (cat.includes("bike") || cat.includes("cycling")) {
    return "Focus on surface (nawierzchnia), elevation (przewyższenia), and service points (serwis).";
  }
  if (cat.includes("trekking") || cat.includes("hiking")) {
    return "Focus on water access (woda), accommodation/shelters (noclegi), permits (permit), and safety/weather risks.";
  }
  return "";
}

function isWeakConcept(concept: string): boolean {
  const lower = concept.toLowerCase();
  return concept.trim().length < 250 || lower.includes("concept status: not designed") || lower.includes("to be confirmed");
}

function missingMandatorySectionFacts(category: string, claims: Claim[]): MissingInputItem[] {
  const missing: MissingInputItem[] = [];
  const has = (types: Claim["claimType"][]) => claims.some((claim) => types.includes(claim.claimType));
  if (category === "motorcycle") {
    if (!has(["logistics", "distance", "access"])) missing.push({ code: "missing_motorcycle_logistics", message: "Motorcycle guide requires reviewed logistics facts.", requiredFor: "guide_final" });
    if (!has(["safety", "legal"])) missing.push({ code: "missing_motorcycle_safety", message: "Motorcycle guide requires reviewed safety facts.", requiredFor: "guide_final" });
    if (!has(["surface", "logistics", "access"])) missing.push({ code: "missing_motorcycle_practical_claim", message: "Motorcycle guide requires at least one practical route claim.", requiredFor: "guide_final" });
  }
  if (category === "hiking" || category === "trekking") {
    if (!has(["safety"])) missing.push({ code: "missing_hiking_safety", message: "Hiking guide requires reviewed safety facts.", requiredFor: "guide_final" });
    if (!has(["season"])) missing.push({ code: "missing_hiking_weather", message: "Hiking guide requires reviewed season/weather facts.", requiredFor: "guide_final" });
    if (!has(["logistics", "access"])) missing.push({ code: "missing_hiking_logistics", message: "Hiking guide requires reviewed water, gear or logistics facts.", requiredFor: "guide_final" });
  }
  return missing;
}

function targetAudience(category: string): string {
  const audiences: Record<string, string> = {
    motorcycle: "Adventure motorcyclists who need route shape, surface risk, fuel awareness and offline navigation confidence.",
    hiking: "Independent hikers who need realistic timing, terrain notes, water planning and safety context.",
    cycling: "Cyclists who need distance, elevation, surface expectations and reliable logistics.",
    city_walk: "Self-guided walkers who want a coherent route with worthwhile stops and simple navigation.",
    roadtrip: "Drivers who want scenic flow, practical stops and realistic time planning."
  };
  return audiences[category] ?? "";
}

function extractConceptSection(concept: string, heading: string): string {
  const lines = concept.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (index === -1) return "";
  const collected: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.startsWith("## ")) break;
    if (line.trim()) collected.push(line.trim());
  }
  return collected.join(" ");
}

function claimsForTypes(claims: Claim[], types: Claim["claimType"][]): Claim[] {
  return claims.filter((claim) => (claim.status === "verified" || claim.status === "likely") && types.includes(claim.claimType));
}

function renderClaims(claims: Claim[]): string {
  return claims.map((claim) => `- ${claim.claim}`).join("\n");
}

function markUsed(claims: Claim[], section: string): void {
  for (const claim of claims) {
    claim.usedInSections = [...new Set([...(claim.usedInSections ?? []), section])];
  }
}

function reviewSummary(sectionClaims: Record<string, Claim[]>): string {
  return Object.entries(sectionClaims)
    .filter(([_, claims]) => claims.length > 0)
    .map(([section, claims]) => `- ${section}: ${claims.length} supporting claim(s)`)
    .join("\n");
}

// Helpers
async function readRouteSummary(project: RouteProject, repository?: ProjectRepository): Promise<RouteSummary | undefined> {
  try {
    if (repository) return await repository.loadSummary(project.id);
    const { readJsonFile } = await import("../../atlas-core/src/index.js");
    return await readJsonFile<RouteSummary>(join(project.folderPath, "route_summary.json"));
  } catch {
    return undefined;
  }
}

async function readResearchPack(project: RouteProject, repository?: ProjectRepository): Promise<any> {
  try {
    if (repository) {
      const content = await repository.readProjectFile(project.id, "research_pack.json");
      return JSON.parse(content);
    }
    const { readJsonFile } = await import("../../atlas-core/src/index.js");
    return await readJsonFile<any>(join(project.folderPath, "research_pack.json"));
  } catch {
    return undefined;
  }
}

async function readClaims(project: RouteProject, repository?: ProjectRepository): Promise<Claim[]> {
  try {
    if (repository) return await repository.loadClaims(project.id);
    const { readJsonFile } = await import("../../atlas-core/src/index.js");
    return await readJsonFile<Claim[]>(join(project.folderPath, "claims.json"));
  } catch {
    return [];
  }
}

async function readPois(project: RouteProject, repository?: ProjectRepository): Promise<Poi[]> {
  try {
    const content = repository 
      ? await repository.readProjectFile(project.id, "poi.geojson")
      : await readFile(join(project.folderPath, "poi.geojson"), "utf8");
    const geojson = JSON.parse(content);
    return geojson.features.map((f: any) => ({
      name: f.properties.name,
      description: f.properties.description
    }));
  } catch {
    return [];
  }
}

async function readConcept(project: RouteProject, repository?: ProjectRepository): Promise<string | undefined> {
  try {
    if (repository) return await repository.readProjectFile(project.id, "route_concept.md");
    return await readFile(join(project.folderPath, "route_concept.md"), "utf8");
  } catch {
    return undefined;
  }
}

async function readApprovals(project: RouteProject, repository?: ProjectRepository): Promise<Approvals | undefined> {
  try {
    if (repository) return await repository.loadApprovals(project.id);
    const { readJsonFile } = await import("../../atlas-core/src/index.js");
    return await readJsonFile<Approvals>(join(project.folderPath, "approvals.json"));
  } catch {
    return undefined;
  }
}
