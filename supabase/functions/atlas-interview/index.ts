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

    const { context, answers, youtube_url } = await req.json();

    // Limits
    if (context?.notes?.length > 20000) throw new Error("Notes too long.");
    if (JSON.stringify(answers || []).length > 10000) throw new Error("Interview history too long.");
    if (youtube_url?.length > 500) throw new Error("URL too long.");

    const prompt = `Jesteś Atlas Interviewerem. Twoim celem jest szybki wywiad (decyzje, nie rozmowa).
Działaj jak kreator: krótkie pytania, konkretne opcje.

KONTEKST:
- Temat: ${context?.topic || "Nie określono"}
- Kategoria: ${context?.category || "Nie określono"}
- Region: ${context?.region || "Nie określono"}
- Notatki: ${context?.notes || "Brak"}

HISTORIA ODPOWIEDZI:
${JSON.stringify(answers || [])}

ZASADY:
1. Pytanie: MAKSYMALNIE 120 znaków.
2. Opis pomocniczy (hint): MAKSYMALNIE 1 krótkie zdanie.
3. Opcje: MAKSYMALNIE 4, każda MAKSYMALNIE 3-5 słów.
4. Styl: Zero marketingu, zero "premium", techniczny i konkretny.
5. Progresja: Najpierw najważniejsze (styl, trudność, tempo, logistyka).
6. Jeśli masz komplet danych albo użytkownik odpowiedział na 4+ pytań, ustaw status "proposal".
7. Propozycje: Tytuł, 2 zdania opisu, 3 krótkie wyróżniki (maks 4 słowa każdy).

BANK PYTAŃ (Inspiracja):
- Motocykl: Styl jazdy? Drogi? Czas dziennie? Co omijać?
- Rower: Nawierzchnia? Tempo? Przewyższenia? Logistyka?
- Trekking: Dni? Trudność? Nocleg? Waga bagażu?

FORMAT JSON:
{
  "status": "interviewing" | "proposal",
  "question": "Krótkie pytanie",
  "hint": "Krótka podpowiedź pomocnicza",
  "options": [
    { "label": "Etykieta", "value": "kod", "icon": "LucideIcon" }
  ],
  "proposals": [
    { "id": "A", "title": "Tytuł", "description": "Opis 2 zdania", "highlights": ["h1", "h2", "h3"] }
  ],
  "summary": "Pytanie X/5"
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
      if ((answers || []).length >= 5) {
        result.status = "proposal";
        result.question = "Wybierz jeden z przygotowanych wariantów:";
      }
    }
    if (result.status === "proposal" && (!Array.isArray(result.proposals) || result.proposals.length === 0)) {
      result.proposals = buildFallbackProposals(context, answers || []);
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

function buildFallbackProposals(context: any, answers: Array<{ q: string; a: string }>) {
  const topic = context?.topic || "Nowa trasa";
  const region = context?.region || "wybrany region";
  const highlights = answers.slice(-3).map((item) => String(item.a).slice(0, 32));
  return [
    {
      id: "A",
      title: `${topic}: wariant główny`,
      description: `Trasa w regionie ${region}, oparta na dotychczasowych odpowiedziach. Atlas przejdzie teraz do konspektu i GPX.`,
      highlights: highlights.length ? highlights : ["spójny plan", "krótki wywiad", "gotowe założenia"]
    }
  ];
}
