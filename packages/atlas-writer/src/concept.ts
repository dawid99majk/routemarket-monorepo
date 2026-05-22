import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RouteProject, Source, ProjectRepository, Claim, Poi } from "../../atlas-core/src/index.js";

export type GenerateRouteConceptInput = {
  project: RouteProject;
  sources?: Source[];
  claims?: Claim[];
  pois?: Poi[];
  repository?: ProjectRepository;
  apiKey?: string;
  model?: string;
};

export async function generateRouteConcept(input: GenerateRouteConceptInput): Promise<string> {
  const apiKey = input.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  
  let concept: string;
  if (apiKey) {
    concept = await generateAiConcept(input, apiKey);
  } else {
    concept = generateTemplateConcept(input);
  }

  if (input.repository) {
    await input.repository.writeProjectFile(input.project.id, "route_concept.md", concept);
  } else {
    await writeFile(join(input.project.folderPath, "route_concept.md"), concept, "utf8");
  }
  return concept;
}

async function generateAiConcept(input: GenerateRouteConceptInput, apiKey: string): Promise<string> {
  const model = input.model ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const sourceContext = (input.sources ?? []).map(s => `- ${s.title}: ${s.url}`).join("\n");
  const claimContext = (input.claims ?? []).map(c => `- ${c.claim} (${c.status})`).join("\n");
  const poiContext = (input.pois ?? []).map(p => `- ${p.name} [${p.lat}, ${p.lng}]: ${p.description}`).join("\n");

  const prompt = `You are RouteMarket Atlas Strategist. Your goal is to create a "Route Master Blueprint" - a detailed concept for a new route.

PROJECT:
Title: ${input.project.title}
Category: ${input.project.category}
Region: ${input.project.region}

RESEARCH DATA:
SOURCES:
${sourceContext}

CLAIMS:
${claimContext}

POI:
${poiContext}

INSTRUCTIONS:
1. Be precise and factual. Strictly use the provided research data.
2. Avoid hallucinations. If info is missing, mark it as "to be verified".
3. Language: Polish (professional, technical).
4. Structure:
# Route Master Blueprint: ${input.project.title}
## 1. Wizja i Charakterystyka Trasy
## 2. Dlaczego warto? (USP)
## 3. Geographic Backbone (Critical POIs and flow)
## 4. Analiza Trudności i Bezpieczeństwa
## 5. Logistyka i Sprzęt

Return ONLY Markdown.`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    })
  });

  if (!response.ok) {
    console.warn("AI Concept generation failed, falling back to template.");
    return generateTemplateConcept(input);
  }

  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || generateTemplateConcept(input);
}

function generateTemplateConcept(input: GenerateRouteConceptInput): string {
  const sourceCount = input.sources?.length ?? 0;
  return `# Route Concept (Template)

## Working title
${input.project.title}

## Route promise
A practical ${input.project.category} route in ${input.project.region}.

## Target traveler
${targetTraveler(input.project.category)}

## Key research basis
Current source count: ${sourceCount}

## Note
This is a fallback template because GEMINI_API_KEY was not provided.
`;
}

function targetTraveler(category: string): string {
  const map: Record<string, string> = {
    motorcycle: "Adventure rider who wants scenic roads, surface notes, fuel awareness, and offline navigation.",
    hiking: "Independent hiker who wants a clear route, season notes, and safety context.",
    cycling: "Cyclists who wants a manageable ride with surface and logistics details.",
    running: "Runner who wants a clear route, distance confidence, and terrain notes.",
    city_walk: "City explorer who wants a self-guided route with useful stops.",
    roadtrip: "Road trip traveler who wants scenic flow, stops, and realistic timing."
  };
  return map[category] ?? "Route traveler who wants a practical, verified guide.";
}
