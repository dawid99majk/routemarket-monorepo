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
  const notesContext = input.repository
    ? await readProjectNotes(input.project.id, input.repository)
    : "";

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

CREATOR NOTES AND INTERVIEW:
${notesContext}

INSTRUCTIONS:
1. Be precise and factual. Use creator notes/interview first, then research data.
2. Avoid hallucinations. If info is missing, mark it as "do weryfikacji" and state what input is missing.
3. Language: Polish (professional, technical).
4. Structure:
# Route Master Blueprint: ${input.project.title}
## 1. Wizja i Charakterystyka Trasy
## 2. Dlaczego warto? (USP)
## 3. Przebieg trasy i punkty krytyczne
## 4. Dane do GPX: start, meta, punkty pośrednie
## 5. Analiza trudności i bezpieczeństwa
## 6. Logistyka i sprzęt

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
  const poiList = (input.pois ?? [])
    .slice(0, 8)
    .map((poi) => `- ${poi.name}${poi.lat && poi.lng ? ` (${poi.lat}, ${poi.lng})` : ""}`)
    .join("\n") || "- Brak potwierdzonych punktów POI.";
  return `# Route Master Blueprint: ${input.project.title}

## 1. Wizja i charakterystyka trasy
Koncepcja robocza dla kategorii ${input.project.category} w regionie ${input.project.region}. Ten dokument jest bazą do konspektu, GPX i przewodnika.

## 2. Dla kogo
${targetTraveler(input.project.category)}

## 3. Dane wejściowe
- Liczba źródeł: ${sourceCount}
- Region: ${input.project.region}
- Status: wymaga weryfikacji przez twórcę, jeśli brakuje startu/mety.

## 4. Punkty trasy
${poiList}

## 5. Braki do uzupełnienia
- Dokładny punkt startu.
- Punkt końcowy lub informacja, że trasa ma być pętlą.
- Preferowany dystans/czas.
- Ograniczenia nawierzchni i bezpieczeństwa.
`;
}

async function readProjectNotes(projectId: string, repository: ProjectRepository): Promise<string> {
  const files = ["notes.md", "input/notes/interview_answers.md", "route_concept.md"];
  const chunks: string[] = [];
  for (const file of files) {
    const content = await repository.readProjectFile(projectId, file).catch(() => "");
    if (content.trim()) chunks.push(`## ${file}\n${content}`);
  }
  return chunks.join("\n\n").slice(0, 12000);
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
