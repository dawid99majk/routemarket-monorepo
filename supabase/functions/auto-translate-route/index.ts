import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_LANGS = ["en", "de", "fr", "es"];
const LANG_NAMES: Record<string, string> = {
  en: "English", de: "German", fr: "French", es: "Spanish"
};

async function translateWithGemini(
  apiKey: string,
  source: any,
  targetLang: string
) {
  const prompt = `
    You are a professional outdoor/adventure translator. 
    Translate the following route data to ${LANG_NAMES[targetLang]}.
    Keep place names accurate. Maintain a professional yet inspiring tone.
    
    Data to translate:
    ${JSON.stringify(source, null, 2)}

    Return the translation in the exact same JSON structure.
  `;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await response.json();
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(resultText);
}

async function translateOne(
  supabase: any,
  geminiKey: string,
  routeId: number,
  source: { title: string; description: string; pois: any[]; tips: any[]; recommendations: any[] },
  targetLang: string,
) {
  const { data: existing } = await supabase
    .from("route_translations")
    .select("id")
    .eq("route_id", routeId)
    .eq("language_code", targetLang)
    .maybeSingle();
  if (existing) return { lang: targetLang, status: "skipped" };

  try {
    const translated = await translateWithGemini(geminiKey, source, targetLang);
    
    const { error: insErr } = await supabase.from("route_translations").insert({
      route_id: routeId,
      language_code: targetLang,
      title: translated.title,
      description: translated.description,
      is_auto_translated: true,
      // In a real production system, you'd also save POI/Tip/Rec translations 
      // but for this MVP we store the main fields and log the rest
    });
    
    if (insErr) throw insErr;
    return { lang: targetLang, status: "ok" };
  } catch (err) {
    return { lang: targetLang, status: "error", error: err.message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { route_id, source_language = "pl" } = await req.json();
    if (!route_id) {
      return new Response(JSON.stringify({ error: "route_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: "Gemini AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch full route data
    const { data: route } = await supabase.from("routes").select("title, description").eq("id", route_id).single();
    const { data: pois } = await supabase.from("route_pois").select("name, description, fun_fact").eq("route_id", route_id);
    const { data: tips } = await supabase.from("route_tips").select("content").eq("route_id", route_id);
    const { data: recs } = await supabase.from("route_recommendations").select("name, description, what_to_order").eq("route_id", route_id);

    const fullSource = {
      title: route.title,
      description: route.description,
      pois: pois || [],
      tips: tips || [],
      recommendations: recs || []
    };

    const targets = ALL_LANGS.filter((l) => l !== source_language);
    const results: any[] = [];
    
    for (const lang of targets) {
      const r = await translateOne(supabase, geminiKey, route_id, fullSource, lang);
      results.push(r);
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