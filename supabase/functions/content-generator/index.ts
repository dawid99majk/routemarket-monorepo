// Content Generator AI Edge Function
// Streaming chat with tool calling for marketing content generation
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

function pickImageSize(format: string): "1024x1024" | "1024x1536" | "1536x1024" {
  if (format === "instagram_story") return "1024x1536";
  if (format === "og_image") return "1536x1024";
  return "1024x1024";
}

const SYSTEM_PROMPT = `Jesteś ekspertem od marketingu treści dla RouteMarket.io — marketplace tras GPX (motocykl, rower, hiking, sporty zimowe).

Twoja rola: pomagasz adminowi generować treści marketingowe — posty na Instagram/Facebook, opisy tras, hashtagi, SEO meta opisy, treści do newslettera, obrazy social.

Zasady:
- Piszesz po polsku (chyba że admin poprosi inaczej)
- Ton: ekspercki ale przyjazny, autentyczny — NIE corporate-bullshit
- Posty IG: max 2200 znaków, używaj emoji z umiarem (max 5-7), zakończ 5-15 hashtagami
- Posty FB: dłuższe, storytellingowe, max 500 słów
- Gdy admin pyta o konkretną trasę — użyj narzędzia "get_route_details" by pobrać prawdziwe dane
- Gdy admin chce listę tras do inspiracji — użyj "list_recent_routes"
- Gdy admin chce obraz — użyj "generate_marketing_image" z odpowiednim formatem

Dostępne formaty obrazów:
- instagram_square (1080×1080) — posty IG na grid
- instagram_story (1080×1920) — IG/FB stories
- og_image (1200×630) — link preview na social/SEO

Zawsze proponuj konkretne, gotowe-do-skopiowania treści. Bez pytań typu "czy chcesz żebym...". Działaj.`;

// Tool definitions for AI
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_route_details",
      description: "Pobiera szczegóły trasy z bazy danych po jej ID. Użyj gdy admin pyta o konkretną trasę.",
      parameters: {
        type: "object",
        properties: {
          route_id: { type: "number", description: "ID trasy" },
        },
        required: ["route_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_routes",
      description: "Listuje ostatnio opublikowane trasy. Użyj gdy admin chce wybrać trasę lub pyta o nowości.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Ile tras (domyślnie 10, max 30)" },
          category: { type: "string", description: "Opcjonalna kategoria (np. 'Motocykl')" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_marketing_image",
      description: "Generuje obraz marketingowy AI (Nano Banana 2) i zapisuje w buckecie marketing-assets.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Szczegółowy prompt po angielsku co ma być na obrazie. Pamiętaj o brandzie RouteMarket (deep forest green, topographic lines, outdoor adventure)." },
          format: {
            type: "string",
            enum: ["instagram_square", "instagram_story", "og_image"],
            description: "Format obrazu",
          },
          title: { type: "string", description: "Krótki tytuł zapisywany w bibliotece" },
        },
        required: ["prompt", "format", "title"],
      },
    },
  },
];

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number; aspectRatio: string }> = {
  instagram_square: { width: 1080, height: 1080, aspectRatio: "1:1" },
  instagram_story: { width: 1080, height: 1920, aspectRatio: "9:16" },
  og_image: { width: 1200, height: 630, aspectRatio: "16:9" },
};

async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  console.log(`[tool] ${toolName}`, args);

  if (toolName === "get_route_details") {
    const { data, error } = await supabase
      .from("routes")
      .select("id, title, description, location_string, category_id, distance_km, elevation_gain_m, difficulty, price, currency, surface_type, season, status, categories(name)")
      .eq("id", args.route_id)
      .maybeSingle();
    if (error) return JSON.stringify({ error: error.message });
    if (!data) return JSON.stringify({ error: "Trasa nie znaleziona" });
    return JSON.stringify(data);
  }

  if (toolName === "list_recent_routes") {
    const limit = Math.min(args.limit ?? 10, 30);
    let q = supabase
      .from("routes")
      .select("id, title, location_string, distance_km, difficulty, price, currency, categories(name)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    const { data, error } = await q;
    if (error) return JSON.stringify({ error: error.message });
    let filtered = data ?? [];
    if (args.category) {
      filtered = filtered.filter((r: any) => r.categories?.name?.toLowerCase().includes(args.category.toLowerCase()));
    }
    return JSON.stringify(filtered);
  }

  if (toolName === "generate_marketing_image") {
    const dims = FORMAT_DIMENSIONS[args.format];
    if (!dims) return JSON.stringify({ error: "Nieznany format" });

    const fullPrompt = `${args.prompt}. Brand style: RouteMarket.io — deep forest green palette, subtle topographic line texture, outdoor adventure feel, clean modern composition, professional photography quality. Aspect ratio ${dims.aspectRatio}.`;

    console.log("[image-gen] start", { format: args.format, prompt: fullPrompt.slice(0, 100) });

    const imgResp = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: fullPrompt,
        size: pickImageSize(args.format),
        n: 1,
      }),
    });

    if (!imgResp.ok) {
      const t = await imgResp.text();
      console.error("[image-gen] error", imgResp.status, t);
      return JSON.stringify({ error: `Image generation failed: ${imgResp.status}` });
    }

    const imgData = await imgResp.json();
    const base64 = imgData?.data?.[0]?.b64_json;
    if (!base64) {
      return JSON.stringify({ error: "Brak obrazu w odpowiedzi" });
    }
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const fileKey = `${userId}/${args.format}/${crypto.randomUUID()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("marketing-assets")
      .upload(fileKey, bytes, { contentType: "image/png", upsert: false });
    if (uploadErr) {
      console.error("[image-gen] upload error", uploadErr);
      return JSON.stringify({ error: `Upload failed: ${uploadErr.message}` });
    }

    const { data: pub } = supabase.storage.from("marketing-assets").getPublicUrl(fileKey);

    // Save to library
    const { error: insertErr } = await supabase.from("generated_content").insert({
      created_by: userId,
      content_type: "image",
      category: args.format,
      prompt: args.prompt,
      file_key: fileKey,
      metadata: { title: args.title, dimensions: dims },
    });
    if (insertErr) console.error("[image-gen] db insert error", insertErr);

    console.log("[image-gen] done", fileKey);
    return JSON.stringify({
      success: true,
      file_key: fileKey,
      public_url: pub.publicUrl,
      format: args.format,
      title: args.title,
      message: `Obraz wygenerowany i zapisany w bibliotece. Format: ${args.format} (${dims.width}×${dims.height}).`,
    });
  }

  return JSON.stringify({ error: "Unknown tool" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    // Admin check via service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Agentic loop with tool calling — non-streaming for simplicity in tool-call rounds,
    // then stream the final text response
    const conversation: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const MAX_TOOL_ROUNDS = 5;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: conversation,
          tools: TOOLS,
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit. Spróbuj za chwilę." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (resp.status === 402) {
          return new Response(JSON.stringify({ error: "Brak kredytów OpenAI. Doładuj billing w platform.openai.com." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await resp.text();
        console.error("OpenAI error", resp.status, t);
        return new Response(JSON.stringify({ error: "AI provider error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) {
        return new Response(JSON.stringify({ error: "Empty AI response" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // Final answer — save text response to library if substantial
        const finalText = msg.content ?? "";
        if (finalText.length > 50) {
          const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
          await supabase.from("generated_content").insert({
            created_by: userId,
            content_type: "text",
            category: "chat_response",
            prompt: lastUserMsg?.content?.slice(0, 500) ?? "",
            result_text: finalText,
            metadata: {},
          });
        }
        return new Response(JSON.stringify({ message: finalText, tool_rounds: round }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Execute tools and append results
      conversation.push(msg);
      for (const tc of toolCalls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = await executeToolCall(tc.function.name, args, supabase, userId);
        conversation.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    return new Response(JSON.stringify({ error: "Too many tool rounds" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("content-generator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
