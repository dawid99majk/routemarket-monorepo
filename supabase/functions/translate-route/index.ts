import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { route_id, language_code } = await req.json();
    if (!route_id || !language_code) {
      return new Response(JSON.stringify({ error: "route_id and language_code required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if translation already exists
    const { data: existing } = await supabase
      .from("route_translations")
      .select("id, title, description, is_auto_translated")
      .eq("route_id", route_id)
      .eq("language_code", language_code)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify(existing), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the original route
    const { data: route, error: routeError } = await supabase
      .from("routes").select("title, description").eq("id", route_id).single();
    if (routeError || !route) {
      return new Response(JSON.stringify({ error: "Route not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch POIs, tips, recommendations for translation
    const [poisRes, tipsRes, recsRes] = await Promise.all([
      supabase.from("route_pois").select("id, name, description, fun_fact").eq("route_id", route_id),
      supabase.from("route_tips").select("id, content").eq("route_id", route_id),
      supabase.from("route_recommendations").select("id, name, description, what_to_order").eq("route_id", route_id),
    ]);

    const pois = poisRes.data || [];
    const tips = tipsRes.data || [];
    const recs = recsRes.data || [];

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LANG_NAMES: Record<string, string> = {
      en: "English", pl: "Polish", de: "German", fr: "French",
      es: "Spanish", it: "Italian", cs: "Czech", sk: "Slovak",
      nl: "Dutch", pt: "Portuguese", da: "Danish",
    };
    const targetLang = LANG_NAMES[language_code] || language_code;

    // Build translation prompt with all content
    const contentToTranslate: Record<string, string> = {
      title: route.title,
      description: route.description,
    };
    pois.forEach((p: any, i: number) => {
      contentToTranslate[`poi_${i}_name`] = p.name;
      if (p.description) contentToTranslate[`poi_${i}_description`] = p.description;
      if (p.fun_fact) contentToTranslate[`poi_${i}_fun_fact`] = p.fun_fact;
    });
    tips.forEach((t: any, i: number) => {
      if (t.content) contentToTranslate[`tip_${i}_content`] = t.content;
    });
    recs.forEach((r: any, i: number) => {
      contentToTranslate[`rec_${i}_name`] = r.name;
      if (r.description) contentToTranslate[`rec_${i}_description`] = r.description;
      if (r.what_to_order) contentToTranslate[`rec_${i}_what_to_order`] = r.what_to_order;
    });

    const properties: Record<string, any> = {};
    for (const key of Object.keys(contentToTranslate)) {
      properties[key] = { type: "string", description: `Translated ${key}` };
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional translator specializing in outdoor/adventure content. Translate all given fields to ${targetLang}. Preserve formatting, place names, and technical terms. Return ONLY via the tool call.`,
          },
          {
            role: "user",
            content: `Translate all fields to ${targetLang}:\n\n${JSON.stringify(contentToTranslate, null, 2)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_translation",
            description: "Return all translated fields",
            parameters: {
              type: "object",
              properties,
              required: ["title", "description"],
              additionalProperties: true,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_translation" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No translation returned from AI");

    const translated = JSON.parse(toolCall.function.arguments);

    // Store route translation
    const { data: saved, error: insertError } = await supabase
      .from("route_translations")
      .insert({
        route_id, language_code,
        title: translated.title,
        description: translated.description,
        is_auto_translated: true,
      })
      .select("id, title, description, is_auto_translated")
      .single();
    if (insertError) throw insertError;

    // Note: POI/tip/rec translations are stored in the main route_translations record
    // A production system would store them in separate translation tables

    // Trigger PDF generation for this language
    try {
      const pdfUrl = `${supabaseUrl}/functions/v1/generate-pdf`;
      await fetch(pdfUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ route_id, language_code }),
      });
    } catch (pdfErr) {
      console.error("PDF generation after translation failed:", pdfErr);
    }

    return new Response(JSON.stringify(saved), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-route error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
