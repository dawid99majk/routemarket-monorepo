import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const MODEL = Deno.env.get("GEMINI_INTERVIEW_MODEL") ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY ?? "")}`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ATLAS_API_BASE_URL = Deno.env.get("ATLAS_API_BASE_URL")?.replace(/\/+$/, "");
const ATLAS_API_TOKEN = Deno.env.get("ATLAS_API_TOKEN");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userRes.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: corsHeaders });

    const userId = userRes.user.id;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "creator"]);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Unauthorized: admin or creator role required" }), { status: 403, headers: corsHeaders });
    }
    const isAdmin = roles.some((r) => r.role === "admin");

    const { project_slug, context, answers, youtube_url } = await req.json();
    const answerHistory = Array.isArray(answers) ? answers : [];
    const answeredQuestions = answerHistory
      .map((answer: any) => String(answer?.q || answer?.question || "").trim())
      .filter(Boolean);

    // Limits
    // Gracefully handle notes size without throwing
    if (JSON.stringify(answerHistory).length > 10000) throw new Error("Interview history too long.");
    if (youtube_url?.length > 500) throw new Error("URL too long.");
    if (project_slug && !/^[a-z0-9-]+$/.test(project_slug)) throw new Error("Invalid project slug.");

    const projectNotes = project_slug
      ? await loadAtlasProjectNotes(project_slug, userId, isAdmin).catch((err) => {
          console.warn(`[atlas-interview] Could not load project notes for ${project_slug}: ${err.message}`);
          return "";
        })
      : "";

    const mergedContext = {
      ...(context || {}),
      notes: [context?.notes, projectNotes].filter(Boolean).join("\n\n").slice(0, 30000)
    };
    const deterministicQuestion = buildFallbackQuestion(mergedContext, answerHistory, answeredQuestions);
    if (deterministicQuestion && answerHistory.length < 4) {
      return new Response(JSON.stringify({
        status: "interviewing",
        ...deterministicQuestion,
        proposals: [],
        summary: `Pytanie ${answerHistory.length + 1}/4`
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Jesteś Atlas Interviewerem. Twoim zadaniem jest sfinalizowanie fundamentów nowej trasy.

KONTEKST (PRZECZYTAJ UWAŻNIE):
- Temat: ${mergedContext?.topic || "Nie określono"}
- Region: ${mergedContext?.region || "Nie określono"}
- Notatki użytkownika: 
---
${mergedContext?.notes || "Brak"}
---

HISTORIA ODPOWIEDZI:
${JSON.stringify(answerHistory)}

ZASADA ZERO REPLIKACJI:
1. Przeskanuj notatki pod kątem: dystansu (np. "20km"), noclegu (np. "schroniska"), punktu startu, trudności.
2. Jeśli fakt jest w notatkach - UZNAJ GO ZA USTALONY. Nie pytaj o niego.
3. Jeśli użytkownik już odpowiedział na pytanie o dany temat - nie drąż go, przejdź dalej.

ZADANIE:
1. Zadaj JEDNO konkretne pytanie o brakujący szczegół techniczny (np. precyzyjne miejsce startu, preferowane nawierzchnie).
2. Jeśli masz już komplet danych do budowy trasy - przejdź natychmiast do statusu "proposal".

ZASADY TECHNICZNE:
1. Pytanie: MAKS 120 znaków. Styl: konkretny, inżynierski.
2. Nie powtarzaj pytań z listy: ${answeredQuestions.join(", ")}
3. PUNKT STARTOWY (miejscowość/parking) jest krytyczny - zapytaj o niego w pierwszej kolejności, jeśli nie ma go w notatkach.

FORMAT JSON:
{
  "status": "interviewing" | "proposal",
  "question": "Pytanie o BRAKUJĄCY fakt",
  "hint": "Dlaczego to ważne?",
  "options": [{ "label": "Etykieta", "value": "kod" }],
  "proposals": [
    { "id": "A", "title": "Konkretny tytuł trasy", "description": "2 zdania konkretów", "highlights": ["h1", "h2", "h3"] }
  ],
  "summary": "Pytanie X/4"
}`;

    const resp = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json" }
      }),
    });

    if (!resp.ok) throw new Error(`Gemini failed: ${await resp.text()}`);
    const data = await resp.json();
    const result = JSON.parse(data.candidates[0].content.parts[0].text);

    // SERVER-SIDE VALIDATION & TRUNCATION
    if (result.status === "interviewing") {
      if (result.question) result.question = result.question.substring(0, 140);
      if (result.hint) result.hint = result.hint.substring(0, 160);
      if (result.options) {
        result.options = result.options.slice(0, 4).map((o: any) => ({
          ...o,
          label: o.label.substring(0, 32)
        }));
      }
      // Force proposal if too many answers
      if (answerHistory.length >= 4) {
        result.status = "proposal";
        result.question = "Wybierz jeden z przygotowanych wariantów:";
      } else if (isRepeatedQuestion(result.question, answeredQuestions)) {
        const fallback = buildFallbackQuestion(mergedContext, answerHistory, answeredQuestions);
        if (fallback) {
          result.question = fallback.question;
          result.hint = fallback.hint;
          result.options = fallback.options;
          result.summary = `Pytanie ${answerHistory.length + 1}/4`;
        } else {
          result.status = "proposal";
          result.question = "Wybierz jeden z przygotowanych wariantów:";
        }
      }
    }
    if (result.status === "proposal" && (!Array.isArray(result.proposals) || result.proposals.length === 0)) {
      result.proposals = buildFallbackProposals(mergedContext, answerHistory);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function loadAtlasProjectNotes(projectSlug: string, userId: string, isAdmin: boolean): Promise<string> {
  if (!ATLAS_API_BASE_URL || !ATLAS_API_TOKEN) return "";

  const projectData = await atlasJson(`/projects/${encodeURIComponent(projectSlug)}`) as { project?: { ownerUserId?: string } };
  const ownerUserId = projectData.project?.ownerUserId;
  if (!isAdmin && ownerUserId && ownerUserId !== userId) {
    throw new Error("Unauthorized project access.");
  }

  const eventsData = await atlasJson(`/projects/${encodeURIComponent(projectSlug)}/events`).catch(() => ({ events: [] })) as { events?: Array<{ type?: string; data?: any }> };
  const notePaths = new Set<string>([
    "notes.md",
    "input/notes/notes.md",
    "input/notes/notes.txt"
  ]);

  const manifestFile = await atlasJson(`/projects/${encodeURIComponent(projectSlug)}/files?path=${encodeURIComponent("input_manifest.json")}`).catch(() => null) as { content?: string } | null;
  const manifest = parseInputManifest(manifestFile?.content);
  for (const item of manifest.items ?? []) {
    if (item.type !== "note" && item.type !== "document") continue;
    const path = String(item.path || "").trim();
    const originalName = String(item.originalName || "").trim();
    if (!path || isSystemInput(originalName, path)) continue;
    notePaths.add(path);
  }

  if ((manifest.items ?? []).length === 0) {
    for (const event of eventsData.events ?? []) {
      if (event.type !== "input.note_added") continue;
      const item = event.data?.item ?? event.data ?? {};
      const path = String(item.path || "").trim();
      const originalName = String(item.originalName || item.name || item.fileName || "").trim();
      if (isSystemInput(originalName, path)) continue;
      if (path.startsWith("input/notes/") || path.startsWith("input/docs/")) {
        notePaths.add(path);
        continue;
      }
      const safeName = safeAtlasFileName(originalName);
      if (safeName) notePaths.add(`input/notes/${safeName}`);
    }
  }

  const chunks: string[] = [];
  for (const path of notePaths) {
    const fileData = await atlasJson(`/projects/${encodeURIComponent(projectSlug)}/files?path=${encodeURIComponent(path)}`).catch(() => null) as { content?: string } | null;
    const content = typeof fileData?.content === "string" ? fileData.content.trim() : "";
    if (content) chunks.push(`--- ${path} ---\n${content}`);
  }

  return chunks.join("\n\n").slice(0, 18000);
}

async function atlasJson(path: string): Promise<any> {
  const resp = await fetch(`${ATLAS_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${ATLAS_API_TOKEN}` }
  });
  if (!resp.ok) throw new Error(`Atlas API ${resp.status}: ${await resp.text()}`);
  return await resp.json();
}

function safeAtlasFileName(fileName: string): string | null {
  const base = fileName.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) ?? "";
  if (!base || base === "." || base === ".." || base.startsWith(".") || base.includes("..")) return null;
  return base;
}

function buildFallbackProposals(context: any, answers: Array<{ q: string; a: string }>) {
  const topic = context?.topic || "Nowa trasa";
  const region = context?.region || "wybrany region";
  const highlights = answers.slice(-4).map((item) => String(item.a).slice(0, 42));
  return [
    {
      id: "A",
      title: `${topic}: wariant główny`,
      description: `Trasa w regionie ${region}, oparta na dotychczasowych odpowiedziach. Atlas przejdzie teraz do konspektu i GPX.`,
      highlights: highlights.length ? highlights : ["spójny plan", "krótki wywiad", "gotowe założenia"]
    }
  ];
}

function parseInputManifest(content?: string): { items?: Array<{ type?: string; path?: string; originalName?: string }> } {
  if (!content) return { items: [] };
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : { items: [] };
  } catch {
    return { items: [] };
  }
}

function isSystemInput(originalName: string, path: string): boolean {
  const name = originalName.toLowerCase();
  const normalizedPath = path.toLowerCase();
  return name === "notes.md"
    || name === "interview_answers.md"
    || normalizedPath.endsWith("/notes.md")
    || normalizedPath.endsWith("/interview_answers.md");
}

function isRepeatedQuestion(question: unknown, previousQuestions: string[]): boolean {
  const normalized = normalizeQuestion(question);
  if (!normalized) return false;
  return previousQuestions.some((previous) => {
    const normalizedPrevious = normalizeQuestion(previous);
    if (!normalizedPrevious) return false;
    if (normalized === normalizedPrevious) return true;
    if (normalized.includes("styl") && normalizedPrevious.includes("styl")) return true;
    if (normalized.includes("trudnosc") && normalizedPrevious.includes("trudnosc")) return true;
    if (normalized.includes("nocleg") && normalizedPrevious.includes("nocleg")) return true;
    return wordOverlap(normalized, normalizedPrevious) >= 0.75;
  });
}

function normalizeQuestion(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ąćęłńóśźż ]/gi, " ")
    .replace(/\b(jaki|jaka|jakie|jest|twoj|twoja|twoje|czy|dla|trasy|trasie)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordOverlap(a: string, b: string): number {
  const left = new Set(a.split(" ").filter((word) => word.length > 2));
  const right = new Set(b.split(" ").filter((word) => word.length > 2));
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common++;
  return common / Math.min(left.size, right.size);
}

function buildFallbackQuestion(context: any, answers: any[], previousQuestions: string[]) {
  const category = String(context?.category || "").toLowerCase();
  const facts = `${context?.topic || ""}\n${context?.region || ""}\n${context?.notes || ""}\n${answers.map((a) => `${a.q}: ${a.a}`).join("\n")}`.toLowerCase();
  const baseQuestions = [
    question("Podaj dokładny punkt startu.", "Bez tego nie da się uczciwie narysować śladu GPX.", ["Parking / adres", "Centrum miejscowości", "Dworzec / stacja", "Wpiszę własny"]),
    question("Czy trasa ma być pętlą?", "To decyduje o punkcie końcowym i przebiegu GPX.", ["Tak, pętla", "Nie, z A do B", "Może być półpętla", "Wpiszę własne"]),
    question("Jaki dystans lub czas ma mieć trasa?", "Atlas użyje tego jako twardej ramy planu.", ["Do 20 km / 1 dzień", "40-80 km", "100-250 km", "Kilka dni"]),
  ].filter((candidate) => {
    const normalized = normalizeQuestion(candidate.question);
    if (normalized.includes("punkt startu") && hasAny(facts, ["start", "parking", "dworzec", "kuźnice", "kuznice", "zakopane", "cortina"])) return false;
    if (normalized.includes("petla") && hasAny(facts, ["pętla", "petla", "a do b", "tam i z powrotem", "powrot"])) return false;
    if (normalized.includes("dystans") && /\b\d+\s?(km|kilometr|godzin|dni|h)\b/i.test(facts)) return false;
    return true;
  });

  const categoryQuestions = category.includes("motor")
    ? [
        question("Jakie drogi preferujesz?", "Wybierz charakter trasy.", ["Asfalt kręty", "Widokowe", "Szutry", "Mieszane"]),
        question("Co omijać?", "Atlas potraktuje to jako twarde ograniczenie.", ["Autostrady", "Centra miast", "Szutry", "Tłumy"])
      ]
    : [
        question("Jaki poziom trudności?", "Atlas nie będzie sztucznie podbijał wyzwania.", ["Łatwy", "Średni", "Trudny", "Ekspercki"]),
        question("Co musi omijać trasa?", "Podaj najważniejsze ograniczenie.", ["Ekspozycję", "Tłumy", "Długie podejścia", "Drogi asfaltowe"])
      ];

  return [...baseQuestions, ...categoryQuestions].find((candidate) => !isRepeatedQuestion(candidate.question, previousQuestions));
}

function question(questionText: string, hint: string, labels: string[]) {
  return {
    question: questionText,
    hint,
    options: labels.map((label) => ({
      label,
      value: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      icon: "Circle"
    }))
  };
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
