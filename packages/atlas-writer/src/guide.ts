import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RouteProject, Source, ProjectRepository, Claim, Poi } from "../../atlas-core/src/index.js";

export type GenerateGuideDraftInput = {
  project: RouteProject;
  sources?: Source[];
  claims?: Claim[];
  pois?: Poi[];
  concept?: string;
  repository?: ProjectRepository;
  apiKey?: string;
  model?: string;
};

export async function generateGuideDraft(input: GenerateGuideDraftInput): Promise<string> {
  const apiKey = input.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  
  let guide: string;
  if (apiKey) {
    guide = await generateAiGuide(input, apiKey);
  } else {
    guide = generateTemplateGuide(input);
  }

  if (input.repository) {
    await input.repository.writeProjectFile(input.project.id, "guide.md", guide);
  } else {
    await writeFile(join(input.project.folderPath, "guide.md"), guide, "utf8");
  }
  return guide;
}

async function generateAiGuide(input: GenerateGuideDraftInput, apiKey: string): Promise<string> {
  const model = input.model ?? "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const sourceContext = (input.sources ?? []).map(s => `- ${s.title}: ${s.url}`).join("\n");
  const claimContext = (input.claims ?? []).map(c => `- ${c.claim} (${c.status})`).join("\n");
  const poiContext = (input.pois ?? []).map(p => `- ${p.name}: ${p.description}`).join("\n");

  const prompt = `You are RouteMaster AI, an elite travel guide author for RouteMarket. Your goal is to write a PREMIUM, high-quality route guide based on research facts.

PROJECT:
Title: ${input.project.title}
Category: ${input.project.category}
Region: ${input.project.region}

RESEARCH DATA:
SOURCES:
${sourceContext}

CLAIMS:
${claimContext}

POI (Practical & Scenic):
${poiContext}

CONCEPT:
${input.concept || "No concept draft provided."}

INSTRUCTIONS:
1. Write a professional, inspiring travel guide. Language: Polski.
2. Be EXTREMELY SPECIFIC. Use numbers, names of shelters, specific parking coordinates if available.
3. ABSOLUTELY NO HALLUCINATIONS. If info is missing, skip the section or mark as "do weryfikacji".
4. CATEGORY SPECIFICS:
   - For MOTORCYCLE: focus on asphalt quality, fuel stops, scenic curves, biker-friendly parking.
   - For CYCLING: focus on surface (gravel/road), traffic levels, water refill points, bike service.
   - For TREKKING: focus on hiking time, elevation, shelters, water sources, emergency exits.

STRUCTURE:
# ${input.project.title}
## 1. Wstęp i Klimat Trasy
## 2. Dla kogo jest ta trasa? (Profil podróżnika)
## 3. Kluczowe Fakty (Distance, Elevation, Difficulty, Estimated Time)
## 4. Geographic Backbone (Opis przebiegu)
## 5. Logistyka: Parking i Start
## 6. Punkty POI i miejsca warte zatrzymania
## 7. Jedzenie, Woda i Noclegi
## 8. Bezpieczeństwo i Ryzyka (Emergency info)
## 9. Sezon, Pogoda i Przygotowanie
## 10. Warianty i Skróty
## 11. Źródła i Status Weryfikacji

Return ONLY Markdown. Use professional, expert tone.`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    })
  });

  if (!response.ok) {
    return generateTemplateGuide(input);
  }

  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || generateTemplateGuide(input);
}

function generateTemplateGuide(input: GenerateGuideDraftInput): string {
  const sourceSummary = (input.sources ?? [])
    .slice(0, 8)
    .map((source) => `- ${source.title} (${source.sourceType})`)
    .join("\n");

  return `# ${input.project.title} (Template)

## Short intro
This is an early RouteMarket draft for a ${input.project.category} route in ${input.project.region}.

## Sources and verification
${sourceSummary || "No sources collected yet."}

## Note
Fallback template used (missing GEMINI_API_KEY).
`;
}
