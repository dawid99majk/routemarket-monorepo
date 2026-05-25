import { join } from "node:path";
import { 
  type RouteProject, 
  type Claim, 
  type ResearchPack, 
  type RouteSummary,
  type MissingInputs,
  type ProjectRepository
} from "../../../atlas-core/src/index.js";

export async function generateClaims(project: RouteProject, repository?: ProjectRepository): Promise<Claim[]> {
  const now = new Date().toISOString();
  
  const preservedClaims = await readExistingNonGeneratedClaims(project, repository);
  const claims: Claim[] = [...preservedClaims];
  let packForAi: ResearchPack | undefined;

  // 1. Generate technical claims from GPX summary
  try {
    const summary = repository 
      ? await repository.loadSummary(project.id)
      : await readJsonFileFallback<RouteSummary>(join(project.folderPath, "route_summary.json"));
      
    if (summary && summary.distanceKm && summary.distanceKm > 0) {
      claims.push({
        id: `claim_tech_dist_${Date.now()}`,
        topicId: project.id,
        claim: `The total distance of the route is approximately ${summary.distanceKm} km.`,
        claimType: "distance",
        confidence: 0.95,
        status: "verified",
        sources: ["route_summary.json"],
        needsHumanReview: false
      });
      claims.push({
        id: `claim_tech_ele_${Date.now()}`,
        topicId: project.id,
        claim: `The total elevation gain is ${summary.elevationGainM} m.`,
        claimType: "difficulty",
        confidence: 0.9,
        status: "verified",
        sources: ["route_summary.json"],
        needsHumanReview: false
      });
      claims.push({
        id: `claim_tech_loop_${Date.now()}`,
        topicId: project.id,
        claim: `This is a ${summary.loopType === "loop" ? "loop" : "point-to-point"} route.`,
        claimType: "route_segment",
        confidence: 0.95,
        status: "verified",
        sources: ["route_summary.json"],
        needsHumanReview: false
      });
    }
  } catch {
    // Ignore if no summary
  }

  // 2. Generate content claims from Research Pack
  try {
    const pack = repository
      ? await repository.readProjectFile(project.id, "research_pack.json").then(c => JSON.parse(c) as ResearchPack)
      : await readJsonFileFallback<ResearchPack>(join(project.folderPath, "research_pack.json"));
    packForAi = pack;

    for (const material of pack.materials) {
      if (material.trustLevel === "creator") {
        claims.push(...extractStructuredCreatorClaims(project, material));

        const sentences = material.content.split(/[.!?]\s+/);
        for (const sentence of sentences) {
          const cleanSentence = sentence.trim().replace(/^#+\s*[^\r\n]+\s*/g, "").trim();
          if (cleanSentence.length < 40) continue;
          if (isMetaClaim(cleanSentence)) continue;

          const claimType = classifySentence(cleanSentence);
          if (!claimType) continue;

          claims.push({
            id: `claim_creator_h_${Math.random().toString(36).slice(2, 9)}`,
            topicId: project.id,
            claim: cleanSentence,
            claimType: claimType as any,
            confidence: 0.75,
            status: "needs_creator_review",
            sources: [material.id],
            needsHumanReview: true
          });
        }
      }
    }
  } catch {
    // Ignore if no pack
  }

  const heuristicContentClaims = claims.filter(c => !c.id.startsWith("claim_tech_"));
  if (heuristicContentClaims.length < 3 && packForAi) {
    const aiClaims = await extractClaimsWithGemini(project, packForAi, claims);
    claims.push(...aiClaims);
  }

  // 3. Fallback / Quality Gate check
  const contentClaims = claims.filter(c => !c.id.startsWith("claim_tech_"));
  if (contentClaims.length === 0) {
     const missing: MissingInputs = {
      projectId: project.id,
      generatedAt: now,
      blocking: true,
      missing: [{
        code: "insufficient_claims",
        message: "No meaningful claims could be extracted from input materials.",
        requiredFor: "guide_final"
      }]
    };
    if (repository) {
      await repository.saveMissingInputs(project.id, missing);
    } else {
      const { writeJsonFile } = await import("../../../atlas-core/src/index.js");
      await writeJsonFile(join(project.folderPath, "missing_inputs.json"), missing);
    }
  } else {
    // Clear missing inputs if fixed
    try {
      if (repository) {
        // In a real repo we might have a specific method or just overwrite with empty
        await repository.saveMissingInputs(project.id, { missing: [] });
      } else {
        const { unlink } = await import("node:fs/promises");
        await unlink(join(project.folderPath, "missing_inputs.json"));
      }
    } catch {}
  }

  if (repository) {
    await repository.saveClaims(project.id, claims);
  } else {
    const { writeJsonFile } = await import("../../../atlas-core/src/index.js");
    await writeJsonFile(join(project.folderPath, "claims.json"), claims);
  }
  
  return claims;
}

function isMetaClaim(sentence: string): boolean {
  const low = sentence.toLowerCase();
  return /\b(source|article|blog|website|page|video|material|document)\b/.test(low)
    && /\b(contains|provides|describes|mentions|explains|lists|includes|covers)\b/.test(low);
}

function classifySentence(s: string): string | undefined {
  const low = s.toLowerCase();
  if (/\b(water|fuel|food|parking|ferry|border|hotel|campsite|woda|paliwo|stacja|tankowanie|jedzenie|restauracja|schronisko|nocleg|parking|prom|granica|post[oó]j)\b/.test(low)) return "logistics";
  if (/\b(danger|risk|avalanche|flood|closed|police|theft|exposed|niebezpiecze[nń]stwo|ryzyko|lawina|pow[oó]d[zź]|zamkni[eę]t|policja|kradzie[zż]|ekspozycja|uwaga|ruch)\b/.test(low)) return "safety";
  if (/\b(asphalt|gravel|offroad|paved|mud|sand|asfalt|szuter|teren|off-road|utwardzon|b[łl]oto|piasek|nawierzchnia)\b/.test(low)) return "surface";
  if (/\b(season|snow|winter|summer|rain|heat|sezon|[śs]nieg|zima|lato|deszcz|upa[łl]|pogoda|maj|czerwiec|lipiec|sierpie[nń]|wrzesie[nń])\b/.test(low)) return "season";
  if (/\b(permit|legal|allowed|forbidden|access|pozwolenie|legaln|dozwolon|zakaz|dost[eę]p|zamkni[eę]cie|wjazd)\b/.test(low)) return "access";
  if (/\b(km|kilometers|kilometr|distance|dystans|elevation|przewy[zż]szenie|podej[śs]cie|climb)\b/.test(low)) return "distance";
  if (/\b(start|meta|koniec|dalej|przez|via|odcinek|etap|trasa|route)\b/.test(low)) return "route_segment";
  return undefined;
}

function extractStructuredCreatorClaims(project: RouteProject, material: any): Claim[] {
  const claims: Claim[] = [];
  const lines = String(material.content ?? "")
    .split(/\r?\n+/)
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean);

  for (const line of lines) {
    const labeled = line.match(/^([a-ząćęłńóśźż0-9 /_-]{2,40})\s*[:\-–]\s*(.+)$/i);
    if (labeled) {
      const label = labeled[1].trim();
      const value = labeled[2].trim();
      const type = classifyStructuredLabel(label) ?? classifySentence(`${label} ${value}`);
      if (!type || value.length < 3) continue;
      claims.push(makeCreatorClaim(project, `${label}: ${value}`, type as any, material.id));
      continue;
    }

    const type = classifySentence(line);
    if (type && line.length >= 20) {
      claims.push(makeCreatorClaim(project, line, type as any, material.id));
    }
  }

  return dedupeClaims(claims);
}

function classifyStructuredLabel(label: string): Claim["claimType"] | undefined {
  const low = label.toLowerCase();
  if (/^(start|pocz[aą]tek|dalej|przez|via|meta|koniec|finish|end|etap|odcinek)/.test(low)) return "route_segment";
  if (/^(post[oó]j|nocleg|jedzenie|woda|paliwo|tankowanie|parking|logistyka|stop)/.test(low)) return "logistics";
  if (/^(uwaga|zagro[zż]enie|bezpiecze[nń]stwo|ryzyko|danger|safety)/.test(low)) return "safety";
  if (/^(nawierzchnia|droga|asfalt|szuter|surface)/.test(low)) return "surface";
  if (/^(sezon|pogoda|weather|season)/.test(low)) return "season";
  if (/^(dost[eę]p|wjazd|zakaz|permit|access)/.test(low)) return "access";
  return undefined;
}

function makeCreatorClaim(project: RouteProject, claim: string, claimType: Claim["claimType"], sourceId: string): Claim {
  return {
    id: `claim_creator_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    topicId: project.id,
    claim,
    claimType,
    confidence: 0.78,
    status: "needs_creator_review",
    sources: [sourceId],
    needsHumanReview: true
  };
}

async function extractClaimsWithGemini(project: RouteProject, pack: ResearchPack, existingClaims: Claim[]): Promise<Claim[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return [];

  const materials = pack.materials
    .filter((material: any) => material.trustLevel === "creator" && material.status !== "duplicate" && material.status !== "unsupported")
    .map((material: any) => `## ${material.title}\n${material.content}`)
    .join("\n\n")
    .slice(0, 14000);

  if (materials.trim().length < 80) return [];

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = `Wyciągnij twarde fakty z materiałów twórcy dla przewodnika RouteMarket.

Projekt: ${project.title}
Kategoria: ${project.category}
Region formularza: ${project.region}

MATERIAŁY:
${materials}

ZASADY:
- Nie wymyślaj faktów. Użyj tylko tego, co realnie wynika z materiałów.
- Krótkie etykiety typu "Start: Kraków" są pełnoprawnymi faktami.
- Jeśli materiał przeczy tytułowi projektu, ufaj materiałowi, a nie tytułowi.
- Każdy fakt przypisz do jednego typu: poi, safety, season, distance, difficulty, logistics, route_segment, surface, access, cost, legal.
- Status ustaw zawsze na "needs_creator_review".

Zwróć tylko JSON:
[
  {"claim":"...", "claimType":"route_segment", "confidence":0.7}
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
    const parsed = parseClaimsJson(data.candidates?.[0]?.content?.parts?.[0]?.text);
    const existingText = new Set(existingClaims.map((claim) => normalizeClaimText(claim.claim)));

    return dedupeClaims(parsed
      .filter((item) => item.claim && isAllowedClaimType(item.claimType))
      .filter((item) => !existingText.has(normalizeClaimText(item.claim)))
      .slice(0, 20)
      .map((item) => ({
        id: `claim_ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        topicId: project.id,
        claim: String(item.claim).trim(),
        claimType: item.claimType as Claim["claimType"],
        confidence: clampConfidence(Number(item.confidence) || 0.72),
        status: "needs_creator_review" as const,
        sources: ["research_pack.json"],
        needsHumanReview: true
      })));
  } catch {
    return [];
  }
}

function parseClaimsJson(text?: string): Array<{ claim: string; claimType: string; confidence?: number }> {
  if (!text) return [];
  const cleaned = text.replace(/```json\s?|```\s?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return [];
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

function dedupeClaims(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = normalizeClaimText(claim.claim);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeClaimText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isAllowedClaimType(type: string): boolean {
  return ["poi", "safety", "season", "distance", "difficulty", "logistics", "route_segment", "surface", "access", "cost", "legal"].includes(type);
}

function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.95, value));
}

async function readExistingNonGeneratedClaims(project: RouteProject, repository?: ProjectRepository): Promise<Claim[]> {
  try {
    const existing = repository 
      ? await repository.loadClaims(project.id)
      : await readJsonFileFallback<Claim[]>(join(project.folderPath, "claims.json"));

    // Filter out old placeholder claims
    return existing.filter((claim) => 
      !claim.claim.includes("may contain useful route intelligence") &&
      !claim.claim.includes("provides authoritative details") &&
      !claim.id.startsWith("claim_tech_") &&
      !claim.id.startsWith("claim_missing_") &&
      !claim.id.startsWith("claim_creator_h_")
    );
  } catch {
    return [];
  }
}

async function readJsonFileFallback<T>(path: string): Promise<T> {
  const { readJsonFile } = await import("../../../atlas-core/src/index.js");
  return readJsonFile<T>(path);
}
