import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIELD_PROMPTS: Record<string, (data: any) => { system: string; user: string; tool: any }> = {
  title: (d) => ({
    system: "You are a creative outdoor route naming expert. Generate a compelling, concise route title in the same language as the location.",
    user: `Generate a route title for: Location: ${d.location_string || "unknown"}, Category: ${d.category || "hiking"}, Distance: ${d.distance_km || "?"}km, Elevation: ${d.elevation_gain_m || "?"}m`,
    tool: {
      name: "suggest_title",
      description: "Return a suggested route title",
      parameters: { type: "object", properties: { suggestion: { type: "string" } }, required: ["suggestion"], additionalProperties: false },
    },
  }),
  difficulty: (d) => ({
    system: "You are an outdoor route difficulty assessor. Determine difficulty based on distance, elevation, and terrain.",
    user: `Assess difficulty: Distance: ${d.distance_km}km, Elevation gain: ${d.elevation_gain_m}m, Surface: ${d.surface_type || "mixed"}, Loop type: ${d.loop_type || "unknown"}`,
    tool: {
      name: "suggest_difficulty",
      description: "Return suggested difficulty level",
      parameters: { type: "object", properties: { suggestion: { type: "string", enum: ["easy", "moderate", "hard", "expert"] }, reasoning: { type: "string" } }, required: ["suggestion", "reasoning"], additionalProperties: false },
    },
  }),
  description: (d) => ({
    system: "You are a travel content writer. Write an engaging route description (150-300 words) in the same language as the route title. Include terrain highlights, views, and practical info.",
    user: `Write description for: "${d.title}", Location: ${d.location_string}, Distance: ${d.distance_km}km, Elevation: ${d.elevation_gain_m}m, Difficulty: ${d.difficulty}, Surface: ${d.surface_type || "mixed"}`,
    tool: {
      name: "suggest_description",
      description: "Return a route description",
      parameters: { type: "object", properties: { suggestion: { type: "string" } }, required: ["suggestion"], additionalProperties: false },
    },
  }),
  risk_level: (d) => ({
    system: "You are a safety risk assessor for outdoor routes. Evaluate risk based on terrain, elevation, and difficulty.",
    user: `Assess risk: Distance: ${d.distance_km}km, Elevation: ${d.elevation_gain_m}m, Difficulty: ${d.difficulty}, Surface: ${d.surface_type || "mixed"}, Loop: ${d.loop_type || "unknown"}`,
    tool: {
      name: "suggest_risk",
      description: "Return risk assessment",
      parameters: { type: "object", properties: { suggestion: { type: "string", enum: ["low", "medium", "high", "extreme"] }, reasoning: { type: "string" } }, required: ["suggestion", "reasoning"], additionalProperties: false },
    },
  }),
  hazards: (d) => ({
    system: "You are a trail safety expert. List potential hazards for this route. Return each hazard on a new line. Write in the same language as the route title.",
    user: `List hazards for: "${d.title}", Location: ${d.location_string}, Difficulty: ${d.difficulty}, Elevation: ${d.elevation_gain_m}m, Surface: ${d.surface_type || "mixed"}`,
    tool: {
      name: "suggest_hazards",
      description: "Return list of hazards",
      parameters: { type: "object", properties: { suggestion: { type: "string", description: "Hazards, one per line" } }, required: ["suggestion"], additionalProperties: false },
    },
  }),
  equipment: (d) => ({
    system: "You are an outdoor equipment advisor. Recommend required equipment based on the route. Return each item on a new line. Write in the same language as the route title.",
    user: `Recommend equipment for: "${d.title}", Distance: ${d.distance_km}km, Difficulty: ${d.difficulty}, Elevation: ${d.elevation_gain_m}m, Surface: ${d.surface_type || "mixed"}, Risk: ${d.risk_level || "unknown"}`,
    tool: {
      name: "suggest_equipment",
      description: "Return list of equipment",
      parameters: { type: "object", properties: { suggestion: { type: "string", description: "Equipment items, one per line" } }, required: ["suggestion"], additionalProperties: false },
    },
  }),
  poi_suggestions: (d) => ({
    system: "You are a local travel guide. Based on the route location and coordinates, suggest 3-5 interesting Points of Interest that might be along or near the route. Write in the same language as the route title.",
    user: `Suggest POIs for route: "${d.title}", Location: ${d.location_string}, Lat: ${d.latitude}, Lng: ${d.longitude}, Distance: ${d.distance_km}km`,
    tool: {
      name: "suggest_pois",
      description: "Return suggested POIs",
      parameters: {
        type: "object",
        properties: {
          pois: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["viewpoint", "water", "shelter", "historic", "nature", "food", "other"] },
                description: { type: "string" },
                fun_fact: { type: "string" },
              },
              required: ["name", "type", "description"],
              additionalProperties: false,
            },
          },
        },
        required: ["pois"],
        additionalProperties: false,
      },
    },
  }),
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { field, route_data } = await req.json();
    if (!field || !route_data) {
      return new Response(JSON.stringify({ error: "field and route_data required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const promptBuilder = FIELD_PROMPTS[field];
    if (!promptBuilder) {
      return new Response(JSON.stringify({ error: `Unknown field: ${field}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { system, user, tool } = promptBuilder(route_data);

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [{ type: "function", function: tool }],
        tool_choice: { type: "function", function: { name: tool.name } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No suggestion returned from AI");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-ai-suggestion error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
