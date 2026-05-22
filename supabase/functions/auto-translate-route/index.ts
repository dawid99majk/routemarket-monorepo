import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_LANGS = ["en", "pl", "de", "fr", "es", "it", "nl", "da"];
const LANG_NAMES: Record<string, string> = {
  en: "English", pl: "Polish", de: "German", fr: "French",
  es: "Spanish", it: "Italian", nl: "Dutch", da: "Danish",
};

async function translateOne(
  supabase: any,
  apiKey: string,
  routeId: number,
  source: { title: string; description: string },
  targetLang: string,
) {
  const { data: existing } = await supabase
    .from("route_translations")
    .select("id")
    .eq("route_id", routeId)
    .eq("language_code", targetLang)
    .maybeSingle();
  if (existing) return { lang: targetLang, status: "skipped" };

  const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Translate outdoor/adventure route content to ${LANG_NAMES[targetLang]}. Preserve place names. Return via tool call only.` },
        { role: "user", content: `Translate to ${LANG_NAMES[targetLang]}:\n\nTitle: ${source.title}\n\nDescription: ${source.description}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_translation",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["title", "description"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_translation" } },
    }),
  });

  if (!aiResp.ok) {
    return { lang: targetLang, status: "error", error: `AI ${aiResp.status}` };
  }
  const aiData = await aiResp.json();
  const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) return { lang: targetLang, status: "error", error: "no tool call" };

  const t = JSON.parse(tc.function.arguments);
  const { error: insErr } = await supabase.from("route_translations").insert({
    route_id: routeId,
    language_code: targetLang,
    title: t.title,
    description: t.description,
    is_auto_translated: true,
  });
  if (insErr) return { lang: targetLang, status: "error", error: insErr.message };
  return { lang: targetLang, status: "ok" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { route_id, source_language = "pl", target_languages } = await req.json();
    if (!route_id) {
      return new Response(JSON.stringify({ error: "route_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: route, error: rErr } = await supabase
      .from("routes").select("title, description").eq("id", route_id).single();
    if (rErr || !route) {
      return new Response(JSON.stringify({ error: "route not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targets = (target_languages && Array.isArray(target_languages) && target_languages.length > 0)
      ? target_languages
      : ALL_LANGS.filter((l) => l !== source_language);

    const results: any[] = [];
    for (const lang of targets) {
      try {
        const r = await translateOne(supabase, apiKey, route_id, route, lang);
        results.push(r);
      } catch (e) {
        results.push({ lang, status: "error", error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return new Response(JSON.stringify({ route_id, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-translate-route error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});